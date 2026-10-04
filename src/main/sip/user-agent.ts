// User-agent do motor próprio (RF-39), primeira entrega: registro e OPTIONS por UDP, TCP ou TLS.
// Cuida das transações que não são INVITE (RFC 3261, 17.1.2), da autenticação digest, da renovação do
// registro e de responder ao que o PBX pergunta. Chamadas (INVITE e mídia) ficam para a entrega seguinte.

import { randomBytes } from 'node:crypto'
import type { SipTransportKind } from '@shared/sip-target'
import { digestAuthorization, parseChallenge, type DigestChallenge } from './digest'
import {
    cseqOf,
    header,
    headerParams,
    headers,
    parseMessage,
    serializeMessage,
    type SipMessage,
    type SipRequest,
    type SipResponse
} from './message'
import { TlsCertificateError, type SipTransport, type TransportFactory } from './transport'

export interface UserAgentConfig {
    user: string
    domain: string
    /** Usuário da autenticação, quando é diferente do ramal. */
    authUser?: string
    displayName?: string
    password: string
    transport: SipTransportKind
    host: string
    port: number
    /** TLS: o usuário aceitou o certificado inválido deste host. */
    trusted?: boolean
    /** Validade pedida no registro, em segundos. */
    expires?: number
    userAgent?: string
}

export type UaState = 'disconnected' | 'connecting' | 'connected' | 'registered' | 'error'

export interface UaStatus {
    state: UaState
    code?: number
    reason?: string
    /** Não adianta tentar de novo sozinho: depende de o usuário agir (ex.: aceitar o certificado). */
    final?: boolean
}

export interface UaEvents {
    status(status: UaStatus): void
    log(level: 'debug' | 'info' | 'warn' | 'error', kind: 'event' | 'sip', text: string): void
    /** Certificado TLS recusado; a tela oferece confiar no host (RF-37). */
    certificate(host: string, error: string): void
}

/** Temporizadores da RFC 3261 (seção 17.1.2.2), em milissegundos. */
export const T1 = 500
export const T2 = 4000
export const TIMER_F = 64 * T1

const KEEPALIVE_MS = 25_000
const MIN_REFRESH_S = 5
const ALLOW = 'OPTIONS, NOTIFY'

export class SipTimeoutError extends Error {
    constructor(method: string) {
        super(`Sem resposta do PBX ao ${method}`)
    }
}

const token = (bytes = 8): string => randomBytes(bytes).toString('hex')

/** O que vai para o log da tela: a mensagem inteira, menos a resposta do desafio (RNF-10). */
export function redact(text: string): string {
    return text.replace(/\b(response|cnonce)="[^"]*"/gi, '$1="[removido]"')
}

interface Pending {
    resolve(response: SipResponse): void
    reject(error: Error): void
    timers: ReturnType<typeof setTimeout>[]
}

export class SipUserAgent {
    private transport?: SipTransport
    private pending = new Map<string, Pending>()
    private state: UaState = 'disconnected'
    private callId = `${token(12)}@iris`
    private fromTag = token(6)
    private cseq = 0
    private nonceCount = 0
    private challenge?: { value: DigestChallenge; proxy: boolean }
    /** Endereço que o PBX vê (parâmetros received e rport do Via): vai no Contact, para atravessar NAT. */
    private contact?: { host: string; port: number }
    private refreshTimer?: ReturnType<typeof setTimeout>
    private keepalive?: ReturnType<typeof setInterval>
    private stopped = false
    private lastError?: string

    constructor(
        private config: UserAgentConfig,
        private createTransport: TransportFactory,
        private events: UaEvents
    ) {}

    get currentState(): UaState {
        return this.state
    }

    get connected(): boolean {
        return Boolean(this.transport)
    }

    get error(): string | undefined {
        return this.lastError
    }

    private setStatus(status: UaStatus): void {
        this.state = status.state
        if (status.state === 'error') this.lastError = [status.code, status.reason].filter(Boolean).join(' ')
        else if (status.state === 'registered') this.lastError = undefined
        this.events.status(status)
    }

