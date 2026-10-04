// Uma chamada do motor próprio (RF-39, segunda entrega): o diálogo SIP (INVITE, ACK, CANCEL, BYE,
// re-INVITE, INFO e REFER) e o áudio RTP em G.711, com ou sem cifra (SRTP por SDES). Tem espera e
// transferência cega e assistida.

import { randomBytes } from 'node:crypto'
import { digestAuthorization, parseChallenge, type DigestChallenge } from './digest'
import { addressOf, cseqOf, header, headerParams, headers, type SipRequest, type SipResponse } from './message'
import { RtpSession, type RtpStats } from './rtp'
import { answerDirection, buildSdp, parseSdp, SdpError, type MediaDirection, type RemoteMedia } from './sdp'
import type { G711 } from './g711'
import { newSrtpKey } from './srtp'
import { levelDb, SILENCE_DB } from '@shared/audio'
import { FRAME_SAMPLES } from './rtp'

const token = (bytes = 6): string => randomBytes(bytes).toString('hex')
const DTMF_PAYLOAD = 101
const T1 = 500
const T2 = 4000

export interface CallEnd {
    code?: number
    reason?: string
    by: 'local' | 'remote' | 'system'
}

export interface CallEvents {
    progress(code: number, reason: string, earlyMedia: boolean): void
    established(): void
    ended(end: CallEnd): void
    /** `by` diz quem pôs em espera ou retomou: esta conta ou o outro lado. */
    hold(held: boolean, by: 'local' | 'remote'): void
    /** Andamento de uma transferência pedida por esta conta (NOTIFY do REFER). */
    transfer(code: number, reason: string, final: boolean): void
    dtmf(tone: string): void
    audio(pcm: Int16Array): void
}

/** O que a chamada usa do user-agent: transporte, transações e a identidade da conta. */
export interface CallHost {
    readonly user: string
    readonly domain: string
    readonly authUser: string
    readonly password: string
    readonly displayName?: string
    /** A conta exige áudio cifrado: oferece SRTP ao ligar e recusa quem liga sem ele. */
    readonly srtp: boolean
    /** Endereço que o outro lado alcança, para o Contact e o SDP. */
    contactUri(): string
    mediaAddress(): string
    viaHeader(): string
    userAgent(): string
    /** Transação cliente: devolve a resposta final. Para INVITE, não desiste depois de um provisório. */
    transact(request: SipRequest, onProvisional?: (response: SipResponse) => void): Promise<SipResponse>
    /** ACK de um 2xx: vai direto, com branch próprio, fora de transação. */
    sendDirect(request: SipRequest): void
    respond(request: SipRequest, status: number, reason: string, options?: ResponseOptions): void
    /** O transporte repete sozinho (TCP, TLS)? Em UDP, o 200 do INVITE é repetido até o ACK. */
    readonly reliable: boolean
    log(level: 'info' | 'warn' | 'error', text: string): void
    forget(call: SipCall): void
}

export interface ResponseOptions {
    toTag?: string
    extra?: [string, string][]
    body?: string
}

type State = 'calling' | 'ringing' | 'established' | 'ended'

export class SipCall {
    readonly callId: string
    private state: State
    private localTag = token()
    private remoteTag?: string
    /** Para onde vão os pedidos dentro do diálogo: o Contact do outro lado. */
    private remoteTarget?: string
    private routes: string[] = []
    private cseq = 0
    private challenge?: { value: DigestChallenge; proxy: boolean; count: number }
    private rtp: RtpSession
    private rtpPort = 0
    private codecs: G711[] = ['PCMU', 'PCMA']
    private sdpVersion = 1
    private readonly sdpSession = Date.now()
    private remoteHeld = false
    private localHeld = false
    /** Áudio cifrado nesta chamada: a nossa chave, a do outro lado e o número da linha a=crypto. */
    private secure = false
    private localKey?: string
    private remoteKey?: string
    private cryptoTag = 1
    private muted = false
    /** INVITE recebido, guardado para as respostas; ou o que mandamos, para o CANCEL. */
    private invite?: SipRequest
    private lastResponse?: { status: number; reason: string; options: ResponseOptions }
    private retransmit?: ReturnType<typeof setTimeout>
    private lastAck?: SipRequest
    private canceled = false
    /** Volume dos últimos blocos recebidos, para os cenários saberem se há áudio (RF-41). */
    private levels: { at: number; db: number }[] = []
    /** Áudio que está sendo tocado no lugar do microfone, e por onde ele vai. */
    private playing?: { timer: ReturnType<typeof setInterval>; done: () => void }
    /** Quem quer uma cópia do áudio que passa, nos dois sentidos (gravação, RF-36). */
    tap?: (side: 'sent' | 'received', pcm: Int16Array) => void
    private gotProvisional = false

