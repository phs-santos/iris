import { app, BrowserWindow, dialog, Menu, nativeImage, net, Notification, session, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import appIcon from '../../resources/icon.png?asset'
import { IPC, type Account, type Scenario, type SettingsPatch, type WindowMode } from '@shared/types'
import {
    getSecret,
    loadAccounts,
    loadHistory,
    saveHistory,
    loadScenarios,
    loadSettings,
    saveAccounts,
    saveScenarios,
    secretsStatus,
    setSecret,
    migrateLegacySecrets,
    updateSettings
} from './storage'
import { cliOptions, createCliWindow, prepareCli, registerCliIpc } from './cli'
import { check, handle, isPlainObject, isString, on, rendererUrl } from './ipc-guard'
import { setupUpdater } from './updater'
import { AI_SECRET_PREFIX, registerAiIpc } from './ai'
import { isAppearance, isProfile } from '@shared/appearance'
import { isReconnect } from '@shared/reconnect'
import { parseWav, SAMPLE_RATE } from '@shared/audio'
import { isWebhookPayload, isWebhookUrl, type WebhookPayload } from '@shared/monitor'
import { HISTORY_LIMIT, isHistoryEntry, type HistoryEntry } from '@shared/history'
import { isTrayCounts, traySummary, type TrayState } from '@shared/tray'
import { appLog, describeError, startAppLog } from './app-log'
import { registerNativeSipIpc } from './native-sip'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/** Tamanho da Bancada antes de virar Telefone, para voltar ao mesmo lugar. */
let benchBounds: Electron.Rectangle | null = null
const PHONE_SIZE = { width: 380, height: 720 }
const PHONE_MIN = { width: 340, height: 580 }
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

// Linha de comando (RF-31): sem janela visível, sem bandeja e sem trava de instância única.
const cli = prepareCli()

if (!cli && !app.requestSingleInstanceLock()) {
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
        backgroundColor: '#0f1720',
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
    // A chave da IA mora no mesmo cofre, mas a interface não pode ler nem trocar por estes canais (RF-38).
    const isAccountId = (v: unknown): v is string => isId(v) && !v.startsWith(AI_SECRET_PREFIX)

    handle(IPC.accountsLoad, () => loadAccounts())
    handle(IPC.accountsSave, (_e, accounts: Account[]) => {
        check(isList(accounts) && accounts.every((a) => isPlainObject(a) && isId(a.id)), 'lista de contas')
        return saveAccounts(accounts)
    })
    handle(IPC.scenariosLoad, () => loadScenarios())
    handle(IPC.scenariosSave, (_e, scenarios: Scenario[]) => {
        check(isList(scenarios) && scenarios.every((s) => isPlainObject(s) && isId(s.id)), 'lista de cenários')
        return saveScenarios(scenarios)
    })
    handle(IPC.historyLoad, () => loadHistory())
    handle(IPC.historySave, (_e, entries: HistoryEntry[]) => {
        check(isList(entries, HISTORY_LIMIT) && entries.every(isHistoryEntry), 'histórico de chamadas')
        return saveHistory(entries)
    })
    handle(IPC.secretsGet, (_e, id: string) => {
        check(isAccountId(id), 'id da conta')
        return getSecret(id)
    })
    // Com --contas, as senhas do arquivo ficam só na memória desta execução.
    handle(IPC.secretsSet, (_e, id: string, password: string | null) => {
        check(isAccountId(id) && (password === null || isString(password, 1000)), 'senha')
        return setSecret(id, password, !cliOptions?.accountsFile)
    })
    if (!cli) handle(IPC.cliConfig, () => null)
    handle(IPC.secretsStatus, () => secretsStatus())
    handle(IPC.secretsMigrate, () => migrateLegacySecrets())
    handle(IPC.settingsLoad, () => loadSettings())
    // A interface manda só os campos que mudou; os outros (canal de atualização, IA) ela não alcança.
    const patchKeys = ['trustedHosts', 'audioInputId', 'audioOutputId', 'profile', 'appearance', 'reconnect']
    const isDeviceId = (v: unknown): boolean => v === undefined || isString(v, 500)
    handle(IPC.settingsUpdate, async (_e, patch: SettingsPatch) => {
        check(
            isPlainObject(patch) &&
                Object.keys(patch).every((k) => patchKeys.includes(k)) &&
                (patch.trustedHosts === undefined ||
                    (isList(patch.trustedHosts, 200) && patch.trustedHosts.every((h) => isString(h, 255)))) &&
                isDeviceId(patch.audioInputId) &&
                isDeviceId(patch.audioOutputId) &&
                isProfile(patch.profile) &&
                isAppearance(patch.appearance) &&
                isReconnect(patch.reconnect),
            'preferências'
        )
        const settings = await updateSettings(patch)
        trustedHosts = new Set([...settings.trustedHosts, ...(cliOptions?.trustHosts ?? [])])
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

    // WAV dos cenários (RF-41): só arquivos .wav, até 20 MB e 2 minutos de áudio.
    handle(IPC.audioPickWav, async () => {
        if (!mainWindow) return null
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'WAV', extensions: ['wav'] }]
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
    })
    handle(IPC.audioLoadWav, async (_e, path: string) => {
        check(isString(path, 2000) && /\.wav$/i.test(path), 'arquivo WAV')
        const info = await fs.stat(path)
        check(info.isFile() && info.size <= 20_000_000, 'arquivo WAV de até 20 MB')
        return parseWav(await fs.readFile(path)).subarray(0, SAMPLE_RATE * 120)
    })

    on(IPC.notify, (_e, title: string, body: string) => {
        if (!Notification.isSupported() || !isString(title, 200) || !isString(body, 1000)) return
        const notification = new Notification({ title, body })
        notification.on('click', showWindow)
        notification.show()
    })

    // Webhook do monitor (RF-43): só http e https, com o corpo conferido e prazo de 10 s. A interface
    // não abre conexões por conta própria (CSP), então o POST sai daqui.
    handle(IPC.monitorWebhook, async (_e, url: string, payload: WebhookPayload) => {
        check(isString(url, 2000) && isWebhookUrl(url) && isWebhookPayload(payload), 'webhook do monitor')
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        try {
            const response = await net.fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': `Iris/${app.getVersion()}` },
                body: JSON.stringify(payload),
                signal: controller.signal
            })
            return response.status
        } finally {
            clearTimeout(timer)
        }
    })

    on(IPC.tray, (_e, counts: unknown) => {
        if (!tray || !isTrayCounts(counts)) return
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
        onCertificateError: (host, error) => mainWindow?.webContents.send(IPC.certificateError, { host, error }),
        saveFile: async (defaultName, data) => {
            if (!mainWindow) return null
            const result = await dialog.showSaveDialog(mainWindow, { defaultPath: basename(defaultName) })
            if (result.canceled || !result.filePath) return null
            await fs.writeFile(result.filePath, data)
            return result.filePath
        }
    })

    handle(IPC.windowMode, (_e, mode: WindowMode) => {
        check(mode === 'phone' || mode === 'bench', 'modo da janela')
        setWindowMode(mode)
    })
}

