// Motor simulado (RF-32): imita um PBX sem rede. Contas simuladas do mesmo domínio
// ligam umas para as outras; alguns números especiais simulam respostas do PBX.

import { levelDb, SAMPLE_RATE, SILENCE_DB } from '@shared/audio'
import type { Account, DtmfMode } from '@shared/types'
import { Emitter } from '@renderer/lib/emitter'
import type {
    CallEnd,
    CallEvents,
    CallQuality,
    EngineCall,
    EngineEvents,
    HealthReport,
    LogLevel,
    LogKind,
    RegStatus,
    SipEngine
} from './engine'

/** Números especiais do PBX simulado, mostrados na ajuda do discador. */
export const MOCK_NUMBERS = [
    { number: '8000', description: 'URA: atende com early media e registra o DTMF recebido' },
    { number: '486', description: 'Ocupado (486 Busy Here)' },
    { number: '408', description: 'Ninguém atende (408 Request Timeout após 5 s)' },
    { number: 'outro', description: 'Ramal de outra conta simulada do mesmo domínio, ou 404 Not Found' }
]

export const MOCK_TIMING = {
    register: 250,
    trying: 80,
    ringing: 150,
    ivrAnswer: 1200,
    timeout: 5000,
    noAnswer: 30000
}

const registry = new Set<MockEngine>()

/** Remove todas as contas registradas no PBX simulado. Usado nos testes. */
export function resetMockNetwork(): void {
    registry.clear()
}

let nextId = 1

/** Volume da "voz" simulada de quem está numa chamada, em dBFS. */
const MOCK_VOICE_DB = -30

class MockCall implements EngineCall {
    muted = false
    held = false
    private heard?: { db: number; until: number }
    readonly id = `m${nextId++}`
    private emitter = new Emitter<CallEvents>()
    peer?: MockCall
    state: 'ringing' | 'established' | 'ended' = 'ringing'
    private timers: ReturnType<typeof setTimeout>[] = []
    ivr = false
    /** Cada perna tem o seu Call-ID, como num PBX que fica no meio (B2BUA). */
    readonly callId: string
    private cseq = 1

    constructor(
        private engine: MockEngine,
        readonly direction: 'in' | 'out',
        readonly remote: string,
        readonly remoteName?: string
    ) {
        this.callId = `${this.id}-${Math.random().toString(36).slice(2, 8)}@${engine.domain}`
    }

    private get uri(): string {
        return `sip:${this.remote}@${this.engine.domain}`
    }

    sip(dir: 'out' | 'in', start: string, method: string, seq = 1, extra: string[] = []): void {
        this.engine.sip(dir, start, { callId: this.callId, seq, method }, extra)
    }

    /** Resposta ao INVITE que abriu a chamada. */
    respond(dir: 'out' | 'in', status: string, extra: string[] = []): void {
        this.sip(dir, `SIP/2.0 ${status}`, 'INVITE', 1, extra)
    }

    ack(dir: 'out' | 'in', seq = 1): void {
        this.sip(dir, `ACK ${this.uri} SIP/2.0`, 'ACK', seq)
    }

    /** Pedido novo dentro da chamada (BYE, INFO, REFER, re-INVITE) e a resposta do outro lado. */
    exchange(dir: 'out' | 'in', method: string, extra: string[] = [], reply = '200 OK'): number {
        const seq = ++this.cseq
        this.sip(dir, `${method} ${this.uri} SIP/2.0`, method, seq, extra)
        this.sip(dir === 'out' ? 'in' : 'out', `SIP/2.0 ${reply}`, method, seq)
        return seq
    }

    on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    emit<K extends keyof CallEvents>(event: K, ...args: CallEvents[K]): void {
        this.emitter.emit(event, ...args)
    }

    later(ms: number, fn: () => void): void {
        this.timers.push(setTimeout(fn, ms))
    }

    establish(): void {
        if (this.state !== 'ringing') return
        this.state = 'established'
        this.emit('established')
    }

    end(end: CallEnd): void {
        if (this.state === 'ended') return
        this.state = 'ended'
        this.timers.forEach(clearTimeout)
        this.emit('ended', end)
        this.emitter.clear()
    }

    async answer(): Promise<void> {
        if (this.direction !== 'in' || this.state !== 'ringing') return
        this.respond('out', '200 OK', ['Content-Type: application/sdp'])
        this.ack('in')
        this.establish()
        if (this.peer) {
            this.peer.respond('in', '200 OK', ['Content-Type: application/sdp'])
            this.peer.ack('out')
            this.peer.engine.log('info', `${this.peer.remote} atendeu`)
            this.peer.establish()
        }
    }