    constructor(
        private host: CallHost,
        private events: CallEvents,
        readonly direction: 'in' | 'out',
        readonly remote: string,
        readonly remoteName: string | undefined,
        callId?: string
    ) {
        this.callId = callId ?? `${token(12)}@iris`
        this.state = direction === 'out' ? 'calling' : 'ringing'
        this.rtp = new RtpSession({
            audio: (pcm) => {
                this.levels.push({ at: Date.now(), db: levelDb(pcm) })
                if (this.levels.length > 50) this.levels.shift()
                this.tap?.('received', pcm)
                this.events.audio(pcm)
            },
            dtmf: (tone) => this.events.dtmf(tone)
        })
    }

    get ended(): boolean {
        return this.state === 'ended'
    }

    // ─── Montagem dos pedidos ──────────────────────────────────────────────

    private localAddress(): string {
        const name = this.host.displayName ? `"${this.host.displayName.replace(/(["\\])/g, '\\$1')}" ` : ''
        return `${name}<sip:${this.host.user}@${this.host.domain}>;tag=${this.localTag}`
    }

    private remoteAddress(): string {
        return `<sip:${this.remote}@${this.host.domain}>${this.remoteTag ? `;tag=${this.remoteTag}` : ''}`
    }

    private build(method: string, uri: string, body = '', contentType?: string, extra: [string, string][] = []) {
        const seq = method === 'ACK' || method === 'CANCEL' ? this.cseq : ++this.cseq
        const list: [string, string][] = [
            ['Via', this.host.viaHeader()],
            ...this.routes.map((route): [string, string] => ['Route', route]),
            ['Max-Forwards', '70'],
            ['From', this.localAddress()],
            ['To', this.remoteAddress()],
            ['Call-ID', this.callId],
            ['CSeq', `${seq} ${method}`],
            ['Contact', `<${this.host.contactUri()}>`],
            ['User-Agent', this.host.userAgent()],
            ...extra
        ]
        if (this.challenge && method !== 'ACK' && method !== 'CANCEL') {
            const c = this.challenge
            list.push([
                c.proxy ? 'Proxy-Authorization' : 'Authorization',
                digestAuthorization({
                    challenge: c.value,
                    method,
                    uri,
                    username: this.host.authUser,
                    password: this.host.password,
                    nc: ++c.count
                })
            ])
        }
        if (contentType) list.push(['Content-Type', contentType])
        const request: SipRequest = { kind: 'request', method, uri, headers: list, body }
        return request
    }

    /** Pedido dentro do diálogo, respondendo a um desafio se o PBX pedir a senha de novo. */
    private async inDialog(
        method: string,
        body = '',
        contentType?: string,
        extra: [string, string][] = []
    ): Promise<SipResponse> {
        const uri = this.remoteTarget ?? `sip:${this.remote}@${this.host.domain}`
        let response = await this.host.transact(this.build(method, uri, body, contentType, extra))
        if ((response.status === 401 || response.status === 407) && this.takeChallenge(response, true))
            response = await this.host.transact(this.build(method, uri, body, contentType, extra))
        return response
    }

