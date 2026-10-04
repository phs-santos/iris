import { contextBridge, ipcRenderer } from 'electron'
import type { LoadProgress } from '@shared/load'
import { IPC, type IrisApi, type CertificateErrorEvent, type NativeSipEvent, type UpdateStatus } from '@shared/types'

// A interface só alcança o sistema por estes canais fixos (RNF-08).
const api: IrisApi = {
    accounts: {
        load: () => ipcRenderer.invoke(IPC.accountsLoad),
        save: (accounts) => ipcRenderer.invoke(IPC.accountsSave, accounts)
    },
    scenarios: {
        load: () => ipcRenderer.invoke(IPC.scenariosLoad),
        save: (scenarios) => ipcRenderer.invoke(IPC.scenariosSave, scenarios)
    },
    history: {
        load: () => ipcRenderer.invoke(IPC.historyLoad),
        save: (entries) => ipcRenderer.invoke(IPC.historySave, entries)
    },
    secrets: {
        get: (id) => ipcRenderer.invoke(IPC.secretsGet, id),
        set: (id, password) => ipcRenderer.invoke(IPC.secretsSet, id, password),
        status: () => ipcRenderer.invoke(IPC.secretsStatus),
        migrate: () => ipcRenderer.invoke(IPC.secretsMigrate)
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
        pickWav: () => ipcRenderer.invoke(IPC.audioPickWav),
        loadWav: (path) => ipcRenderer.invoke(IPC.audioLoadWav, path)
    },
    notify: (title, body) => ipcRenderer.send(IPC.notify, title, body),
    net: {
        diagnose: (request) => ipcRenderer.invoke(IPC.netDiagnose, request)
    },
    monitor: {
        webhook: (url, payload) => ipcRenderer.invoke(IPC.monitorWebhook, url, payload)
    },
    setTray: (counts) => ipcRenderer.send(IPC.tray, counts),
    logError: (text) => ipcRenderer.send(IPC.logError, text),
    cli: {
        config: () => ipcRenderer.invoke(IPC.cliConfig),
        print: (line, error) => ipcRenderer.send(IPC.cliPrint, line, Boolean(error)),
        writeReport: (content) => ipcRenderer.invoke(IPC.cliReport, content),
        finish: (code) => ipcRenderer.send(IPC.cliFinish, code)
    },
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
    ai: {
        status: () => ipcRenderer.invoke(IPC.aiStatus),
        setKey: (key) => ipcRenderer.invoke(IPC.aiSetKey, key),
        setOptions: (options) => ipcRenderer.invoke(IPC.aiSetOptions, options),
        models: () => ipcRenderer.invoke(IPC.aiModels),
        explain: (request) => ipcRenderer.invoke(IPC.aiExplain, request)
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
        request: (engineId, request) => ipcRenderer.invoke(IPC.sipRequest, engineId, request),
        exportPcap: (engineId, withRtp) => ipcRenderer.invoke(IPC.sipPcap, engineId, withRtp),
        loadStart: (engineId, spec) => ipcRenderer.invoke(IPC.sipLoadStart, engineId, spec),
        loadStop: (engineId) => ipcRenderer.invoke(IPC.sipLoadStop, engineId),
        onLoadProgress: (listener) => {
            const handler = (_e: Electron.IpcRendererEvent, engineId: string, progress: LoadProgress): void =>
                listener(engineId, progress)
            ipcRenderer.on(IPC.sipLoadProgress, handler)
            return () => ipcRenderer.removeListener(IPC.sipLoadProgress, handler)
        },
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