    async reject(): Promise<void> {
        if (this.state !== 'ringing') return
        this.respond('out', '486 Busy Here')
        this.ack('in')
        this.end({ by: 'local', code: 486, reason: 'Busy Here' })
        this.peer?.respond('in', '486 Busy Here')
        this.peer?.ack('out')
        this.peer?.end({ by: 'remote', code: 486, reason: 'Busy Here' })
    }

    async hangup(): Promise<void> {
        if (this.state === 'ended') return
        if (this.state === 'ringing' && this.direction === 'out') {
            for (const [leg, dir] of [
                [this, 'out'],
                [this.peer, 'in']
            ] as const) {
                if (!leg) continue
                const back = dir === 'out' ? 'in' : 'out'
                leg.sip(dir, `CANCEL ${leg.uri} SIP/2.0`, 'CANCEL')
                leg.sip(back, 'SIP/2.0 200 OK', 'CANCEL')
                leg.respond(back, '487 Request Terminated')
                leg.ack(dir)
            }
            this.end({ by: 'local', code: 487, reason: 'Request Terminated' })
            this.peer?.end({ by: 'remote', code: 487, reason: 'Chamada cancelada por quem ligou' })
            return
        }
        if (this.state === 'ringing') return this.reject()
        this.exchange('out', 'BYE')
        this.end({ by: 'local' })
        this.peer?.exchange('in', 'BYE')
        this.peer?.end({ by: 'remote' })
    }

    setMuted(muted: boolean): void {
        this.muted = muted
        this.engine.log('info', muted ? 'Microfone mudo' : 'Microfone ativo')
    }

    /** O outro lado tocou um áudio: por `ms`, é esse o volume que esta ponta ouve. */
    hears(db: number, ms: number): void {
        this.heard = { db, until: Date.now() + ms }
    }

    /**
     * Volume simulado (RF-41): sem ninguém em mudo ou em espera, cada ponta ouve a "voz" da outra, e a
     * URA fala o tempo todo. Um áudio tocado pelo outro lado vale mais que a voz enquanto durar.
     */
    async audioLevel(): Promise<number | null> {
        if (this.state !== 'established' || this.held || this.peer?.held) return SILENCE_DB
        if (this.heard && Date.now() < this.heard.until) return this.heard.db
        if (this.peer) return this.peer.muted ? SILENCE_DB : MOCK_VOICE_DB
        return MOCK_VOICE_DB
    }

    async playAudio(pcm: Int16Array): Promise<void> {
        if (this.state !== 'established') throw new Error('A chamada ainda não foi atendida')
        const ms = Math.round((pcm.length / SAMPLE_RATE) * 1000)
        this.engine.log('info', `Tocando áudio de ${ms} ms na chamada`)
        this.peer?.hears(levelDb(pcm), ms)
        await new Promise<void>((done) => this.later(ms, done))
    }

    async setHeld(held: boolean): Promise<void> {
        if (this.state !== 'established') return
        this.held = held
        const sdp = ['Content-Type: application/sdp', '', `a=${held ? 'sendonly' : 'sendrecv'}`]
        this.ack('out', this.exchange('out', 'INVITE', sdp))
        this.peer?.ack('in', this.peer.exchange('in', 'INVITE', sdp))
        this.emit(held ? 'hold' : 'unhold', 'local')
        this.peer?.emit(held ? 'hold' : 'unhold', 'remote')
    }

    async sendDtmf(tone: string, mode: DtmfMode): Promise<void> {
        if (this.state !== 'established') throw new Error('A chamada ainda não foi atendida')
        // O DTMF por RTP não passa pelo SIP: vai no áudio (RFC 4733).
        if (mode === 'rtp-event') this.engine.log('info', `RTP telephone-event ${tone}`)
        else this.exchange('out', 'INFO', ['Content-Type: application/dtmf-relay', '', `Signal=${tone}`])
        if (this.ivr) this.engine.log('info', `URA recebeu o dígito ${tone}`)
        this.peer?.emit('dtmf', tone)
    }

    async transfer(target: string): Promise<void> {
        if (this.state !== 'established') throw new Error('Só chamadas em andamento podem ser transferidas')
        this.exchange('out', 'REFER', [`Refer-To: <sip:${target}@${this.engine.domain}>`], '202 Accepted')
        this.emit('transfer', 100, 'Trying', false)
        this.later(150, () => this.emit('transfer', 180, 'Ringing', false))
        this.later(400, () => {
            this.emit('transfer', 200, 'OK', true)
            this.engine.log('info', `Transferido para ${target}`)
            this.exchange('in', 'BYE')
            this.end({ by: 'local', reason: `Transferida para ${target}` })
            this.peer?.end({ by: 'remote', reason: `Transferida para ${target}` })
        })
    }

