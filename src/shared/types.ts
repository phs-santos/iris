// Tipos compartilhados entre o processo principal, o preload e a interface.

import type { AiModel, AiRequest, AiResult, AiSettings, AiStatus } from './ai'
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
    /** Canal de atualização (RF-35). Sem o campo, vale o estável. */
    updateChannel?: UpdateChannel
    /** Ajuda da IA para ler o log (RF-38). */
    ai?: AiSettings
}

/** Canais de atualização (RF-35): o beta recebe também as versões de teste (`1.2.0-beta.1`). */
export type UpdateChannel = 'stable' | 'beta'

/** Estado da atualização automática (RF-35), do processo principal para a interface. */
export type UpdateStatus =
    | { state: 'unsupported'; reason: string }
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'up-to-date' }
    | { state: 'available'; version: string }
    | { state: 'downloading'; version: string; percent: number }
    | { state: 'ready'; version: string }
    | { state: 'error'; message: string }

export interface UpdateInfo {
    currentVersion: string
    channel: UpdateChannel
    status: UpdateStatus
    /** O app avisa da versão nova, mas a instalação é à mão, pela página de download. */
    manual: boolean
}

/** Formato do arquivo de exportação de contas (RF-07). */
export interface AccountsExport {
    format: 'iris/accounts'
    schemaVersion: 1
    exportedAt: string
    accounts: Array<Account & { password?: string }>
}

/** Situação do arquivo de senhas (RNF-07). */
export interface SecretsStatus {
    /** Ainda há senhas no formato antigo (cofre do sistema, até a 1.0.5) para trazer. */
    legacy: boolean
    /** Algo deu errado e precisa de aviso na tela; null quando está tudo certo. */
    problem: string | null
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
        /** Situação do arquivo de senhas, sem mexer em nada. */
        status(): Promise<SecretsStatus>
        /** Traz as senhas do formato antigo (até a 1.0.5), se houver, e devolve a situação depois. */
        migrate(): Promise<SecretsStatus>
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
    /** Atualização automática (RF-35). Nada é baixado sem o usuário pedir. */
    update: {
        info(): Promise<UpdateInfo>
        setChannel(channel: UpdateChannel): Promise<void>
        check(): Promise<void>
        download(): Promise<void>
        /** Fecha o app e instala a versão já baixada. */
        install(): Promise<void>
        /** Abre no navegador a página com o instalador da versão mais nova. */
        openDownloadPage(): Promise<void>
        onStatus(listener: (status: UpdateStatus) => void): () => void
    }
    /** Ajuda da IA para ler o log (RF-38). A chave entra, mas nunca volta para a interface. */
    ai: {
        status(): Promise<AiStatus>
        /** `null` apaga a chave. */
        setKey(key: string | null): Promise<void>
        setOptions(options: AiSettings): Promise<void>
        models(): Promise<AiModel[]>
        explain(request: AiRequest): Promise<AiResult>
    }
    appInfo(): Promise<{ version: string; platform: string; electron: string; chrome: string }>
}

export const IPC = {
    accountsLoad: 'accounts:load',
    accountsSave: 'accounts:save',
    scenariosLoad: 'scenarios:load',
    scenariosSave: 'scenarios:save',
    secretsGet: 'secrets:get',
    secretsSet: 'secrets:set',
    secretsStatus: 'secrets:status',
    secretsMigrate: 'secrets:migrate',
    settingsLoad: 'settings:load',
    settingsSave: 'settings:save',
    filesSaveText: 'files:save-text',
    filesOpenText: 'files:open-text',
    notify: 'app:notify',
    appInfo: 'app:info',
    certificateError: 'cert:error',
    updateInfo: 'update:info',
    updateSetChannel: 'update:set-channel',
    updateCheck: 'update:check',
    updateDownload: 'update:download',
    updateInstall: 'update:install',
    updateOpenDownload: 'update:open-download',
    updateStatus: 'update:status',
    aiStatus: 'ai:status',
    aiSetKey: 'ai:set-key',
    aiSetOptions: 'ai:set-options',
    aiModels: 'ai:models',
    aiExplain: 'ai:explain',
    cliConfig: 'cli:config',
    cliPrint: 'cli:print',
    cliReport: 'cli:report',
    cliFinish: 'cli:finish'
} as const