    /** `first` é a primeira recusa deste pedido: um desafio novo é aceito mesmo sem `stale`. */
    private takeChallenge(response: SipResponse, first: boolean): boolean {
        const proxy = response.status === 407
        const value = header(response, proxy ? 'Proxy-Authenticate' : 'WWW-Authenticate')
        if (!value) return false
        const challenge = parseChallenge(value)
        // Recusa repetida com a mesma senha: não insiste, a não ser que o nonce tenha vencido.
        if (!first && !challenge.stale) return false
        this.challenge = { value: challenge, proxy, count: 0 }
        return true
    }

    private localSdp(direction: MediaDirection, codecs = this.codecs): string {
        return buildSdp({
            address: this.host.mediaAddress(),
            port: this.rtpPort,
            codecs,
            dtmfPayload: DTMF_PAYLOAD,
            direction,
            sessionId: this.sdpSession,
            version: this.sdpVersion++,
            crypto: this.secure && this.localKey ? { tag: this.cryptoTag, key: this.localKey } : undefined
        })
    }

    /** `answer`: é a resposta a um pedido nosso; o sentido dela espelha o nosso e não diz nada do outro lado. */
    private applyRemote(media: RemoteMedia, answer = false): void {
        if (this.secure && !media.crypto) throw new SdpError('O outro lado não aceitou o áudio cifrado (SRTP)')
        // Só troca a cifra quando a chave muda: recriar com a mesma chave perderia a contagem de voltas
        // do número de sequência, e os pacotes seguintes não confeririam.
        const remoteKey = this.secure ? media.crypto?.key : undefined
        if (remoteKey !== this.remoteKey) {
            this.remoteKey = remoteKey
            this.rtp.setCrypto(remoteKey && this.localKey ? { local: this.localKey, remote: remoteKey } : undefined)
        }
        this.rtp.setRemote({
            address: media.address,
            port: media.port,
            codec: media.codec,
            payload: media.payload,
            dtmfPayload: media.dtmfPayload
        })
        this.codecs = [media.codec]
        // "sendonly" ou "inactive" do outro lado: ele nos pôs em espera.
        const held = media.direction === 'sendonly' || media.direction === 'inactive'
        if (!answer && held !== this.remoteHeld) {
            this.remoteHeld = held
            this.events.hold(held, 'remote')
        }
        this.updateFlow()
    }

    /** Em espera, de qualquer lado, o microfone não vai; na nossa espera, o que chega também é descartado. */
    private updateFlow(): void {
        this.rtp.sendAudio = !this.muted && !this.remoteHeld && !this.localHeld
        this.rtp.receiveAudio = !this.localHeld
    }

    /** O sentido do nosso áudio, juntando a nossa espera com a do outro lado. */
    private mediaDirection(): MediaDirection {
        if (this.localHeld) return this.remoteHeld ? 'inactive' : 'sendonly'
        return this.remoteHeld ? 'recvonly' : 'sendrecv'
    }

    private finish(end: CallEnd): void {
        if (this.state === 'ended') return
        this.state = 'ended'
        this.stopPlaying()
        clearTimeout(this.retransmit)
        this.rtp.close()
        this.host.forget(this)
        this.events.ended(end)
    }

    // ─── Chamada feita ─────────────────────────────────────────────────────

    /** Manda o INVITE e acompanha até atender ou falhar. Os erros viram `ended`. */
    async start(extraHeaders: [string, string][] = []): Promise<void> {
        try {
            this.rtpPort = await this.rtp.open()
            if (this.host.srtp) {
                this.secure = true
                this.localKey = newSrtpKey()
            }
            const uri = `sip:${this.remote}@${this.host.domain}`
            let response: SipResponse
            for (let tries = 0; ; tries++) {
                const invite = this.build('INVITE', uri, this.localSdp('sendrecv'), 'application/sdp', extraHeaders)
                this.invite = invite
                response = await this.host.transact(invite, (provisional) => this.onProvisional(provisional))
                if ((response.status === 401 || response.status === 407) && !this.canceled) {
                    if (this.takeChallenge(response, tries === 0)) continue
                }
                break
            }
            if (this.state === 'ended') return
            if (response.status >= 300) {
                const by = this.canceled ? 'local' : 'remote'
                return this.finish({ code: response.status, reason: response.reason, by })
            }
            this.confirm(response)
            if (this.canceled) return void this.hangup()
        } catch (error) {
            this.finish({ reason: error instanceof Error ? error.message : String(error), by: 'system' })
        }
    }