    async attendedTransfer(consult: EngineCall): Promise<void> {
        const other = consult instanceof MockCall ? consult : undefined
        if (this.state !== 'established' || other?.state !== 'established')
            throw new Error('As duas chamadas precisam estar em andamento')
        const a = this.peer
        const c = other.peer
        this.exchange(
            'out',
            'REFER',
            [
                `Refer-To: <sip:${other.remote}@${this.engine.domain}?Replaces=${other.callId}>`,
                `Referred-By: <sip:${this.engine.extension}@${this.engine.domain}>`
            ],
            '202 Accepted'
        )
        this.emit('transfer', 100, 'Trying', false)
        this.later(300, () => {
            if (this.state !== 'established' || other.state !== 'established') {
                this.emit('transfer', 481, 'Call/Transaction Does Not Exist', true)
                return
            }
            this.emit('transfer', 200, 'OK', true)
            // O PBX junta os dois lados remotos e derruba as duas pernas locais.
            if (a) {
                // Sem ponta C local (ex.: URA), A passa a falar com o destino simulado.
                a.peer = c
                a.ivr = other.ivr
                a.engine.log('info', `Agora em chamada com ${other.remote} (transferência de ${this.engine.extension})`)
                a.exchange('in', 'INVITE', [`Replaces: ${this.callId}`])
            }
            if (c) {
                c.peer = a
                c.engine.log('info', `Agora em chamada com ${this.remote} (transferência de ${this.engine.extension})`)
                c.exchange('in', 'INVITE')
            }
            this.engine.log('info', `${this.remote} transferido para ${other.remote}`)
            this.exchange('in', 'BYE')
            other.exchange('in', 'BYE')
            this.end({ by: 'remote', reason: `Transferida para ${other.remote}` })
            other.end({ by: 'remote', reason: `Transferência concluída com ${this.remote}` })
        })
    }

    async setInputDevice(deviceId: string): Promise<void> {
        this.engine.log('info', `Microfone da chamada trocado para ${deviceId || 'o padrão do sistema'}`)
    }

    async quality(): Promise<CallQuality | null> {
        if (this.state !== 'established') return null
        const jitter = 4 + Math.round(Math.random() * 6)
        return {
            score: 93 - jitter,
            level: 'excellent',
            jitterMs: jitter,
            packetLossPercent: 0.1,
            rttMs: 38,
            codec: 'opus (simulado)'
        }
    }
}

export class MockEngine implements SipEngine {
    private emitter = new Emitter<EngineEvents>()
    private status: RegStatus = { state: 'disconnected' }
    readonly domain: string
    readonly extension: string
    private calls = new Set<MockCall>()
    private readonly registerCallId: string
    private registerSeq = 0

    constructor(
        private account: Account,
        private password: string
    ) {
        this.domain = account.domain.toLowerCase()
        this.extension = account.extension
        this.registerCallId = `reg-${nextId++}-${Math.random().toString(36).slice(2, 8)}@${this.domain}`
    }

    on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    log(level: LogLevel, text: string, kind: LogKind = 'event'): void {
        this.emitter.emit('log', { level, kind, text })
    }

    /** Mensagem do SIP bruto simulado: a linha inicial e os cabeçalhos que o diagrama de escada usa. */
    sip(
        dir: 'out' | 'in',
        start: string,
        dialog: { callId: string; seq: number; method: string },
        extra: string[] = []
    ): void {
        if (!this.account.rawSipLog) return
        const lines = [
            `${dir === 'out' ? '→' : '←'} ${start}`,
            `Call-ID: ${dialog.callId}`,
            `CSeq: ${dialog.seq} ${dialog.method}`,
            ...extra
        ]
        this.log('info', lines.join('\n'), 'sip')
    }

    private register(expires: number): number {
        const seq = ++this.registerSeq
        this.sip(
            'out',
            `REGISTER sip:${this.domain} SIP/2.0`,
            { callId: this.registerCallId, seq, method: 'REGISTER' },
            [`Expires: ${expires}`]
        )
        return seq
    }

    private registerReply(seq: number, status: string): void {
        this.sip('in', `SIP/2.0 ${status}`, { callId: this.registerCallId, seq, method: 'REGISTER' })
    }

    private setStatus(status: RegStatus): void {
        this.status = status
        this.emitter.emit('status', status)
    }

    get registered(): boolean {
        return this.status.state === 'registered'
    }