function setWindowMode(mode: WindowMode): void {
    if (!mainWindow) return
    const win = mainWindow
    if (win.isFullScreen()) win.setFullScreen(false)
    if (win.isMaximized()) win.unmaximize()
    if (mode === 'phone') {
        if (!benchBounds) benchBounds = win.getBounds()
        const { x, y, width } = win.getBounds()
        win.setMinimumSize(PHONE_MIN.width, PHONE_MIN.height)
        // Encolhe para a direita, onde o telefone fica do lado do que a pessoa estiver fazendo.
        win.setBounds({ x: x + width - PHONE_SIZE.width, y, ...PHONE_SIZE }, true)
    } else {
        win.setMinimumSize(BENCH_MIN.width, BENCH_MIN.height)
        if (benchBounds) win.setBounds(benchBounds, true)
        benchBounds = null
    }
}

app.on('second-instance', showWindow)

app.whenReady().then(async () => {
    appLog(
        'info',
        `Íris ${app.getVersion()} abriu (${process.platform} ${process.arch}, Electron ${process.versions.electron})`
    )
    // Um erro ao ler as preferências não pode impedir a janela de abrir nem os canais de existir.
    const saved = await loadSettings().catch((error) => {
        appLog('error', `Preferências não carregadas: ${describeError(error)}`)
        return null
    })
    trustedHosts = new Set([...(saved?.trustedHosts ?? []), ...(cliOptions?.trustHosts ?? [])])
    setupSecurity()
    registerIpc()
    if (cli) {
        registerCliIpc()
        createCliWindow(join(__dirname, '../preload/index.js'))
        return
    }
    // Empacotado, o macOS usa o .icns do bundle; em dev o Dock mostraria o ícone do Electron.
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
    registerAiIpc()
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