    /** Abre o transporte e registra. Os erros viram estado `error`; a promessa nunca rejeita. */
    async start(): Promise<void> {
        const { transport: kind, host, port, trusted } = this.config
        this.setStatus({ state: 'connecting' })
        const transport = this.createTransport({ kind, host, port, trusted })
        transport.onMessage = (text) => this.receive(text)
        transport.onClose = (error) => this.dropped(error)
        try {
            await transport.open()
        } catch (error) {
            if (this.stopped) return
            const certificate = error instanceof TlsCertificateError
            if (certificate) this.events.certificate(error.host, error.code)
            const reason = error instanceof Error ? error.message : String(error)
            this.events.log('error', 'event', `Não conectou em ${host}:${port} por ${kind.toUpperCase()}: ${reason}`)
            return this.setStatus({
                state: 'error',
                reason: `Não conectou em ${host}:${port} (${reason})`,
                final: certificate
            })
        }
        if (this.stopped) return transport.close()
        this.transport = transport
        this.contact = { host: transport.local.address, port: transport.local.port }
        this.events.log(
            'info',
            'event',
            `Transporte ${kind.toUpperCase()} aberto: ${transport.local.address}:${transport.local.port} → ${host}:${port}`
        )
        this.setStatus({ state: 'connected' })
        // Mantém o caminho aberto no NAT e detecta um TCP que morreu em silêncio (RFC 5626, 3.5.1).
        this.keepalive = setInterval(() => this.transport?.send('\r\n\r\n'), KEEPALIVE_MS)
        await this.register()
    }

    /** Desregistra (sem esperar muito) e fecha. */
    async stop(): Promise<void> {
        if (this.stopped) return
        this.stopped = true
        clearTimeout(this.refreshTimer)
        clearInterval(this.keepalive)
        if (this.transport && this.state === 'registered') {
            const unregister = this.sendRegister(0).catch(() => undefined)
            await Promise.race([unregister, new Promise((done) => setTimeout(done, 1500))])
        }
        this.closeTransport()
        this.state = 'disconnected'
    }

    private closeTransport(): void {
        for (const [key, entry] of this.pending) {
            entry.timers.forEach(clearTimeout)
            entry.reject(new Error('Transporte fechado'))
            this.pending.delete(key)
        }
        this.transport?.close()
        this.transport = undefined
    }

    private dropped(error?: Error): void {
        if (this.stopped || !this.transport) return
        clearTimeout(this.refreshTimer)
        clearInterval(this.keepalive)
        this.closeTransport()
        const reason = `A conexão com o PBX caiu${error ? ` (${error.message})` : ''}`
        this.events.log('warn', 'event', reason)
        this.setStatus({ state: 'error', reason })
    }

    // ─── Registro ──────────────────────────────────────────────────────────

    private async register(): Promise<void> {
        try {
            const response = await this.sendRegister(this.config.expires ?? 300)
            if (this.stopped) return
            if (response.status >= 200 && response.status < 300) {
                const granted = this.grantedExpires(response)
                this.setStatus({ state: 'registered' })
                // Renova antes de vencer, com folga para uma retransmissão.
                const wait = Math.max(MIN_REFRESH_S, Math.round(granted * 0.85))
                clearTimeout(this.refreshTimer)
                this.refreshTimer = setTimeout(() => void this.register(), wait * 1000)
                this.events.log('debug', 'event', `Registro vale ${granted} s; renova em ${wait} s`)
            } else {
                this.setStatus({ state: 'error', code: response.status, reason: response.reason })
            }
        } catch (error) {
            if (this.stopped) return
            const timeout = error instanceof SipTimeoutError
            this.setStatus({
                state: 'error',
                code: timeout ? 408 : undefined,
                reason: error instanceof Error ? error.message : String(error)
            })
        }
    }