    private onProvisional(response: SipResponse): void {
        const first = !this.gotProvisional
        this.gotProvisional = true
        if (this.canceled) {
            if (first) void this.sendCancel()
            return
        }
        if (response.status === 100) return
        let early = false
        if (response.body.trim()) {
            try {
                // 183 com SDP: o áudio do PBX (toque, mensagem) já pode chegar antes de atender.
                this.applyRemote(parseSdp(response.body), true)
                early = true
            } catch {
                // SDP provisório que não serve: espera o da resposta final.
            }
        }
        if (this.state === 'calling') this.state = 'ringing'
        this.events.progress(response.status, response.reason, early)
    }

    /** O 200 do INVITE: fecha o diálogo, aponta o áudio e manda o ACK. */
    private confirm(response: SipResponse): void {
        this.remoteTag = headerParams(header(response, 'To') ?? '')['tag'] ?? undefined
        const contact = header(response, 'Contact')
        if (contact) this.remoteTarget = addressOf(contact).uri
        // O caminho de volta é o Record-Route ao contrário (RFC 3261, 12.1.2).
        this.routes = headers(response, 'Record-Route').reverse()
        const ack = this.build('ACK', this.remoteTarget ?? `sip:${this.remote}@${this.host.domain}`)
        this.lastAck = ack
        this.host.sendDirect(ack)
        try {
            this.applyRemote(parseSdp(response.body))
        } catch (error) {
            this.host.log('error', `SDP da resposta recusado: ${(error as Error).message}`)
            void this.inDialog('BYE').catch(() => undefined)
            return this.finish({ code: 488, reason: (error as Error).message, by: 'system' })
        }
        this.state = 'established'
        this.events.established()
    }

    /** O 200 chegou de novo: o nosso ACK se perdeu. */
    onRepeatedOk(): void {
        if (this.lastAck) this.host.sendDirect(this.lastAck)
    }

    // ─── Chamada recebida ──────────────────────────────────────────────────

    /** Primeiro INVITE de uma chamada nova: avisa que está tocando. */
    ring(invite: SipRequest): void {
        this.invite = invite
        this.remoteTag = headerParams(header(invite, 'From') ?? '')['tag'] ?? undefined
        const contact = header(invite, 'Contact')
        if (contact) this.remoteTarget = addressOf(contact).uri
        this.routes = headers(invite, 'Record-Route')
        this.host.respond(invite, 100, 'Trying')
        this.send(180, 'Ringing')
    }

    private send(status: number, reason: string, options: ResponseOptions = {}): void {
        if (!this.invite) return
        const full = { ...options, toTag: this.localTag }
        this.lastResponse = { status, reason, options: full }
        this.host.respond(this.invite, status, reason, full)
    }

    async answer(): Promise<void> {
        if (this.direction !== 'in' || this.state !== 'ringing' || !this.invite) return
        let media: RemoteMedia
        try {
            media = parseSdp(this.invite.body)
        } catch (error) {
            const reason = error instanceof SdpError ? error.message : 'SDP inválido'
            this.send(488, 'Not Acceptable Here')
            return this.finish({ code: 488, reason, by: 'system' })
        }
        if (this.host.srtp && !media.crypto) {
            this.send(488, 'Not Acceptable Here')
            return this.finish({ code: 488, reason: 'Esta conta exige áudio cifrado (SRTP)', by: 'system' })
        }
        this.rtpPort = await this.rtp.open()
        if (this.state !== 'ringing') return
        // Quem liga oferece a cifra: a resposta usa a mesma linha a=crypto, com a nossa chave.
        if (media.crypto) {
            this.secure = true
            this.localKey = newSrtpKey()
            this.cryptoTag = media.crypto.tag
        }
        this.applyRemote(media)
        const body = this.localSdp(answerDirection(media.direction), [media.codec])
        this.state = 'established'
        this.send(200, 'OK', {
            body,
            extra: [
                ['Contact', `<${this.host.contactUri()}>`],
                ['Content-Type', 'application/sdp']
            ]
        })
        // Em UDP, repete o 200 até o ACK chegar (RFC 3261, 13.3.1.4).
        if (!this.host.reliable) {
            let wait = T1
            let total = 0
            const again = (): void => {
                if (this.state !== 'established' || !this.lastResponse) return
                total += wait
                if (total >= 64 * T1) return void this.hangup()
                this.host.respond(this.invite!, 200, 'OK', this.lastResponse.options)
                wait = Math.min(wait * 2, T2)
                this.retransmit = setTimeout(again, wait)
            }
            this.retransmit = setTimeout(again, wait)
        }
        this.events.established()
    }

