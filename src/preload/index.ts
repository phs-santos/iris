import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BenchApi, type CertificateErrorEvent } from '@shared/types'

// A interface só alcança o sistema por estes canais fixos (RNF-08).
const api: BenchApi = {
  accounts: {
    load: () => ipcRenderer.invoke(IPC.accountsLoad),
    save: (accounts) => ipcRenderer.invoke(IPC.accountsSave, accounts)
  },
  secrets: {
    get: (id) => ipcRenderer.invoke(IPC.secretsGet, id),
    set: (id, password) => ipcRenderer.invoke(IPC.secretsSet, id, password),
    encryptionAvailable: () => ipcRenderer.invoke(IPC.secretsAvailable)
  },
  settings: {
    load: () => ipcRenderer.invoke(IPC.settingsLoad),
    save: (settings) => ipcRenderer.invoke(IPC.settingsSave, settings)
  },
  files: {
    saveText: (name, content) => ipcRenderer.invoke(IPC.filesSaveText, name, content),
    openText: () => ipcRenderer.invoke(IPC.filesOpenText)
  },
  notify: (title, body) => ipcRenderer.send(IPC.notify, title, body),
  onCertificateError: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, event: CertificateErrorEvent): void => listener(event)
    ipcRenderer.on(IPC.certificateError, handler)
    return () => ipcRenderer.removeListener(IPC.certificateError, handler)
  },
  appInfo: () => ipcRenderer.invoke(IPC.appInfo)
}

contextBridge.exposeInMainWorld('bench', api)
