// Tipos compartilhados entre o processo principal, o preload e a interface.

import type { CliConfig } from './cli'

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

// ─── Cenários (RF-28 a RF-30) ──────────────────────────────────────────────
// Cada chamada aberta por um passo ganha um apelido ("c1"); os passos seguintes se referem a ela por ele.

export type ScenarioCallState = 'ringing' | 'early' | 'established' | 'held' | 'ended'
export type ScenarioCheck = 'code' | 'dtmfReceived' | 'log'

export type ScenarioStep =
    | { type: 'register'; account?: string }
    | { type: 'dial'; account?: string; to: string; call: string }
    | { type: 'answer'; account?: string; call: string; timeoutMs: number }
    | { type: 'wait'; ms: number }
    | { type: 'waitState'; call: string; state: ScenarioCallState; timeoutMs: number }
    | { type: 'dtmf'; call: string; digits: string }
    | { type: 'transfer'; call: string; to: string }
    | { type: 'hangup'; call: string }
    | { type: 'verify'; call: string; check: ScenarioCheck; expected: string }

export type ScenarioStepType = ScenarioStep['type']

export interface Scenario {
    id: string
    name: string
    /** Conta de origem: usada pelos passos que não escolhem outra. */
    accountId: string
    steps: ScenarioStep[]
}

export interface ScenariosFile {
    schemaVersion: 1
    scenarios: Scenario[]
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
    scenarios: {
        load(): Promise<Scenario[]>
        save(scenarios: Scenario[]): Promise<void>
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
    /** Modo linha de comando (RF-31): null quando o app abriu com janela. */
    cli: {
        config(): Promise<CliConfig | null>
        /** Escreve uma linha no terminal; `error` vai para o stderr. */
        print(line: string, error?: boolean): void
        writeReport(content: string): Promise<string | null>
        finish(code: number): void
    }
    onCertificateError(listener: (event: CertificateErrorEvent) => void): () => void
    appInfo(): Promise<{ version: string; platform: string; electron: string; chrome: string }>
}

export const IPC = {
    accountsLoad: 'accounts:load',
    accountsSave: 'accounts:save',
    scenariosLoad: 'scenarios:load',
    scenariosSave: 'scenarios:save',
    secretsGet: 'secrets:get',
    secretsSet: 'secrets:set',
    secretsAvailable: 'secrets:available',
    settingsLoad: 'settings:load',
    settingsSave: 'settings:save',
    filesSaveText: 'files:save-text',
    filesOpenText: 'files:open-text',
    notify: 'app:notify',
    appInfo: 'app:info',
    certificateError: 'cert:error',
    cliConfig: 'cli:config',
    cliPrint: 'cli:print',
    cliReport: 'cli:report',
    cliFinish: 'cli:finish'
} as const
