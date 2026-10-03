import { SipClient, type ISipSession, type SipInvitation } from 'easy-sipjs'
import type { Account, DtmfMode } from '@shared/types'
import { Emitter } from '@renderer/lib/emitter'
import {
    describeSipError,
    type CallEvents,
    type CallQuality,
    type DialOptions,
    type EngineCall,
    type EngineEvents,
    type HealthReport,
    type LogLevel,
    type SipEngine
} from './engine'
import { audioOutput } from './audio'

// WAV vazio: desliga o toque próprio de cada SipClient; o app toca um toque central
// para não sobrepor sons quando várias contas recebem chamadas.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

let nextId = 1

class EasySipCall implements EngineCall {
    readonly id = `c${nextId++}`
    private emitter = new Emitter<CallEvents>()
    private session?: ISipSession
    private audio = document.createElement('audio')
    private endedLocally = false
    private failure?: { code?: number; reason?: string }
    private finished = false

    constructor(
        private client: SipClient,
        readonly direction: 'in' | 'out',
        readonly remote: string,
        readonly remoteName: string | undefined,
        private invitation?: SipInvitation
    ) {
        this.audio.autoplay = true
        this.audio.hidden = true
        document.body.appendChild(this.audio)
        audioOutput.apply(this.audio)

        if (invitation) {
            // O invitation termina sozinho se quem ligou desistir antes do atendimento.
            const previous = invitation.onTerminate
            invitation.onTerminate = () => {
                previous?.()
                if (!this.session) this.finish({ by: 'remote', reason: 'Chamada cancelada por quem ligou' })
            }
        }
    }

    on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    get remoteElement(): HTMLAudioElement {
        return this.audio
    }

    bind(session: ISipSession): void {
        this.session = session
        session.on?.('progress', (event) => {
            if (!event) return
            this.emitter.emit('progress', event.statusCode, event.reasonPhrase ?? '', Boolean(event.hasEarlyMedia))
        })
        session.on?.('established', () => this.emitter.emit('established'))
        session.on?.('failed', (event) => {
            this.failure = { code: event.statusCode, reason: event.reasonPhrase }
        })
        session.on?.('terminated', (event) => {
            // O SIP.js muda para Terminated antes de chamar o onReject com o código da resposta,
            // então espera o "failed" chegar antes de fechar a chamada.
            setTimeout(() => {
                const code = this.failure?.code ?? event?.statusCode
                const reason = this.failure?.reason ?? event?.reasonPhrase
                const by = this.endedLocally
                    ? 'local'
                    : code && code >= 400
                      ? 'remote'
                      : this.failure
                        ? 'system'
                        : 'remote'
                this.finish({ code, reason, by })
            }, 0)
        })
        session.on?.('hold', (event) => this.emitter.emit('hold', event?.originator === 'remote' ? 'remote' : 'local'))
        session.on?.('unhold', (event) =>
            this.emitter.emit('unhold', event?.originator === 'remote' ? 'remote' : 'local')
        )
        session.on?.('dtmf', (event) => this.emitter.emit('dtmf', event.tone))
        session.on?.('transfer-progress', (event) =>
            this.emitter.emit('transfer', event.statusCode, event.reasonPhrase ?? '', event.final)
        )
    }

    private finish(end: CallEvents['ended'][0]): void {
        if (this.finished) return
        this.finished = true
        this.audio.srcObject = null
        this.audio.remove()
        this.emitter.emit('ended', end)
        this.emitter.clear()
    }

    async answer(): Promise<void> {
        if (!this.invitation) throw new Error('Só chamadas recebidas podem ser atendidas')
        const session = await this.client.accept(this.invitation, { remoteElement: this.audio })
        this.bind(session)
        // O SIP.js já está em "established" quando accept() resolve.
        this.emitter.emit('established')
    }

    async reject(): Promise<void> {
        if (!this.invitation) return
        this.endedLocally = true
        await this.client.reject(this.invitation)
        this.finish({ by: 'local', code: 486, reason: 'Recusada' })
    }

    async hangup(): Promise<void> {
        this.endedLocally = true
        if (this.session) await this.session.bye()
        else if (this.invitation) await this.reject()
    }

    setMuted(muted: boolean): void {
        if (muted) this.session?.mute()
        else this.session?.unmute()
    }

    async setHeld(held: boolean): Promise<void> {
        if (!this.session) return
        if (held) await this.session.hold()
        else await this.session.unhold()
    }

    async sendDtmf(tone: string, mode: DtmfMode): Promise<void> {
        await this.session?.sendDTMF(tone, { mode })
    }

