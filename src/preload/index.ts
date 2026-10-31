import { contextBridge, ipcRenderer } from 'electron'
import type { NotificationAction } from '@shared/notifications'
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
    tags: {
        load: () => ipcRenderer.invoke(IPC.tagsLoad),
        save: (tags) => ipcRenderer.invoke(IPC.tagsSave, tags)
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
    net: {
        diagnose: (request) => ipcRenderer.invoke(IPC.netDiagnose, request)
    },
    setTray: (counts) => ipcRenderer.send(IPC.tray, counts),
    logError: (text) => ipcRenderer.send(IPC.logError, text),
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
        probe: (domain, transport, server) => ipcRenderer.invoke(IPC.sipProbe, domain, transport, server),
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
