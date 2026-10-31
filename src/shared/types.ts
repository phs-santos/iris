// Tipos compartilhados entre o processo principal, o preload e a interface.

import type { Appearance } from './appearance'
import type { TrayCounts } from './tray'
import type { Contact } from './contacts'
import type { SipServer } from './servers'
import type { NetDiagRequest, NetDiagResult } from './net-diag'
import type { NotificationAction, NotificationSettings, NotifyRequest } from './notifications'
import type { AccountTransport, SipTransportKind } from './sip-target'
import type { RingtoneId } from './ringtones'

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
    /** SIP puro: exige áudio cifrado (SRTP) nas chamadas. */
    srtp?: boolean
    /** Servidor cadastrado de onde vêm os dados de conexão (RF-51). */
    serverId?: string
    /**
     * WebRTC: ouvir o áudio que o PBX manda antes do atendimento (early media, RF-20). Desligado por
     * padrão: com ele, o SIP.js derruba a chamada se o PBX bifurcar o INVITE. Em SIP puro vale sempre.
     */
    earlyMedia?: boolean
    /** Toque das chamadas recebidas nesta conta (RF-55). Sem o campo, vale o clássico. */
    ringtone?: RingtoneId
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
    /** Volume do toque de chamada, de 0 a 100 (RF-55). Sem o campo, 50. */
    ringVolume?: number
    /** Canal de atualização (RF-35). Sem o campo, vale o estável. */
    updateChannel?: UpdateChannel
    /** Tela de Configurações: tema e cor de destaque. */
    appearance?: Appearance
    /** Sem o campo, vale o padrão de `@shared/reconnect`. */
    reconnect?: ReconnectSettings
    /** Quais eventos viram notificação do sistema. */
    notifications?: NotificationSettings
}

/** Campos que a interface pode mudar em `settings.json`; o canal de atualização tem canal próprio. */
export type SettingsPatch = Partial<
    Pick<
        Settings,
        'trustedHosts' | 'audioInputId' | 'audioOutputId' | 'ringVolume' | 'appearance' | 'reconnect' | 'notifications'
    >
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
    srtp?: boolean
}

export type NativeSipEventBody =
    | { type: 'status'; status: { state: RegStateName; code?: number; reason?: string; final?: boolean } }
    | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; kind: 'event' | 'sip'; text: string }
    | { type: 'call'; callId: string; event: NativeCallEvent }
    /** 20 ms de áudio recebido: 320 amostras de 16 bits a 16000 Hz. */
    | { type: 'audio'; callId: string; pcm: Int16Array }

export type NativeCallEvent =
    | { kind: 'incoming'; remote: string; remoteName?: string }
    | { kind: 'progress'; code: number; reason: string; earlyMedia: boolean }
    | { kind: 'established' }
    | { kind: 'ended'; code?: number; reason?: string; by: 'local' | 'remote' | 'system' }
    | { kind: 'hold'; held: boolean; by: 'local' | 'remote' }
    /** Andamento de uma transferência pedida por esta conta. */
    | { kind: 'transfer'; code: number; reason: string; final: boolean }
    | { kind: 'dtmf'; tone: string }

export type NativeCallAction =
    | { type: 'answer' }
    | { type: 'reject' }
    | { type: 'hangup' }
    | { type: 'mute'; muted: boolean }
    | { type: 'dtmf'; tone: string; mode: DtmfMode }
    | { type: 'hold'; held: boolean }
    | { type: 'transfer'; target: string }
    /** Transferência assistida: junta o outro lado desta chamada com o da chamada de consulta. */
    | { type: 'attended'; consultCallId: string }

export interface NativeCallStats {
    packetsSent: number
    packetsReceived: number
    packetsLost: number
    jitterMs: number
    /** Tempo de ida e volta pelo RTCP; ausente com SRTP ou enquanto o outro lado não respondeu. */
    rttMs?: number
    codec: string
    /** O áudio desta chamada vai cifrado (SRTP). */
    secure: boolean
}

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

