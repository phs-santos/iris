import type { Account, DtmfMode, NativeCallEvent, NativeSipEvent } from '@shared/types'
import type { SipTransportKind } from '@shared/sip-target'
import { Emitter } from '@renderer/lib/emitter'
import { t } from '@renderer/i18n'
import type { CallEvents, CallQuality, DialOptions, EngineCall, EngineEvents, HealthReport, SipEngine } from './engine'
import { audioInput } from './audio'
import { NativeAudio } from './native-audio'

let nextEngine = 1

/** Nota de 0 a 100 a partir da perda, da variação do atraso e do tempo de ida e volta (quando o RTCP mede). */
function qualityOf(lossPercent: number, jitterMs: number, rttMs: number, codec: string): CallQuality {
    const delay = Math.max(0, jitterMs - 10) * 0.8 + Math.max(0, rttMs - 150) * 0.1
    const score = Math.max(0, Math.round(100 - lossPercent * 4 - delay))
    const level = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'warning' : 'bad'
    return { score, level, jitterMs, packetLossPercent: Math.round(lossPercent * 10) / 10, rttMs, codec }
}

/** Chamada do motor próprio: o SIP e o RTP ficam no processo principal; aqui, os comandos e o áudio. */
class NativeSipCall implements EngineCall {
    private emitter = new Emitter<CallEvents>()
    private audio: NativeAudio
    private finished = false

    constructor(
        readonly engineId: string,
        readonly id: string,
        readonly direction: 'in' | 'out',
        readonly remote: string,
        readonly remoteName: string | undefined
    ) {
        this.audio = new NativeAudio((pcm) => window.iris.sip.sendAudio(engineId, id, pcm))
        // Quem liga já abre o áudio: o PBX pode mandar toque ou mensagem antes de atender.
        if (direction === 'out') void this.audio.start(audioInput.deviceId || undefined)
    }

    on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    handle(event: NativeCallEvent): void {
        if (this.finished) return
        switch (event.kind) {
            case 'progress':
                return this.emitter.emit('progress', event.code, event.reason, event.earlyMedia)
            case 'established':
                void this.audio.start(audioInput.deviceId || undefined)
                return this.emitter.emit('established')
            case 'hold':
                return this.emitter.emit(event.held ? 'hold' : 'unhold', event.by)
            case 'transfer':
                return this.emitter.emit('transfer', event.code, event.reason, event.final)
            case 'dtmf':
                return this.emitter.emit('dtmf', event.tone)
            case 'ended':
                this.finished = true
                this.audio.close()
                this.emitter.emit('ended', { code: event.code, reason: event.reason, by: event.by })
                this.emitter.clear()
        }
    }

    play(pcm: Int16Array): void {
        if (!this.finished) this.audio.play(pcm)
    }

    private action(action: Parameters<typeof window.iris.sip.callAction>[2]): Promise<void> {
        return window.iris.sip.callAction(this.engineId, this.id, action)
    }

    answer(): Promise<void> {
        return this.action({ type: 'answer' })
    }

    reject(): Promise<void> {
        return this.action({ type: 'reject' })
    }

    hangup(): Promise<void> {
        return this.action({ type: 'hangup' })
    }

    setMuted(muted: boolean): void {
        void this.action({ type: 'mute', muted })
    }

    setHeld(held: boolean): Promise<void> {
        return this.action({ type: 'hold', held })
    }

    sendDtmf(tone: string, mode: DtmfMode): Promise<void> {
        return this.action({ type: 'dtmf', tone, mode })
    }

    transfer(target: string): Promise<void> {
        return this.action({ type: 'transfer', target })
    }

    async attendedTransfer(consult: EngineCall): Promise<void> {
        // As duas chamadas precisam ser da mesma conta: o PBX junta os dois diálogos dela.
        if (!(consult instanceof NativeSipCall) || consult.engineId !== this.engineId)
            throw new Error(t('nativeEngine.consulta_outra_conta'))
        await this.action({ type: 'attended', consultCallId: consult.id })
    }

    setInputDevice(deviceId: string): Promise<void> {
        return this.audio.setInputDevice(deviceId)
    }

    audioLevel(): Promise<number | null> {
        return window.iris.sip.callLevel(this.engineId, this.id)
    }

    playAudio(pcm: Int16Array): Promise<void> {
        return this.action({ type: 'play', pcm })
    }

    setRecording(on: boolean): Promise<string | null> {
        return window.iris.sip.record(this.engineId, this.id, on)
    }

