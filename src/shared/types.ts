// Tipos compartilhados entre o processo principal, o preload e a interface.

import type { AiModel, AiRequest, AiResult, AiSettings, AiStatus } from './ai'
import type { CliConfig } from './cli'
import type { Appearance, Profile } from './appearance'
import type { TrayCounts } from './tray'
import type { AccountTransport, SipTransportKind } from './sip-target'

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
    /** Sem o campo vale `ws` (WebRTC por WebSocket). UDP, TCP e TLS usam o motor próprio (RF-39). */
    transport?: AccountTransport
    /** SIP puro: host e porta do PBX, ex.: "10.0.0.5:5080". Vazio usa o domínio e a porta padrão. */
    sipServer?: string
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
    /** Tela de Configurações: quem usa e como a interface aparece. */
    profile?: Profile
    appearance?: Appearance
    /** Sem o campo, vale o padrão de `@shared/reconnect`. */
    reconnect?: ReconnectSettings
}

/** Campos que a interface pode mudar em `settings.json`; o canal de atualização e a IA têm canais próprios. */
export type SettingsPatch = Partial<
    Pick<Settings, 'trustedHosts' | 'audioInputId' | 'audioOutputId' | 'profile' | 'appearance' | 'reconnect'>
>

/** Reconexão das contas depois de uma queda (RNF-06). */
export interface ReconnectSettings {
    /** Quantas vezes tentar de novo antes de desistir; 0 tenta para sempre. */
    maxAttempts: number
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
    /** macOS sem assinatura: a Íris se troca sozinha (mac-update) e, se falhar, oferece o comando do Terminal. */
    manual: boolean
}

// ─── Motor próprio: SIP puro por UDP, TCP ou TLS (RF-39) ───────────────────

export interface NativeSipConfig {
    user: string
    domain: string
    authUser?: string
    displayName?: string
    transport: SipTransportKind
    /** Host e porta do PBX; vazio usa o domínio. */
    server?: string
}

export type NativeSipEventBody =
    | { type: 'status'; status: { state: RegStateName; code?: number; reason?: string; final?: boolean } }
    | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; kind: 'event' | 'sip'; text: string }

export type RegStateName = 'disconnected' | 'connecting' | 'connected' | 'registered' | 'error'

/** Evento de um motor, do processo principal para a interface. */
export type NativeSipEvent = { engineId: string } & NativeSipEventBody

export interface NativeSipHealth {
    connected: boolean
    registered: boolean
    latencyMs?: number
    error?: string
}

/** Formato do arquivo de exportação de contas (RF-07). */
export interface AccountsExport {
    format: 'iris/accounts'
    schemaVersion: 1
    exportedAt: string
    accounts: Array<Account & { password?: string }>
}

/** Situação dos arquivos de dados: senhas (RNF-07), contas, cenários e preferências. */
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
        /** Muda só os campos enviados e devolve as preferências já gravadas. */
        update(patch: SettingsPatch): Promise<Settings>
    }
    files: {
        saveText(defaultName: string, content: string): Promise<string | null>
        openText(): Promise<string | null>
    }
    notify(title: string, body: string): void
    /** Estado geral para o ícone da bandeja (RF-33). */
    setTray(counts: TrayCounts): void
    /** Erro da interface para o log interno do app (RNF-14). */
    logError(text: string): void
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
    /** Motor próprio (RF-39): os sockets ficam no processo principal. */
    sip: {
        start(engineId: string, config: NativeSipConfig, password: string): Promise<void>
        stop(engineId: string): Promise<void>
        health(engineId: string): Promise<NativeSipHealth>
        onEvent(listener: (event: NativeSipEvent) => void): () => void
    }
    appInfo(): Promise<{ version: string; platform: string; electron: string; chrome: string }>
    /** Ajusta a janela ao modo da tela: estreita no Telefone, larga na Bancada. */
    setWindowMode(mode: WindowMode): Promise<void>
}

/** Telefone: só o discador e a chamada. Bancada: contas, telefone e log lado a lado. */
export type WindowMode = 'phone' | 'bench'

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
    settingsUpdate: 'settings:update',
    filesSaveText: 'files:save-text',
    filesOpenText: 'files:open-text',
    notify: 'app:notify',
    tray: 'app:tray',
    logError: 'app:log-error',
    appInfo: 'app:info',
    windowMode: 'window:mode',
    certificateError: 'cert:error',
    updateInfo: 'update:info',
    updateSetChannel: 'update:set-channel',
    updateCheck: 'update:check',
    updateDownload: 'update:download',
    updateInstall: 'update:install',
    updateOpenDownload: 'update:open-download',
    updateStatus: 'update:status',
    sipStart: 'sip:start',
    sipStop: 'sip:stop',
    sipHealth: 'sip:health',
    sipEvent: 'sip:event',
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