/** Situação dos arquivos de dados: senhas (RNF-07), contas, contatos e preferências. */
export interface SecretsStatus {
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
    /** Agenda de contatos (RF-50) e servidores cadastrados (RF-51). */
    contacts: {
        load(): Promise<Contact[]>
        save(contacts: Contact[]): Promise<void>
    }
    servers: {
        load(): Promise<SipServer[]>
        save(servers: SipServer[]): Promise<void>
    }
    secrets: {
        get(accountId: string): Promise<string | null>
        set(accountId: string, password: string | null): Promise<void>
        /** Situação do arquivo de senhas, sem mexer em nada. */
        status(): Promise<SecretsStatus>
    }
    settings: {
        load(): Promise<Settings>
        /** Muda só os campos enviados e devolve as preferências já gravadas. */
        update(patch: SettingsPatch): Promise<Settings>
    }
    files: {
        saveText(defaultName: string, content: string): Promise<string | null>
        /** Abre o diálogo e devolve o texto do arquivo escolhido. `csv` troca o filtro de JSON por CSV. */
        openText(kind?: 'json' | 'csv'): Promise<string | null>
    }
    audio: {
        /** Abre no gerenciador de arquivos a pasta das gravações de chamadas (RF-36). */
        openRecordings(): Promise<void>
    }
    notify(request: NotifyRequest): void
    /** Tira a notificação de uma chamada que já foi atendida, recusada ou desistida. */
    closeNotification(callId: string): void
    /** Traz a janela para a frente. */
    focusWindow(): void
    /** Clique em Atender, Recusar ou na própria notificação de uma chamada. */
    onNotificationAction(listener: (callId: string, action: NotificationAction) => void): () => void
    /** Diagnóstico de rede da Saúde (RF-46): DNS SRV, certificado TLS e STUN. */
    net: {
        diagnose(request: NetDiagRequest): Promise<NetDiagResult>
    }
    /** Estado geral para o ícone da bandeja (RF-33). */
    setTray(counts: TrayCounts): void
    /** Erro da interface para o log interno do app (RNF-14). */
    logError(text: string): void
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
    /** Motor próprio (RF-39): os sockets ficam no processo principal. */
    sip: {
        start(engineId: string, config: NativeSipConfig, password: string): Promise<void>
        stop(engineId: string): Promise<void>
        health(engineId: string): Promise<NativeSipHealth>
        /** Liga e devolve o id da chamada; o andamento chega pelos eventos. */
        dial(engineId: string, destination: string, headers?: string[]): Promise<string>
        callAction(engineId: string, callId: string, action: NativeCallAction): Promise<void>
        callStats(engineId: string, callId: string): Promise<NativeCallStats | null>
        /** Volume do áudio recebido nos últimos instantes, em dBFS (RF-41). */
        callLevel(engineId: string, callId: string): Promise<number | null>
        /** Liga ou desliga a gravação (RF-36). Devolve o caminho do arquivo, ou null se a chamada não existe. */
        record(engineId: string, callId: string, on: boolean): Promise<string | null>
        /** 20 ms do microfone para a chamada: 320 amostras de 16 bits a 16000 Hz. */
        sendAudio(engineId: string, callId: string, pcm: Int16Array): void
        onEvent(listener: (event: NativeSipEvent) => void): () => void
    }
    appInfo(): Promise<{ version: string; platform: string; electron: string; chrome: string }>
}

export const IPC = {
    accountsLoad: 'accounts:load',
    accountsSave: 'accounts:save',
    contactsLoad: 'contacts:load',
    contactsSave: 'contacts:save',
    serversLoad: 'servers:load',
    serversSave: 'servers:save',
    secretsGet: 'secrets:get',
    secretsSet: 'secrets:set',
    secretsStatus: 'secrets:status',
    settingsLoad: 'settings:load',
    settingsUpdate: 'settings:update',
    filesSaveText: 'files:save-text',
    filesOpenText: 'files:open-text',
    audioOpenRecordings: 'audio:open-recordings',
    notify: 'app:notify',
    notifyClose: 'app:notify-close',
    notifyAction: 'app:notify-action',
    focusWindow: 'app:focus-window',
    netDiagnose: 'net:diagnose',
    tray: 'app:tray',
    logError: 'app:log-error',
    appInfo: 'app:info',
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
    sipDial: 'sip:dial',
    sipCallAction: 'sip:call-action',
    sipCallStats: 'sip:call-stats',
    sipCallLevel: 'sip:call-level',
    sipRecord: 'sip:record',
    sipAudio: 'sip:audio',
    sipEvent: 'sip:event'
} as const