    reject(): void {
        if (this.direction !== 'in' || this.state !== 'ringing') return
        this.send(486, 'Busy Here')
        this.finish({ code: 486, reason: 'Recusada', by: 'local' })
    }

    // ─── Ações ─────────────────────────────────────────────────────────────

    async hangup(): Promise<void> {
        if (this.state === 'ended') return
        if (this.direction === 'in' && this.state === 'ringing') return this.reject()
        if (this.state !== 'established') {
            // Antes de atender: CANCEL, com o mesmo branch do INVITE. O 487 que vem depois encerra.
            // Só depois de um provisório (RFC 3261, 9.1); se ainda não veio, sai quando ele chegar.
            this.canceled = true
            if (this.gotProvisional) await this.sendCancel()
            return
        }
        const bye = this.inDialog('BYE').catch(() => undefined)
        this.finish({ by: 'local' })
        await bye
    }

    private async sendCancel(): Promise<void> {
        const invite = this.invite
        if (!invite) return
        {
            const cancel: SipRequest = {
                kind: 'request',
                method: 'CANCEL',
                uri: invite.uri,
                headers: [
                    ['Via', header(invite, 'Via') ?? ''],
                    ['Max-Forwards', '70'],
                    ['From', header(invite, 'From') ?? ''],
                    ['To', header(invite, 'To') ?? ''],
                    ['Call-ID', this.callId],
                    ['CSeq', `${cseqOf(invite).seq} CANCEL`],
                    ['User-Agent', this.host.userAgent()]
                ],
                body: ''
            }
            await this.host.transact(cancel).catch(() => undefined)
        }
    }

    setMuted(muted: boolean): void {
        this.muted = muted
        this.updateFlow()
    }

    /** Espera e retomada: um re-INVITE mudando o sentido do áudio (RFC 3264, 8.4). */
    async setHeld(held: boolean): Promise<void> {
        if (this.state !== 'established') throw new Error('A chamada não está em andamento')
        if (held === this.localHeld) return
        this.localHeld = held
        try {
            await this.reinvite()
        } catch (error) {
            this.localHeld = !held
            this.updateFlow()
            throw error
        }
        this.updateFlow()
        this.events.hold(held, 'local')
    }

    private async reinvite(): Promise<void> {
        const uri = this.remoteTarget ?? `sip:${this.remote}@${this.host.domain}`
        let response: SipResponse
        for (let tries = 0; ; tries++) {
            const request = this.build('INVITE', uri, this.localSdp(this.mediaDirection()), 'application/sdp')
            response = await this.host.transact(request)
            if ((response.status === 401 || response.status === 407) && this.takeChallenge(response, tries === 0))
                continue
            break
        }
        if (response.status >= 300) throw new Error(`O PBX recusou: ${response.status} ${response.reason}`)
        this.host.sendDirect(this.build('ACK', uri))
        if (!response.body.trim()) return
        try {
            this.applyRemote(parseSdp(response.body), true)
        } catch {
            // Resposta sem áudio aproveitável: fica com o endereço que já valia.
        }
    }