    async transfer(target: string): Promise<void> {
        await this.session?.transfer(target)
    }

    get sipSession(): ISipSession | undefined {
        return this.session
    }

    async attendedTransfer(consult: EngineCall): Promise<void> {
        const other = consult instanceof EasySipCall ? consult.sipSession : undefined
        if (!this.session || !other) throw new Error('As duas chamadas precisam estar em andamento')
        // O easy-sipjs monta o Refer-To com Replaces a partir da outra sessão.
        await this.session.transfer(other)
    }

    async setInputDevice(deviceId: string): Promise<void> {
        await this.session?.setAudioInput(deviceId || 'default')
    }

    async quality(): Promise<CallQuality | null> {
        if (!this.session) return null
        try {
            const q = await this.session.getQuality()
            return {
                score: q.score,
                level: q.level,
                jitterMs: q.jitterMs,
                packetLossPercent: q.packetLossPercent,
                rttMs: q.rttMs,
                codec: q.codec
            }
        } catch {
            return null
        }
    }
}

const levelOf = (level: string): LogLevel =>
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' || level === 'log' ? 'debug' : 'info'

export class EasySipEngine implements SipEngine {
    private emitter = new Emitter<EngineEvents>()
    private client: SipClient

    constructor(account: Account, password: string) {
        const iceServers = account.iceServers
            .split(',')
            .map((url) => url.trim())
            .filter(Boolean)
            .map((urls) => ({ urls }))

        this.client = new SipClient(
            {
                domain: account.domain,
                phone: account.extension,
                secret: password,
                nameexten: account.displayName || undefined,
                authorizationUsername: account.authUsername || undefined,
                server: account.wssUrl,
                iceServers: iceServers.length ? iceServers : undefined,
                debug: account.rawSipLog,
                userAgentString: 'Iris'
            },
            {
                preset: account.preset,
                provider: account.provider,
                sounds: { ringtone: SILENT_WAV },
                autoReconnect: true,
                autoRefreshRegistration: true,
                logRedaction: true
            }
        )

        this.client.onSipLog = (level, category, _label, content) => {
            const isSipMessage = /SIP\/2\.0/.test(content)
            // Mensagens SIP entram como info; o restante do SIP.js é detalhe interno (debug).
            this.emitter.emit('log', {
                level: isSipMessage ? 'info' : levelOf(level),
                kind: isSipMessage ? 'sip' : 'event',
                text: isSipMessage ? content : `${category}: ${content}`
            })
        }

        this.client.on('connection-state', (state) => {
            if (state === 'error') return // o motivo chega em register-failed
            this.emitter.emit('status', { state })
        })
        this.client.on('register-failed', (error) => {
            const { code, reason } = describeSipError(error)
            this.emitter.emit('status', { state: 'error', code, reason })
        })
        this.client.on('disconnect', (error) => {
            if (error)
                this.emitter.emit('log', { level: 'warn', kind: 'event', text: `WebSocket caiu: ${error.message}` })
        })
        this.client.on('invite', (invitation) => {
            const user = invitation.remoteIdentity?.uri?.user ?? 'desconhecido'
            const name = invitation.remoteIdentity?.displayName || undefined
            this.emitter.emit('incoming', new EasySipCall(this.client, 'in', user, name, invitation))
        })
    }

    on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    async connect(): Promise<void> {
        try {
            await this.client.connect()
        } catch (error) {
            const { code, reason } = describeSipError(error)
            this.emitter.emit('status', { state: 'error', code, reason: reason ?? 'Falha ao conectar no WebSocket' })
        }
    }

    async disconnect(): Promise<void> {
        await this.client.disconnect()
        this.emitter.emit('status', { state: 'disconnected' })
    }

    async dial(destination: string, options: DialOptions = {}): Promise<EngineCall> {
        const call = new EasySipCall(this.client, 'out', destination, undefined)
        const session = await this.client.dial(destination, {
            remoteElement: call.remoteElement,
            extraHeaders: options.headers
        })
        call.bind(session)
        return call
    }

    async health(): Promise<HealthReport> {
        const h = await this.client.checkHealth()
        return {
            websocketConnected: h.websocketConnected,
            registered: h.registered,
            latencyMs: h.lastPingLatencyMs,
            error: h.lastPingError,
            checkedAt: h.checkedAt
        }
    }

    async dispose(): Promise<void> {
        try {
            await this.client.disconnect()
        } catch {
            // já desconectado
        }
        this.emitter.clear()
    }
}
