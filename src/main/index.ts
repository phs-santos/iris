import { app, BrowserWindow, dialog, Menu, nativeImage, Notification, session, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import appIcon from '../../resources/icon.png?asset'
import { IPC, type Account, type Scenario, type Settings } from '@shared/types'
import {
    encryptionAvailable,
    getSecret,
    loadAccounts,
    loadScenarios,
    loadSettings,
    saveAccounts,
    saveScenarios,
    saveSettings,
    setSecret
} from './storage'
import { cliOptions, createCliWindow, prepareCli, registerCliIpc } from './cli'
import { check, handle, isPlainObject, isString, on, rendererUrl } from './ipc-guard'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trustedHosts = new Set<string>()

// Pasta de dados alternativa, usada pelos testes de ponta a ponta e para rodar perfis separados.
if (process.env['IRIS_USER_DATA']) app.setPath('userData', process.env['IRIS_USER_DATA'])

// Microfone falso do Chromium, para testes automatizados sem placa de som.
if (process.env['IRIS_FAKE_MEDIA']) app.commandLine.appendSwitch('use-fake-device-for-media-stream')

// Linha de comando (RF-31): sem janela visível, sem bandeja e sem trava de instância única.
const cli = prepareCli()

if (!cli && !app.requestSingleInstanceLock()) {
    app.quit()
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1360,
        height: 820,
        minWidth: 1024,
        minHeight: 640,
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

/** Ícone de bandeja desenhado em memória: um círculo verde de 16 px. */
function trayIcon(): Electron.NativeImage {
    const size = 16
    const buf = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const d = Math.hypot(x - 7.5, y - 7.5)
            const i = (y * size + x) * 4
            if (d <= 6.5) {
                // BGRA
                buf[i] = 0x86
                buf[i + 1] = 0xcf
                buf[i + 2] = 0x3f
                buf[i + 3] = 0xff
            }
        }
    }
    return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function createTray(): void {
    try {
        tray = new Tray(trayIcon())
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
    handle(IPC.scenariosLoad, () => loadScenarios())
    handle(IPC.scenariosSave, (_e, scenarios: Scenario[]) => {
        check(isList(scenarios) && scenarios.every((s) => isPlainObject(s) && isId(s.id)), 'lista de cenários')
        return saveScenarios(scenarios)
    })
    handle(IPC.secretsGet, (_e, id: string) => {
        check(isId(id), 'id da conta')
        return getSecret(id)
    })
    // Com --contas, as senhas do arquivo ficam só na memória desta execução.
    handle(IPC.secretsSet, (_e, id: string, password: string | null) => {
        check(isId(id) && (password === null || isString(password, 1000)), 'senha')
        return setSecret(id, password, !cliOptions?.accountsFile)
    })
    if (!cli) handle(IPC.cliConfig, () => null)
    handle(IPC.secretsAvailable, () => encryptionAvailable())
    handle(IPC.settingsLoad, () => loadSettings())
    handle(IPC.settingsSave, async (_e, settings: Settings) => {
        check(
            isPlainObject(settings) &&
                isList(settings.trustedHosts, 200) &&
                settings.trustedHosts.every((h) => isString(h, 255)),
            'preferências'
        )
        await saveSettings(settings)
        trustedHosts = new Set(settings.trustedHosts)
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
    handle(IPC.filesOpenText, async () => {
        if (!mainWindow) return null
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePaths[0]) return null
        return fs.readFile(result.filePaths[0], 'utf8')
    })

    on(IPC.notify, (_e, title: string, body: string) => {
        if (!Notification.isSupported() || !isString(title, 200) || !isString(body, 1000)) return
        const notification = new Notification({ title, body })
        notification.on('click', showWindow)
        notification.show()
    })

    handle(IPC.appInfo, () => ({
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron,
        chrome: process.versions.chrome
    }))
}

app.on('second-instance', showWindow)

app.whenReady().then(async () => {
    trustedHosts = new Set([...(await loadSettings()).trustedHosts, ...(cliOptions?.trustHosts ?? [])])
    setupSecurity()
    registerIpc()
    if (cli) {
        registerCliIpc()
        createCliWindow(join(__dirname, '../preload/index.js'))
        return
    }
    // Empacotado, o macOS usa o .icns do bundle; em dev o Dock mostraria o ícone do Electron.
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
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