    /** Transferência cega (RF-15): pede ao outro lado que ligue para `target` (REFER, RFC 3515). */
    transfer(target: string): Promise<void> {
        return this.refer(`<sip:${target}@${this.host.domain}>`)
    }

    /**
     * Transferência assistida (RF-16): o outro lado desta chamada assume o lugar desta conta na chamada
     * de consulta (REFER com Replaces, RFC 3891).
     */
    async attendedTransfer(consult: SipCall): Promise<void> {
        if (consult.state !== 'established' || !consult.remoteTag)
            throw new Error('A chamada de consulta precisa estar em andamento')
        const replaces = `${consult.callId};to-tag=${consult.remoteTag};from-tag=${consult.localTag}`
        await this.refer(`<sip:${consult.remote}@${this.host.domain}?Replaces=${encodeURIComponent(replaces)}>`)
    }

    private async refer(referTo: string): Promise<void> {
        if (this.state !== 'established') throw new Error('A chamada não está em andamento')
        const response = await this.inDialog('REFER', '', undefined, [
            ['Refer-To', referTo],
            ['Referred-By', `<sip:${this.host.user}@${this.host.domain}>`]
        ])
        // A recusa já é o resultado final; o aceite (202) só diz que o outro lado vai tentar.
        if (response.status >= 300) this.events.transfer(response.status, response.reason, true)
    }

    /** 20 ms do microfone. Enquanto um tom ou arquivo toca, o microfone é descartado. */
    sendPcm(pcm: Int16Array): void {
        if (this.state === 'ended' || this.playing) return
        this.tap?.('sent', pcm)
        this.rtp.sendPcm(pcm)
    }

    /**
     * Toca um áudio na chamada, no lugar do microfone (RF-41). O ritmo vem do relógio, não de um
     * temporizador exato: a cada volta manda os blocos que já deveriam ter saído.
     */
    play(pcm: Int16Array): Promise<void> {
        if (this.state !== 'established') return Promise.reject(new Error('A chamada não está em andamento'))
        this.stopPlaying()
        return new Promise<void>((done) => {
            const started = Date.now()
            let sent = 0
            const total = Math.ceil(pcm.length / FRAME_SAMPLES)
            const tick = (): void => {
                const due = Math.min(total, Math.floor((Date.now() - started) / 20) + 1)
                for (; sent < due; sent++) {
                    const frame = new Int16Array(FRAME_SAMPLES)
                    frame.set(pcm.subarray(sent * FRAME_SAMPLES, (sent + 1) * FRAME_SAMPLES))
                    this.tap?.('sent', frame)
                    this.rtp.sendPcm(frame)
                }
                if (sent >= total) this.stopPlaying()
            }
            this.playing = { timer: setInterval(tick, 10), done }
            tick()
        })
    }

    private stopPlaying(): void {
        const playing = this.playing
        if (!playing) return
        this.playing = undefined
        clearInterval(playing.timer)
        playing.done()
    }

    /** Volume médio do que chegou nos últimos `windowMs`, em dBFS; silêncio total se nada chegou. */
    receivedLevel(windowMs = 400): number {
        const since = Date.now() - windowMs
        const recent = this.levels.filter((l) => l.at >= since)
        if (recent.length === 0) return SILENCE_DB
        // Média em potência, não em decibéis: um bloco alto no meio do silêncio conta.
        const power = recent.reduce((sum, l) => sum + 10 ** (l.db / 10), 0) / recent.length
        return Math.max(SILENCE_DB, Math.round(10 * Math.log10(power)))
    }