    async quality(): Promise<CallQuality | null> {
        const stats = await window.iris.sip.callStats(this.engineId, this.id).catch(() => null)
        if (!stats || stats.packetsReceived === 0) return null
        const expected = stats.packetsReceived + stats.packetsLost
        const codec = stats.secure ? `${stats.codec} (SRTP)` : stats.codec
        return qualityOf((stats.packetsLost / expected) * 100, stats.jitterMs, stats.rttMs ?? 0, codec)
    }
}

/**
 * Motor próprio da Íris para SIP puro por UDP, TCP ou TLS (RF-39). Os sockets ficam no processo
 * principal; aqui só passam os comandos e voltam os eventos. Registra, mede a saúde e faz chamadas
 * com G.711, DTMF, espera e transferência; o áudio cifrado (SRTP) ainda não existe.
 */
export class NativeSipEngine implements SipEngine {
    private emitter = new Emitter<EngineEvents>()
    private readonly id: string
    private off?: () => void
    private calls = new Map<string, NativeSipCall>()
    /** Eventos de uma chamada que ainda não existe aqui: o `dial` responde depois dos primeiros. */
    private early = new Map<string, NativeCallEvent[]>()

    constructor(
        private account: Account,
        private password: string
    ) {
        this.id = `${account.id}:${nextEngine++}`
    }

    on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    private onEvent(event: NativeSipEvent): void {
        if (event.engineId !== this.id) return
        if (event.type === 'status') return this.emitter.emit('status', event.status)
        if (event.type === 'audio') return this.calls.get(event.callId)?.play(event.pcm)
        if (event.type === 'log') {
            // Sem "Mostrar SIP bruto no log", ficam só os eventos.
            if (event.kind !== 'sip' || this.account.rawSipLog)
                this.emitter.emit('log', { level: event.level, kind: event.kind, text: event.text })
            return
        }
        const call = this.calls.get(event.callId)
        if (call) return this.deliver(call, event.event)
        if (event.event.kind === 'incoming') {
            const { remote, remoteName } = event.event
            this.emitter.emit('incoming', this.track(event.callId, 'in', remote, remoteName))
        } else this.early.set(event.callId, [...(this.early.get(event.callId) ?? []), event.event])
    }

    private track(callId: string, direction: 'in' | 'out', remote: string, name?: string): NativeSipCall {
        const call = new NativeSipCall(this.id, callId, direction, remote, name)
        this.calls.set(callId, call)
        return call
    }

    private deliver(call: NativeSipCall, event: NativeCallEvent): void {
        if (event.kind === 'ended') this.calls.delete(call.id)
        call.handle(event)
    }

    async connect(): Promise<void> {
        const { account } = this
        this.off?.()
        this.off = window.iris.sip.onEvent((event) => this.onEvent(event))
        try {
            await window.iris.sip.start(
                this.id,
                {
                    user: account.extension.trim(),
                    domain: account.domain.trim(),
                    authUser: account.authUsername?.trim() || undefined,
                    displayName: account.displayName?.trim() || undefined,
                    transport: account.transport as SipTransportKind,
                    server: account.sipServer?.trim() || undefined,
                    srtp: account.srtp || undefined
                },
                this.password
            )
        } catch (error) {
            this.emitter.emit('status', { state: 'error', reason: (error as Error).message, final: true })
        }
    }

    async disconnect(): Promise<void> {
        await window.iris.sip.stop(this.id)
        this.emitter.emit('status', { state: 'disconnected' })
    }

    async dial(destination: string, options: DialOptions = {}): Promise<EngineCall> {
        const callId = await window.iris.sip.dial(this.id, destination, options.headers)
        const call = this.track(callId, 'out', destination)
        // A store de chamadas se inscreve logo depois deste retorno; os eventos que já chegaram
        // esperam esse instante.
        const pending = this.early.get(callId) ?? []
        this.early.delete(callId)
        if (pending.length) setTimeout(() => pending.forEach((event) => this.deliver(call, event)), 0)
        return call
    }

    async health(): Promise<HealthReport> {
        const h = await window.iris.sip.health(this.id)
        return {
            websocketConnected: h.connected,
            registered: h.registered,
            latencyMs: h.latencyMs,
            error: h.error,
            checkedAt: new Date()
        }
    }

    async dispose(): Promise<void> {
        await window.iris.sip.stop(this.id).catch(() => undefined)
        this.off?.()
        this.off = undefined
        // Desregistrar encerra as chamadas da conta; a tela precisa saber das que ainda estavam abertas.
        for (const call of [...this.calls.values()]) this.deliver(call, { kind: 'ended', by: 'local' })
        this.emitter.clear()
    }
}
