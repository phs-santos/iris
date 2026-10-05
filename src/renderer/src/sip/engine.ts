// Interface própria do motor SIP (RNF-16). A interface do app só conhece estes tipos;
// o easy-sipjs e o simulador são duas implementações intercambiáveis.

import type { DtmfMode, SipManualRequest, SipManualResponse } from '@shared/types'
import type { LoadProgress, LoadReport, LoadSpec } from '@shared/load'
import type { MwiInfo, PresenceState } from '@shared/presence'

export type RegState = 'disconnected' | 'connecting' | 'connected' | 'registered' | 'error'

export interface RegStatus {
    state: RegState
    code?: number
    reason?: string
    /** O motor já esgotou as próprias tentativas: não vale agendar outra (RNF-06). */
    final?: boolean
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogKind = 'event' | 'sip'

export interface EngineLog {
    level: LogLevel
    kind: LogKind
    text: string
}

export interface CallEnd {
    code?: number
    reason?: string
    /** Quem encerrou: o próprio app, o outro lado ou o sistema (falha). */
    by: 'local' | 'remote' | 'system'
}

export interface CallQuality {
    score: number
    level: 'excellent' | 'good' | 'warning' | 'bad'
    jitterMs: number
    packetLossPercent: number
    rttMs: number
    codec: string
}

export interface HealthReport {
    websocketConnected: boolean
    registered: boolean
    latencyMs?: number
    error?: string
    checkedAt: Date
}

export type CallEvents = {
    progress: [code: number, reason: string, earlyMedia: boolean]
    established: []
    ended: [end: CallEnd]
    hold: [by: 'local' | 'remote']
    unhold: [by: 'local' | 'remote']
    dtmf: [tone: string]
    transfer: [code: number, reason: string, final: boolean]
    /** As imagens da chamada mudaram: chegou o vídeo do outro lado, ou a câmera ligou ou desligou (RF-52). */
    video: []
}

/** As imagens de uma chamada de vídeo; null enquanto não há (RF-52). */
export interface VideoStreams {
    remote: MediaStream | null
    local: MediaStream | null
}

export interface EngineCall {
    readonly id: string
    readonly direction: 'in' | 'out'
    readonly remote: string
    readonly remoteName?: string
    /** O motor toca o áudio que o PBX manda antes de atender (early media, RF-20). */
    readonly earlyAudio: boolean
    /** O app toca o toque de chamada para esta chamada; o simulado não tem som. */
    readonly localRingback: boolean
    /** A chamada tem vídeo: quem ligou pediu, ou a que chega está oferecendo (RF-52). */
    readonly video: boolean
    on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): () => void
    /** Com `video`, atende mandando também a câmera; sem, só recebe a imagem do outro lado. */
    answer(options?: { video?: boolean }): Promise<void>
    reject(): Promise<void>
    hangup(): Promise<void>
    setMuted(muted: boolean): void
    setHeld(held: boolean): Promise<void>
    sendDtmf(tone: string, mode: DtmfMode): Promise<void>
    transfer(target: string): Promise<void>
    /**
     * Transferência assistida (RF-16): manda o outro lado desta chamada para o outro lado de `consult`
     * (REFER com Replaces). As duas chamadas locais terminam quando a transferência conclui.
     */
    attendedTransfer(consult: EngineCall): Promise<void>
    /** Troca o microfone da chamada em andamento. "" volta para o padrão do sistema. */
    setInputDevice(deviceId: string): Promise<void>
    quality(): Promise<CallQuality | null>
    /** As imagens da chamada. Só nos motores com vídeo. */
    videoStreams?(): VideoStreams
    /** Liga ou desliga a câmera sem refazer a chamada. */
    setCamera?(on: boolean): void
    /** Volume do áudio recebido nos últimos instantes, em dBFS, ou null se o motor não mede (RF-41). */
    audioLevel(): Promise<number | null>
    /** Toca um áudio (PCM de 16 bits a 8000 Hz) no lugar do microfone. Só nos motores que conseguem. */
    playAudio?(pcm: Int16Array): Promise<void>
    /** Liga ou desliga a gravação da chamada e devolve o arquivo (RF-36). Só nos motores que gravam. */
    setRecording?(on: boolean): Promise<string | null>
}

export type EngineEvents = {
    status: [status: RegStatus]
    log: [entry: EngineLog]
    incoming: [call: EngineCall]
    /** Estado de um ramal acompanhado (BLF) e aviso de correio de voz (RF-27). */
    presence: [extension: string, state: PresenceState]
    mwi: [info: MwiInfo]
    /** Mensagem de texto recebida (SIP MESSAGE, RF-54). */
    message: [from: string, text: string, fromName?: string]
}

export interface DialOptions {
    headers?: string[]
    /** Chamada de vídeo (RF-52): manda a câmera junto com o áudio. */
    video?: boolean
}

export interface SipEngine {
    /** Este motor faz chamada de vídeo (RF-52): o WebRTC e o simulado; o SIP puro ainda não. */
    readonly video: boolean
    on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void
    connect(): Promise<void>
    disconnect(): Promise<void>
    dial(destination: string, options?: DialOptions): Promise<EngineCall>
    health(): Promise<HealthReport>
    /** Manda uma mensagem de texto a um ramal (RF-54). Rejeita com a resposta do PBX se ele recusar. */
    sendMessage(to: string, text: string): Promise<void>
    /** Pedido SIP manual, fora de chamada (RF-45). Só nos motores que conseguem. */
    request?(spec: SipManualRequest): Promise<SipManualResponse>
    /** Teste de carga com várias chamadas ao mesmo tempo (RF-42). Só no motor próprio. */
    loadTest?(spec: LoadSpec, onProgress: (progress: LoadProgress) => void): Promise<LoadReport>
    stopLoadTest?(): Promise<void>
    /** Salva em PCAP o que passou pela rede desta conta (RF-44). Só no motor próprio. */
    exportCapture?(withRtp: boolean): Promise<string | null>
    dispose(): Promise<void>
}

/** Tenta extrair código e frase SIP de erros com formatos diferentes (SIP.js, JsSIP, Error). */
export function describeSipError(error: unknown): { code?: number; reason?: string } {
    if (!error || typeof error !== 'object') return { reason: error ? String(error) : undefined }
    const e = error as Record<string, any>
    const message = e.message && typeof e.message === 'object' ? e.message : undefined
    const code = message?.statusCode ?? e.statusCode ?? e.status_code ?? e.response?.status_code
    const reason =
        message?.reasonPhrase ??
        e.reasonPhrase ??
        e.reason_phrase ??
        e.cause ??
        (typeof e.message === 'string' ? e.message : undefined)
    return { code: typeof code === 'number' ? code : undefined, reason: reason ? String(reason) : undefined }
}