    /** `auto` usa RTP (RFC 4733) quando o outro lado aceita; senão, SIP INFO. */
    async sendDtmf(tone: string, mode: 'auto' | 'rtp-event' | 'sip-info'): Promise<void> {
        if (this.state !== 'established') throw new Error('A chamada não está em andamento')
        if (!/^[0-9*#A-D]$/i.test(tone)) throw new Error(`Dígito inválido: ${tone}`)
        if (mode === 'sip-info') {
            const response = await this.inDialog('INFO', `Signal=${tone}\r\nDuration=160\r\n`, 'application/dtmf-relay')
            if (response.status >= 300) throw new Error(`O PBX recusou o INFO: ${response.status} ${response.reason}`)
            return
        }
        try {
            await this.rtp.sendDtmf(tone)
        } catch (error) {
            if (mode === 'rtp-event') throw error
            await this.sendDtmf(tone, 'sip-info')
        }
    }

    stats(): RtpStats & { codec: string; secure: boolean } {
        return { ...this.rtp.getStats(), codec: this.codecs[0] ?? 'PCMU', secure: this.secure }
    }

    // ─── Pedidos que chegam dentro da chamada ──────────────────────────────

    onRequest(request: SipRequest): void {
        const options: ResponseOptions = { toTag: this.localTag }
        switch (request.method) {
            case 'ACK':
                clearTimeout(this.retransmit)
                return
            case 'INVITE': {
                // O mesmo INVITE repetido (UDP): manda de novo a última resposta.
                if (this.invite && cseqOf(request).seq === cseqOf(this.invite).seq && this.direction === 'in') {
                    if (this.lastResponse)
                        this.host.respond(
                            request,
                            this.lastResponse.status,
                            this.lastResponse.reason,
                            this.lastResponse.options
                        )
                    return
                }
                if (this.state !== 'established') return this.host.respond(request, 491, 'Request Pending', options)
                // re-INVITE: o outro lado mudou o áudio (espera, retomada, novo endereço).
                try {
                    const media = request.body.trim() ? parseSdp(request.body) : undefined
                    if (media) this.applyRemote(media)
                    // A nossa espera continua valendo mesmo que o outro lado peça áudio nos dois sentidos.
                    const direction = this.localHeld
                        ? this.mediaDirection()
                        : media
                          ? answerDirection(media.direction)
                          : 'sendrecv'
                    this.host.respond(request, 200, 'OK', {
                        ...options,
                        body: this.localSdp(direction),
                        extra: [
                            ['Contact', `<${this.host.contactUri()}>`],
                            ['Content-Type', 'application/sdp']
                        ]
                    })
                } catch {
                    this.host.respond(request, 488, 'Not Acceptable Here', options)
                }
                return
            }
            case 'CANCEL':
                this.host.respond(request, 200, 'OK', options)
                if (this.direction === 'in' && this.state === 'ringing') {
                    this.send(487, 'Request Terminated')
                    this.finish({ reason: 'Chamada cancelada por quem ligou', by: 'remote' })
                }
                return
            case 'BYE':
                this.host.respond(request, 200, 'OK', options)
                return this.finish({ by: 'remote' })
            case 'INFO': {
                const tone = /Signal\s*=\s*([0-9*#A-D])/i.exec(request.body)?.[1]
                if (tone) this.events.dtmf(tone.toUpperCase())
                return this.host.respond(request, 200, 'OK', options)
            }
            case 'NOTIFY': {
                this.host.respond(request, 200, 'OK', options)
                // O andamento da transferência vem como um pedaço de resposta SIP no corpo (RFC 3515, 2.4.5).
                const frag = /SIP\/2\.0 (\d{3})(?: ([^\r\n]*))?/.exec(request.body)
                if (!/^refer/i.test(header(request, 'Event') ?? '') || !frag) return
                const code = Number(frag[1])
                const over = /terminated/i.test(header(request, 'Subscription-State') ?? '')
                this.events.transfer(code, frag[2]?.trim() ?? '', code >= 200 || over)
                // Transferência concluída: quem transferiu sai da chamada (RFC 5589, 6.1).
                if (code >= 200 && code < 300) void this.hangup()
                return
            }
            case 'OPTIONS':
            case 'UPDATE':
                return this.host.respond(request, 200, 'OK', options)
            default:
                this.host.respond(request, 501, 'Not Implemented', options)
        }
    }

    /** O transporte caiu ou a conta foi desregistrada. */
    abort(reason: string): void {
        this.finish({ reason, by: 'system' })
    }
}
