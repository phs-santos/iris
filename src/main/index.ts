import { app, BrowserWindow, dialog, Menu, nativeImage, Notification, session, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import appIcon from '../../resources/icon.png?asset'
import { IPC, type Account, type SettingsPatch } from '@shared/types'
import {
    getSecret,
    discardLegacyData,
    loadAccounts,
    loadContacts,
    saveContacts,
    loadServers,
    saveServers,
    loadSettings,
    saveAccounts,
    secretsStatus,
    setSecret,
    updateSettings
} from './storage'
import { check, handle, isPlainObject, isString, on, rendererUrl } from './ipc-guard'
import { setupUpdater } from './updater'
import { isAppearance } from '@shared/appearance'
import { isReconnect } from '@shared/reconnect'
import { isNotificationSettings, isNotifyRequest, type NotificationAction } from '@shared/notifications'
import { CONTACTS_LIMIT, isContact, type Contact } from '@shared/contacts'
import { isSipServer, type SipServer } from '@shared/servers'
import { isTrayCounts, traySummary, type TrayState } from '@shared/tray'
import { isRingVolume } from '@shared/ringtones'
import { appLog, describeError, startAppLog } from './app-log'
import { registerNativeSipIpc } from './native-sip'
import { diagnoseNetwork } from './net-diag'
import { isNetDiagRequest, type NetDiagRequest } from '@shared/net-diag'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const BENCH_MIN = { width: 1024, height: 640 }

let quitting = false
let trustedHosts = new Set<string>()

// Pasta de dados alternativa, usada pelos testes de ponta a ponta e para rodar perfis separados.
if (process.env['IRIS_USER_DATA']) app.setPath('userData', process.env['IRIS_USER_DATA'])

// Microfone falso do Chromium, para testes automatizados sem placa de som.
if (process.env['IRIS_FAKE_MEDIA']) app.commandLine.appendSwitch('use-fake-device-for-media-stream')

// Log interno em arquivo (RNF-14), ligado antes de tudo para pegar também as falhas da abertura.
startAppLog(join(app.getPath('userData'), 'logs'))
process.on('uncaughtException', (error) => appLog('error', `Erro não tratado: ${describeError(error)}`))
process.on('unhandledRejection', (reason) => appLog('error', `Promessa rejeitada: ${describeError(reason)}`))
app.on('render-process-gone', (_e, _wc, details) =>
    appLog('error', `A interface caiu: ${details.reason} (código ${details.exitCode})`)
)
app.on('child-process-gone', (_e, details) =>
    appLog('error', `Processo ${details.type} caiu: ${details.reason} (código ${details.exitCode})`)
)

// Nada da Íris usa o cofre de senhas do sistema (Chaves do macOS, Secret Service do Linux): as senhas
// ficam no arquivo próprio (RNF-07). Sem estas opções o Chromium ainda abriria o cofre por conta própria
// e o macOS pediria a senha de login, decisão do usuário em 04/10/2026.
app.commandLine.appendSwitch('use-mock-keychain')
app.commandLine.appendSwitch('password-store', 'basic')

if (!app.requestSingleInstanceLock()) {
    app.quit()
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1360,
        height: 820,
        minWidth: BENCH_MIN.width,
        minHeight: BENCH_MIN.height,
        title: 'Íris',
        icon: appIcon,
        backgroundColor: '#eef2f6',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // Chamadas recebidas precisam tocar e atender mesmo com a janela em segundo plano.
            backgroundThrottling: false
        }
    })

    mainWindow.once('ready-to-show', () => mainWindow?.show())

    // Fechar a janela só a esconde: registros e chamadas continuam ativos (RF-33).
    mainWindow.on('close', (event) => {
        if (!quitting && tray) {
            event.preventDefault()
            mainWindow?.hide()
        }
    })

    // A interface nunca navega para fora nem abre janelas; links externos vão para o navegador.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url)
        return { action: 'deny' }
    })
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
    })

    void mainWindow.loadURL(rendererUrl())
}

function showWindow(): void {
    if (!mainWindow) return createWindow()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
}

/** Ícone da bandeja para cada estado (RF-33); o Electron acha o `@2x` ao lado para telas retina. */
function trayIcon(state: TrayState): Electron.NativeImage {
    const image = nativeImage.createFromPath(join(__dirname, `../../resources/tray-${state}.png`))
    // Sem o arquivo (instalação estragada), o ícone do app em miniatura ainda deixa a bandeja usável.
    return image.isEmpty() ? nativeImage.createFromPath(appIcon).resize({ width: 16, height: 16 }) : image
}

let trayState: TrayState = 'idle'

function createTray(): void {
    try {
        tray = new Tray(trayIcon(trayState))
        tray.setToolTip('Íris')
        tray.setContextMenu(
            Menu.buildFromTemplate([
                { label: 'Mostrar Íris', click: showWindow },
                { type: 'separator' },
                {
                    label: 'Sair',
                    click: () => {
                        quitting = true
                        app.quit()
                    }
                }
            ])
        )
        tray.on('click', showWindow)
    } catch {
        // Alguns ambientes Linux não têm área de notificação; sem bandeja, fechar a janela encerra o app.
        tray = null
    }
}

