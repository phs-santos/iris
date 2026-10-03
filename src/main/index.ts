import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, session, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC, type Account, type Settings } from '@shared/types'
import {
    encryptionAvailable,
    getSecret,
    loadAccounts,
    loadSettings,
    saveAccounts,
    saveSettings,
    setSecret
} from './storage'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trustedHosts = new Set<string>()

// Pasta de dados alternativa, usada pelos testes de ponta a ponta e para rodar perfis separados.
if (process.env['IRIS_USER_DATA']) app.setPath('userData', process.env['IRIS_USER_DATA'])

// Microfone falso do Chromium, para testes automatizados sem placa de som.
if (process.env['IRIS_FAKE_MEDIA']) app.commandLine.appendSwitch('use-fake-device-for-media-stream')

if (!app.requestSingleInstanceLock()) {
    app.quit()
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1360,
        height: 820,
        minWidth: 1024,
        minHeight: 640,
        title: 'Íris',
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

    if (process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
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
    ipcMain.handle(IPC.accountsLoad, () => loadAccounts())
    ipcMain.handle(IPC.accountsSave, (_e, accounts: Account[]) => saveAccounts(accounts))
    ipcMain.handle(IPC.secretsGet, (_e, id: string) => getSecret(id))
    ipcMain.handle(IPC.secretsSet, (_e, id: string, password: string | null) => setSecret(id, password))
    ipcMain.handle(IPC.secretsAvailable, () => encryptionAvailable())
    ipcMain.handle(IPC.settingsLoad, () => loadSettings())
    ipcMain.handle(IPC.settingsSave, async (_e, settings: Settings) => {
        await saveSettings(settings)
        trustedHosts = new Set(settings.trustedHosts)
    })

    ipcMain.handle(IPC.filesSaveText, async (_e, defaultName: string, content: string) => {
        if (!mainWindow) return null
        const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName })
        if (result.canceled || !result.filePath) return null
        await fs.writeFile(result.filePath, content, 'utf8')
        return result.filePath
    })
    ipcMain.handle(IPC.filesOpenText, async () => {
        if (!mainWindow) return null
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePaths[0]) return null
        return fs.readFile(result.filePaths[0], 'utf8')
    })

    ipcMain.on(IPC.notify, (_e, title: string, body: string) => {
        if (!Notification.isSupported()) return
        const notification = new Notification({ title, body })
        notification.on('click', showWindow)
        notification.show()
    })

    ipcMain.handle(IPC.appInfo, () => ({
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron,
        chrome: process.versions.chrome
    }))
}

app.on('second-instance', showWindow)

app.whenReady().then(async () => {
    trustedHosts = new Set((await loadSettings()).trustedHosts)
    setupSecurity()
    registerIpc()
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