    /** Validade que o PBX concedeu: o `expires` do nosso Contact ou o cabeçalho Expires. */
    private grantedExpires(response: SipResponse): number {
        const mine = headers(response, 'Contact').find((c) => c.includes(`${this.config.user}@`))
        const fromContact = mine ? Number(headerParams(mine)['expires']) : NaN
        const fromHeader = Number(header(response, 'Expires'))
        const value = Number.isFinite(fromContact) ? fromContact : fromHeader
        return Number.isFinite(value) && value > 0 ? value : (this.config.expires ?? 300)
    }

    /** Manda o REGISTER e responde ao desafio (401/407) e ao "intervalo curto demais" (423). */
    private async sendRegister(expires: number): Promise<SipResponse> {
        let wanted = expires
        let authTries = 0
        for (;;) {
            const response = await this.request(this.buildRequest('REGISTER', `sip:${this.config.domain}`, wanted))
            if (response.status === 401 || response.status === 407) {
                const proxy = response.status === 407
                const value = header(response, proxy ? 'Proxy-Authenticate' : 'WWW-Authenticate')
                if (!value) return response
                const challenge = parseChallenge(value)
                // Segunda recusa com a mesma senha: só insiste se o PBX disser que o nonce venceu.
                if (authTries >= 1 && !challenge.stale) return response
                if (++authTries > 3) return response
                this.challenge = { value: challenge, proxy }
                this.nonceCount = 0
                continue
            }
            if (response.status === 423 && wanted > 0) {
                const min = Number(header(response, 'Min-Expires'))
                if (Number.isFinite(min) && min > wanted) {
                    wanted = min
                    continue
                }
            }
            return response
        }
    }

    // ─── Pedidos ───────────────────────────────────────────────────────────

    private buildRequest(method: string, uri: string, expires?: number): SipRequest {
        const { user, domain, displayName, authUser, password, transport } = this.config
        const contact = this.contact ?? { host: '0.0.0.0', port: 0 }
        const host = contact.host.includes(':') ? `[${contact.host}]` : contact.host
        const name = displayName ? `"${displayName.replace(/(["\\])/g, '\\$1')}" ` : ''
        const list: [string, string][] = [
            // O branch entra em `request`; rport pede ao PBX a porta por onde o pedido chegou (RFC 3581).
            ['Via', `SIP/2.0/${transport.toUpperCase()} ${host}:${contact.port};rport`],
            ['Max-Forwards', '70'],
            ['From', `${name}<sip:${user}@${domain}>;tag=${this.fromTag}`],
            ['To', `<sip:${user}@${domain}>`],
            ['Call-ID', method === 'REGISTER' ? this.callId : `${token(12)}@iris`],
            ['CSeq', `${++this.cseq} ${method}`],
            ['Contact', `<sip:${user}@${host}:${contact.port};transport=${transport}>`],
            ['User-Agent', this.config.userAgent ?? 'Iris'],
            ['Allow', ALLOW]
        ]
        if (expires !== undefined) list.push(['Expires', String(expires)])
        if (this.challenge) {
            const c = this.challenge
            list.push([
                c.proxy ? 'Proxy-Authorization' : 'Authorization',
                digestAuthorization({
                    challenge: c.value,
                    method,
                    uri,
                    username: authUser || user,
                    password,
                    nc: ++this.nonceCount
                })
            ])
        }
        return { kind: 'request', method, uri, headers: list, body: '' }
    }

    /** Transação cliente: manda, repete em UDP e devolve a resposta final. */
    private request(message: SipRequest): Promise<SipResponse> {
        const transport = this.transport
        if (!transport) return Promise.reject(new Error('Sem conexão com o PBX'))
        const branch = `z9hG4bK${token(8)}`
        const via = message.headers.find(([name]) => name === 'Via')!
        via[1] = `${via[1]};branch=${branch}`
        const text = serializeMessage(message)
        const key = `${branch}|${message.method}`

        return new Promise<SipResponse>((resolve, reject) => {
            const entry: Pending = { resolve, reject, timers: [] }
            this.pending.set(key, entry)
            const send = (): void => {
                this.events.log('info', 'sip', `→ ${redact(text).replace(/\r\n/g, '\n')}`)
                transport.send(text)
            }
            send()
            if (!transport.reliable) {
                // Temporizador E: repete em T1, 2·T1, 4·T1… até T2, enquanto não houver resposta.
                let wait = T1
                const again = (): void => {
                    if (!this.pending.has(key)) return
                    send()
                    wait = Math.min(wait * 2, T2)
                    entry.timers.push(setTimeout(again, wait))
                }
                entry.timers.push(setTimeout(again, wait))
            }
            // Temporizador F: desiste.
            entry.timers.push(
                setTimeout(() => {
                    if (!this.pending.delete(key)) return
                    entry.timers.forEach(clearTimeout)
                    reject(new SipTimeoutError(message.method))
                }, TIMER_F)
            )
        })
    }