function setupSecurity(): void {
    const ses = session.defaultSession

    // Só microfone, saída de áudio e notificações são liberados para a interface.
    const allowed = new Set(['media', 'speaker-selection', 'notifications'])
    ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
        if (permission === 'media') {
            const types = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? []
            return callback(types.every((t) => t === 'audio'))
        }
        callback(allowed.has(permission))
    })
    ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

// Certificados inválidos são recusados, exceto nos hosts que o usuário aceitou (RF-37, RNF-09).
// O evento vale também para o WebSocket do SIP e é consultado a cada nova conexão,
// então aceitar um host passa a valer sem reiniciar o app.
app.on('certificate-error', (event, _webContents, url, error, _certificate, callback) => {
    let host = ''
    try {
        host = new URL(url).hostname
    } catch {
        return callback(false)
    }
    if (trustedHosts.has(host)) {
        event.preventDefault()
        return callback(true)
    }
    mainWindow?.webContents.send(IPC.certificateError, { host, error })
    callback(false)
})

function registerIpc(): void {
    const isList = (v: unknown, max = 1000): v is unknown[] => Array.isArray(v) && v.length <= max
    const isId = (v: unknown): v is string => isString(v, 200) && v.length > 0

    handle(IPC.accountsLoad, () => loadAccounts())
    handle(IPC.accountsSave, (_e, accounts: Account[]) => {
        check(isList(accounts) && accounts.every((a) => isPlainObject(a) && isId(a.id)), 'lista de contas')
        return saveAccounts(accounts)
    })
    handle(IPC.contactsLoad, () => loadContacts())
    handle(IPC.contactsSave, (_e, contacts: Contact[]) => {
        check(isList(contacts, CONTACTS_LIMIT) && contacts.every(isContact), 'lista de contatos')
        return saveContacts(contacts)
    })
    handle(IPC.serversLoad, () => loadServers())
    handle(IPC.serversSave, (_e, servers: SipServer[]) => {
        check(isList(servers, 500) && servers.every(isSipServer), 'lista de servidores')
        return saveServers(servers)
    })
    handle(IPC.secretsGet, (_e, id: string) => {
        check(isId(id), 'id da conta')
        return getSecret(id)
    })
    handle(IPC.secretsSet, (_e, id: string, password: string | null) => {
        check(isId(id) && (password === null || isString(password, 1000)), 'senha')
        return setSecret(id, password)
    })
    handle(IPC.secretsStatus, () => secretsStatus())
    handle(IPC.settingsLoad, () => loadSettings())
    // A interface manda só os campos que mudou; os outros (canal de atualização) ela não alcança.
    const patchKeys = [
        'trustedHosts',
        'audioInputId',
        'audioOutputId',
        'ringVolume',
        'appearance',
        'reconnect',
        'notifications'
    ]
    const isDeviceId = (v: unknown): boolean => v === undefined || isString(v, 500)
    handle(IPC.settingsUpdate, async (_e, patch: SettingsPatch) => {
        check(
            isPlainObject(patch) &&
                Object.keys(patch).every((k) => patchKeys.includes(k)) &&
                (patch.trustedHosts === undefined ||
                    (isList(patch.trustedHosts, 200) && patch.trustedHosts.every((h) => isString(h, 255)))) &&
                isDeviceId(patch.audioInputId) &&
                isDeviceId(patch.audioOutputId) &&
                isRingVolume(patch.ringVolume) &&
                isAppearance(patch.appearance) &&
                isReconnect(patch.reconnect) &&
                isNotificationSettings(patch.notifications),
            'preferências'
        )
        const settings = await updateSettings(patch)
        trustedHosts = new Set(settings.trustedHosts)
        return settings
    })

    handle(IPC.filesSaveText, async (_e, defaultName: string, content: string) => {
        check(isString(defaultName, 255) && isString(content, 200_000_000), 'arquivo')
        if (!mainWindow) return null
        // Só o nome do arquivo sugerido; a pasta é sempre o usuário quem escolhe no diálogo.
        const result = await dialog.showSaveDialog(mainWindow, { defaultPath: basename(defaultName) })
        if (result.canceled || !result.filePath) return null
        await fs.writeFile(result.filePath, content, 'utf8')
        return result.filePath
    })
    handle(IPC.filesOpenText, async (_e, kind?: 'json' | 'csv') => {
        check(kind === undefined || kind === 'json' || kind === 'csv', 'tipo de arquivo')
        if (!mainWindow) return null
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                kind === 'csv' ? { name: 'CSV', extensions: ['csv', 'txt'] } : { name: 'JSON', extensions: ['json'] }
            ]
        })
        if (result.canceled || !result.filePaths[0]) return null
        const info = await fs.stat(result.filePaths[0])
        check(info.size <= 20_000_000, 'arquivo de até 20 MB')
        return fs.readFile(result.filePaths[0], 'utf8')
    })

    // Pasta das gravações (RF-36): criada se ainda não existe, para o botão não abrir um erro.
    handle(IPC.audioOpenRecordings, async () => {
        const dir = join(app.getPath('userData'), 'gravacoes')
        await fs.mkdir(dir, { recursive: true })
        const error = await shell.openPath(dir)
        if (error) throw new Error(error)
    })

    // Notificações do sistema. A de chamada recebida tem Atender e Recusar (no macOS) e fica guardada
    // pelo id da chamada, para sumir quando ela for atendida em outro lugar.
    const ringing = new Map<string, Notification>()
    const act = (callId: string, action: NotificationAction): void => {
        ringing.get(callId)?.close()
        ringing.delete(callId)
        if (action !== 'reject') showWindow()
        mainWindow?.webContents.send(IPC.notifyAction, callId, action)
    }
    on(IPC.notify, (_e, request: unknown) => {
        if (!isNotifyRequest(request)) return
        const { kind, title, body, callId } = request
        // Uma linha no log interno: quando alguém diz que não viu o aviso, dá para saber se ele saiu.
        // Sem serviço de notificações (alguns Linux, o CI), a linha diz isso em vez de sumir.
        appLog('info', `Notificação ${kind}: ${title}${callId ? ` (${callId})` : ''}`)
        if (!Notification.isSupported())
            return appLog('info', 'O sistema não mostra notificações: o aviso não apareceu')
        const call = kind === 'incoming' && callId
        const notification = new Notification({
            title,
            body,
            urgency: call ? 'critical' : 'normal',
            actions: call
                ? [
                      { type: 'button', text: 'Atender' },
                      { type: 'button', text: 'Recusar' }
                  ]
                : []
        })
        if (call) {
            ringing.get(callId)?.close()
            ringing.set(callId, notification)
            notification.on('action', (_event, index) => act(callId, index === 0 ? 'answer' : 'reject'))
            notification.on('click', () => act(callId, 'open'))
            notification.on('close', () => ringing.delete(callId))
        } else notification.on('click', showWindow)
        notification.show()
    })
    on(IPC.notifyClose, (_e, callId: unknown) => {
        if (!isString(callId, 200)) return
        ringing.get(callId)?.close()
        ringing.delete(callId)
    })
    // Chamada recebida traz a janela para a frente, se o usuário pediu (Configurações → Notificações).
    on(IPC.focusWindow, () => {
        showWindow()
        mainWindow?.moveTop()
    })

    handle(IPC.netDiagnose, (_e, request: NetDiagRequest) => {
        check(isNetDiagRequest(request), 'diagnóstico de rede')
        return diagnoseNetwork(request)
    })

    on(IPC.tray, (_e, counts: unknown) => {
        if (!isTrayCounts(counts)) return
        if (!tray) return
        const { state, tooltip } = traySummary(counts)
        tray.setToolTip(tooltip)
        if (state === trayState) return
        trayState = state
        tray.setImage(trayIcon(state))
    })
    on(IPC.logError, (_e, text: unknown) => {
        if (isString(text, 20_000)) appLog('error', `Interface: ${text}`)
    })

    handle(IPC.appInfo, () => ({
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron,
        chrome: process.versions.chrome
    }))

    // TLS do motor próprio (RF-39): mesma lista de hosts aceitos e mesmo aviso do WebSocket (RF-37).
    registerNativeSipIpc({
        isTrustedHost: (host) => trustedHosts.has(host),
        onCertificateError: (host, error) => mainWindow?.webContents.send(IPC.certificateError, { host, error })
    })
}