    connect(): Promise<void> {
        this.setStatus({ state: 'connecting' })
        const first = this.register(600)
        return new Promise((resolve) =>
            setTimeout(() => {
                // Como um PBX de verdade: o primeiro REGISTER recebe o desafio, o segundo leva a senha.
                this.registerReply(first, '401 Unauthorized')
                if (!this.password) {
                    this.setStatus({ state: 'error', code: 401, reason: 'Unauthorized' })
                } else if (/^(errada|wrong)$/i.test(this.password)) {
                    this.registerReply(this.register(600), '403 Forbidden')
                    this.setStatus({ state: 'error', code: 403, reason: 'Forbidden' })
                } else {
                    this.registerReply(this.register(600), '200 OK')
                    registry.add(this)
                    this.setStatus({ state: 'registered' })
                }
                resolve()
            }, MOCK_TIMING.register)
        )
    }

    async disconnect(): Promise<void> {
        for (const call of this.calls) await call.hangup()
        registry.delete(this)
        if (this.status.state === 'registered') this.registerReply(this.register(0), '200 OK')
        this.setStatus({ state: 'disconnected' })
    }

    private track(call: MockCall): MockCall {
        this.calls.add(call)
        call.on('ended', () => this.calls.delete(call))
        return call
    }

    async dial(destination: string): Promise<EngineCall> {
        if (!this.registered) throw new Error('A conta precisa estar registrada para ligar')
        const call = this.track(new MockCall(this, 'out', destination))
        call.sip('out', `INVITE sip:${destination}@${this.domain} SIP/2.0`, 'INVITE', 1, [
            `From: <sip:${this.extension}@${this.domain}>`,
            `To: <sip:${destination}@${this.domain}>`,
            'Content-Type: application/sdp'
        ])
        call.later(MOCK_TIMING.trying, () => {
            call.respond('in', '100 Trying')
            call.emit('progress', 100, 'Trying', false)
            this.route(call, destination)
        })
        return call
    }

    private route(call: MockCall, destination: string): void {
        const fail = (code: number, reason: string): void => {
            call.respond('in', `${code} ${reason}`)
            call.ack('out')
            call.end({ by: 'remote', code, reason })
        }
        const target = [...registry].find(
            (e) => e !== this && e.domain === this.domain && e.extension === destination && e.registered
        )

        if (target) {
            const incoming = target.receive(this.extension, this.account.displayName || this.account.name, call)
            call.peer = incoming
            call.later(MOCK_TIMING.ringing, () => {
                if (call.state !== 'ringing') return
                call.respond('in', '180 Ringing')
                call.emit('progress', 180, 'Ringing', false)
            })
            call.later(MOCK_TIMING.noAnswer, () => {
                if (call.state !== 'ringing') return
                fail(480, 'Temporarily Unavailable')
                incoming.end({ by: 'remote', code: 487, reason: 'Ninguém atendeu' })
            })
            return
        }
        if (destination === '486') return fail(486, 'Busy Here')
        if (destination === '408') {
            call.later(MOCK_TIMING.ringing, () => {
                call.respond('in', '180 Ringing')
                call.emit('progress', 180, 'Ringing', false)
            })
            call.later(MOCK_TIMING.timeout, () => fail(408, 'Request Timeout'))
            return
        }
        if (destination.startsWith('8')) {
            call.ivr = true
            call.later(MOCK_TIMING.ringing, () => {
                call.respond('in', '183 Session Progress', ['Content-Type: application/sdp'])
                call.emit('progress', 183, 'Session Progress', true)
            })
            call.later(MOCK_TIMING.ivrAnswer, () => {
                call.respond('in', '200 OK', ['Content-Type: application/sdp'])
                call.ack('out')
                this.log('info', 'URA atendeu: "Digite 1 para suporte, 2 para vendas"')
                call.establish()
            })
            return
        }
        fail(404, 'Not Found')
    }

    receive(from: string, fromName: string, peer: MockCall): MockCall {
        const call = this.track(new MockCall(this, 'in', from, fromName))
        call.peer = peer
        call.sip('in', `INVITE sip:${this.extension}@${this.domain} SIP/2.0`, 'INVITE', 1, [
            `From: <sip:${from}@${this.domain}>`,
            `To: <sip:${this.extension}@${this.domain}>`,
            'Content-Type: application/sdp'
        ])
        call.respond('out', '100 Trying')
        call.respond('out', '180 Ringing')
        this.emitter.emit('incoming', call)
        return call
    }

    async health(): Promise<HealthReport> {
        return {
            websocketConnected: this.status.state !== 'disconnected',
            registered: this.registered,
            latencyMs: this.registered ? 20 + Math.round(Math.random() * 30) : undefined,
            error: this.registered ? undefined : 'Conta não registrada',
            checkedAt: new Date()
        }
    }

    async dispose(): Promise<void> {
        await this.disconnect()
        this.emitter.clear()
    }
}