    /** OPTIONS para o PBX: mede a ida e volta (RF-24). Qualquer resposta final conta. */
    async ping(): Promise<number> {
        const started = Date.now()
        await this.request(this.buildRequest('OPTIONS', `sip:${this.config.domain}`))
        return Date.now() - started
    }

    // ─── O que chega ───────────────────────────────────────────────────────

    private receive(text: string): void {
        let message: SipMessage
        try {
            message = parseMessage(text)
        } catch (error) {
            this.events.log('warn', 'event', `Mensagem SIP ilegível descartada: ${(error as Error).message}`)
            return
        }
        this.events.log('info', 'sip', `← ${text.replace(/\r\n/g, '\n')}`)
        if (message.kind === 'response') this.onResponse(message)
        else this.onRequest(message)
    }

    private onResponse(response: SipResponse): void {
        const via = headerParams(header(response, 'Via') ?? '')
        this.learnAddress(via)
        if (response.status < 200) return
        const key = `${via['branch']}|${cseqOf(response).method}`
        const entry = this.pending.get(key)
        // Resposta repetida de uma transação já encerrada: nada a fazer.
        if (!entry) return
        this.pending.delete(key)
        entry.timers.forEach(clearTimeout)
        entry.resolve(response)
    }

    /** Atrás de NAT, o PBX diz por onde nos viu; o próximo REGISTER já leva esse endereço no Contact. */
    private learnAddress(via: Record<string, string | null>): void {
        const received = via['received']
        const rport = Number(via['rport'])
        if (!this.contact) return
        if (received) this.contact.host = received
        if (Number.isInteger(rport) && rport > 0) this.contact.port = rport
    }

    private onRequest(request: SipRequest): void {
        if (request.method === 'ACK') return
        if (request.method === 'OPTIONS') return this.reply(request, 200, 'OK', [['Allow', ALLOW]])
        if (request.method === 'NOTIFY') return this.reply(request, 200, 'OK')
        if (request.method === 'INVITE') {
            this.events.log(
                'warn',
                'event',
                'Chamada recebida e recusada: contas por SIP puro ainda só registram (chamadas na próxima entrega)'
            )
            return this.reply(request, 480, 'Temporarily Unavailable')
        }
        if (request.method === 'BYE' || request.method === 'CANCEL')
            return this.reply(request, 481, 'Call/Transaction Does Not Exist')
        this.reply(request, 405, 'Method Not Allowed', [['Allow', ALLOW]])
    }

    private reply(request: SipRequest, status: number, reason: string, extra: [string, string][] = []): void {
        const to = header(request, 'To') ?? ''
        const list: [string, string][] = [
            ...headers(request, 'Via').map((v): [string, string] => ['Via', v]),
            ['From', header(request, 'From') ?? ''],
            ['To', /;tag=/i.test(to) ? to : `${to};tag=${token(6)}`],
            ['Call-ID', header(request, 'Call-ID') ?? ''],
            ['CSeq', header(request, 'CSeq') ?? ''],
            ['User-Agent', this.config.userAgent ?? 'Iris'],
            ...extra
        ]
        const text = serializeMessage({ kind: 'response', status, reason, headers: list, body: '' })
        this.events.log('info', 'sip', `→ ${text.replace(/\r\n/g, '\n')}`)
        this.transport?.send(text)
    }
}