app.on('second-instance', () => showWindow())

app.whenReady().then(async () => {
    appLog(
        'info',
        `Íris ${app.getVersion()} abriu (${process.platform} ${process.arch}, Electron ${process.versions.electron})`
    )
    // Dados de versões anteriores à 2.0 são descartados antes de qualquer leitura. Uma falha aqui não
    // impede a janela de abrir: os arquivos antigos caem no caminho de arquivo estragado (RNF-19).
    await discardLegacyData().then(
        (discarded) => discarded && appLog('info', 'Dados de uma versão anterior à 2.0 descartados'),
        (error) => appLog('error', `Dados antigos não descartados: ${describeError(error)}`)
    )
    // Um erro ao ler as preferências não pode impedir a janela de abrir nem os canais de existir.
    const saved = await loadSettings().catch((error) => {
        appLog('error', `Preferências não carregadas: ${describeError(error)}`)
        return null
    })
    trustedHosts = new Set(saved?.trustedHosts ?? [])
    setupSecurity()
    registerIpc()
    // Empacotado, o macOS usa o .icns do bundle; em dev o Dock mostraria o ícone do Electron.
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
    // Antes da janela: a interface pede o estado da atualização assim que abre.
    setupUpdater({
        send: (status) => mainWindow?.webContents.send(IPC.updateStatus, status),
        // Sem isto, fechar a janela só a esconderia (RF-33) e a instalação não começaria.
        beforeInstall: () => (quitting = true)
    })
    createWindow()
    createTray()

    app.on('activate', showWindow)
})

app.on('before-quit', () => {
    quitting = true
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
