// Tipos compartilhados entre o processo principal, o preload e a interface.

export type Preset = 'asterisk' | 'kamailio' | 'generic'
export type SipProviderName = 'sipjs' | 'jssip'
export type DtmfMode = 'auto' | 'sip-info' | 'rtp-event'

export interface QuickDial {
  label: string
  number: string
}

export interface Account {
  id: string
  name: string
  color: string
  preset: Preset
  provider: SipProviderName
  domain: string
  extension: string
  authUsername?: string
  displayName?: string
  wssUrl: string
  /** URLs de STUN/TURN separadas por vírgula, ex.: "stun:stun.l.google.com:19302". */
  iceServers: string
  dtmfMode: DtmfMode
  autoRegister: boolean
  autoAnswer: { enabled: boolean; delayMs: number }
  /** Liga o modo debug do easy-sipjs e mostra o SIP bruto no log. */
  rawSipLog: boolean
  /** Usa o motor simulado em vez de um PBX real. */
  simulated: boolean
  quickDials: QuickDial[]
}

export interface AccountsFile {
  schemaVersion: 1
  accounts: Account[]
}

export interface Settings {
  schemaVersion: 1
  /** Hosts cujo certificado TLS inválido o usuário aceitou explicitamente (RF-37). */
  trustedHosts: string[]
  audioInputId?: string
  audioOutputId?: string
}

/** Formato do arquivo de exportação de contas (RF-07). */
export interface AccountsExport {
  format: 'iris/accounts'
  schemaVersion: 1
  exportedAt: string
  accounts: Array<Account & { password?: string }>
}

export interface CertificateErrorEvent {
  host: string
  error: string
}

/** API exposta pelo preload em `window.iris`. Cada método mapeia um canal fixo de IPC. */
export interface IrisApi {
  accounts: {
    load(): Promise<Account[]>
    save(accounts: Account[]): Promise<void>
  }
  secrets: {
    get(accountId: string): Promise<string | null>
    set(accountId: string, password: string | null): Promise<void>
    encryptionAvailable(): Promise<boolean>
  }
  settings: {
    load(): Promise<Settings>
    save(settings: Settings): Promise<void>
  }
  files: {
    saveText(defaultName: string, content: string): Promise<string | null>
    openText(): Promise<string | null>
  }
  notify(title: string, body: string): void
  onCertificateError(listener: (event: CertificateErrorEvent) => void): () => void
  appInfo(): Promise<{ version: string; platform: string; electron: string; chrome: string }>
}

export const IPC = {
  accountsLoad: 'accounts:load',
  accountsSave: 'accounts:save',
  secretsGet: 'secrets:get',
  secretsSet: 'secrets:set',
  secretsAvailable: 'secrets:available',
  settingsLoad: 'settings:load',
  settingsSave: 'settings:save',
  filesSaveText: 'files:save-text',
  filesOpenText: 'files:open-text',
  notify: 'app:notify',
  appInfo: 'app:info',
  certificateError: 'cert:error'
} as const
