// Uma chamada do motor próprio (RF-39, segunda entrega): o diálogo SIP (INVITE, ACK, CANCEL, BYE,
// re-INVITE e INFO) e o áudio RTP em G.711. Espera local, transferência e SRTP ficam para a terceira.

import { randomBytes } from 'node:crypto'
import { digestAuthorization, parseChallenge, type DigestChallenge } from './digest'
import { addressOf, cseqOf, header, headerParams, headers, type SipRequest, type SipResponse } from './message'
import { RtpSession, type RtpStats } from './rtp'
import { answerDirection, buildSdp, parseSdp, SdpError, type MediaDirection, type RemoteMedia } from './sdp'
import type { G711 } from './g711'

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
    hold(held: boolean): void
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
    private muted = false
    /** INVITE recebido, guardado para as respostas; ou o que mandamos, para o CANCEL. */
    private invite?: SipRequest
    private lastResponse?: { status: number; reason: string; options: ResponseOptions }
    private retransmit?: ReturnType<typeof setTimeout>
    private lastAck?: SipRequest
    private canceled = false
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
            audio: (pcm) => this.events.audio(pcm),
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
    private async inDialog(method: string, body = '', contentType?: string): Promise<SipResponse> {
        const uri = this.remoteTarget ?? `sip:${this.remote}@${this.host.domain}`
        let response = await this.host.transact(this.build(method, uri, body, contentType))
        if ((response.status === 401 || response.status === 407) && this.takeChallenge(response))
            response = await this.host.transact(this.build(method, uri, body, contentType))
        return response
    }

    private takeChallenge(response: SipResponse): boolean {
        const proxy = response.status === 407
        const value = header(response, proxy ? 'Proxy-Authenticate' : 'WWW-Authenticate')
        if (!value) return false
        const challenge = parseChallenge(value)
        // Recusa repetida com a mesma senha: não insiste, a não ser que o nonce tenha vencido.
        if (this.challenge && !challenge.stale) return false
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
            version: this.sdpVersion++
        })
    }

    private applyRemote(media: RemoteMedia): void {
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
        if (held !== this.remoteHeld) {
            this.remoteHeld = held
            this.events.hold(held)
        }
        this.rtp.sendAudio = !this.muted && media.direction !== 'sendonly' && media.direction !== 'inactive'
    }

    private finish(end: CallEnd): void {
        if (this.state === 'ended') return
        this.state = 'ended'
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
            const uri = `sip:${this.remote}@${this.host.domain}`
            let response: SipResponse
            for (;;) {
                const invite = this.build('INVITE', uri, this.localSdp('sendrecv'), 'application/sdp', extraHeaders)
                this.invite = invite
                response = await this.host.transact(invite, (provisional) => this.onProvisional(provisional))
                if ((response.status === 401 || response.status === 407) && !this.canceled) {
                    if (this.takeChallenge(response)) continue
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
                this.rtp.setRemote(parseSdp(response.body))
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
        this.rtpPort = await this.rtp.open()
        if (this.state !== 'ringing') return
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
        this.rtp.sendAudio = !muted && !this.remoteHeld
    }

    sendPcm(pcm: Int16Array): void {
        if (this.state !== 'ended') this.rtp.sendPcm(pcm)
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

    stats(): RtpStats & { codec: string } {
        return { ...this.rtp.getStats(), codec: this.codecs[0] ?? 'PCMU' }
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
                    const direction = media ? answerDirection(media.direction) : 'sendrecv'
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
            case 'OPTIONS':
            case 'UPDATE':
            case 'NOTIFY':
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
