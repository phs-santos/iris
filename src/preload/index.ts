import { contextBridge, ipcRenderer } from 'electron'
import type { NotificationAction } from '@shared/notifications'
import type { ShortcutAction } from '@shared/shortcuts'
import { IPC, type IrisApi, type CertificateErrorEvent, type NativeSipEvent, type UpdateStatus } from '@shared/types'

// A interface só alcança o sistema por estes canais fixos (RNF-08).
const api: IrisApi = {
    accounts: {
        load: () => ipcRenderer.invoke(IPC.accountsLoad),
        save: (accounts) => ipcRenderer.invoke(IPC.accountsSave, accounts)
    },
    contacts: {
        load: () => ipcRenderer.invoke(IPC.contactsLoad),
        save: (contacts) => ipcRenderer.invoke(IPC.contactsSave, contacts)
    },
    servers: {
        load: () => ipcRenderer.invoke(IPC.serversLoad),
        save: (servers) => ipcRenderer.invoke(IPC.serversSave, servers)
    },
    secrets: {
        get: (id) => ipcRenderer.invoke(IPC.secretsGet, id),
        set: (id, password) => ipcRenderer.invoke(IPC.secretsSet, id, password),
        status: () => ipcRenderer.invoke(IPC.secretsStatus)
    },
    settings: {
        load: () => ipcRenderer.invoke(IPC.settingsLoad),
        update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
    },
    files: {
        saveText: (name, content) => ipcRenderer.invoke(IPC.filesSaveText, name, content),
        openText: (kind) => ipcRenderer.invoke(IPC.filesOpenText, kind)
    },
    audio: {
        openRecordings: () => ipcRenderer.invoke(IPC.audioOpenRecordings)
    },
    notify: (request) => ipcRenderer.send(IPC.notify, request),
    closeNotification: (callId) => ipcRenderer.send(IPC.notifyClose, callId),
    focusWindow: () => ipcRenderer.send(IPC.focusWindow),
    onNotificationAction: (listener) => {
        const handler = (_e: Electron.IpcRendererEvent, callId: string, action: NotificationAction): void =>
            listener(callId, action)
        ipcRenderer.on(IPC.notifyAction, handler)
        return () => ipcRenderer.removeListener(IPC.notifyAction, handler)
    },
    links: {
        take: () => ipcRenderer.invoke(IPC.linksTake),
        onArrived: (listener) => {
            const handler = (): void => listener()
            ipcRenderer.on(IPC.linksArrived, handler)
            return () => ipcRenderer.removeListener(IPC.linksArrived, handler)
        },
        status: () => ipcRenderer.invoke(IPC.linksStatus),
        setDefault: (kind, on) => ipcRenderer.invoke(IPC.linksSetDefault, kind, on)
    },
    shortcuts: {
        failed: () => ipcRenderer.invoke(IPC.shortcutsFailed),
        mediaKeyFailed: () => ipcRenderer.invoke(IPC.mediaKeyFailed),
        onFired: (listener) => {
            const handler = (_e: Electron.IpcRendererEvent, action: ShortcutAction): void => listener(action)
            ipcRenderer.on(IPC.shortcutFired, handler)
            return () => ipcRenderer.removeListener(IPC.shortcutFired, handler)
        }
    },
    net: {
        diagnose: (request) => ipcRenderer.invoke(IPC.netDiagnose, request)
    },
    setTray: (counts) => ipcRenderer.send(IPC.tray, counts),
    logError: (text) => ipcRenderer.send(IPC.logError, text),
    setWindowMode: (mode) => ipcRenderer.invoke(IPC.windowMode, mode),
    onCertificateError: (listener) => {
        const handler = (_e: Electron.IpcRendererEvent, event: CertificateErrorEvent): void => listener(event)
        ipcRenderer.on(IPC.certificateError, handler)
        return () => ipcRenderer.removeListener(IPC.certificateError, handler)
    },
    update: {
        info: () => ipcRenderer.invoke(IPC.updateInfo),
        setChannel: (channel) => ipcRenderer.invoke(IPC.updateSetChannel, channel),
        check: () => ipcRenderer.invoke(IPC.updateCheck),
        download: () => ipcRenderer.invoke(IPC.updateDownload),
        install: () => ipcRenderer.invoke(IPC.updateInstall),
        openDownloadPage: () => ipcRenderer.invoke(IPC.updateOpenDownload),
        onStatus: (listener) => {
            const handler = (_e: Electron.IpcRendererEvent, status: UpdateStatus): void => listener(status)
            ipcRenderer.on(IPC.updateStatus, handler)
            return () => ipcRenderer.removeListener(IPC.updateStatus, handler)
        }
    },
    sip: {
        start: (engineId, config, password) => ipcRenderer.invoke(IPC.sipStart, engineId, config, password),
        stop: (engineId) => ipcRenderer.invoke(IPC.sipStop, engineId),
        health: (engineId) => ipcRenderer.invoke(IPC.sipHealth, engineId),
        dial: (engineId, destination, headers) => ipcRenderer.invoke(IPC.sipDial, engineId, destination, headers),
        callAction: (engineId, callId, action) => ipcRenderer.invoke(IPC.sipCallAction, engineId, callId, action),
        callStats: (engineId, callId) => ipcRenderer.invoke(IPC.sipCallStats, engineId, callId),
        callLevel: (engineId, callId) => ipcRenderer.invoke(IPC.sipCallLevel, engineId, callId),
        record: (engineId, callId, on) => ipcRenderer.invoke(IPC.sipRecord, engineId, callId, on),
        sendAudio: (engineId, callId, pcm) => ipcRenderer.send(IPC.sipAudio, engineId, callId, pcm),
        onEvent: (listener) => {
            const handler = (_e: Electron.IpcRendererEvent, event: NativeSipEvent): void => listener(event)
            ipcRenderer.on(IPC.sipEvent, handler)
            return () => ipcRenderer.removeListener(IPC.sipEvent, handler)
        }
    },
    appInfo: () => ipcRenderer.invoke(IPC.appInfo)
}

contextBridge.exposeInMainWorld('iris', api)
