import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { digestAuthorization, parseChallenge } from '../src/main/sip/digest'
import { cseqOf, header, parseMessage, serializeMessage, type SipRequest } from '../src/main/sip/message'
import { TlsCertificateError, type SipTransport, type TransportOptions } from '../src/main/sip/transport'
import { redact, SipUserAgent, T1, TIMER_F, type UaStatus, type UserAgentConfig } from '../src/main/sip/user-agent'
import { parseSipServer } from '../src/shared/sip-target'

/** PBX falso em memória: guarda o que o user-agent manda e responde o que o teste disser. */
class FakeTransport implements SipTransport {
    readonly kind
    readonly reliable
    local = { address: '192.168.0.10', port: 50600 }
    onMessage: (text: string) => void = () => {}
    onClose: (error?: Error) => void = () => {}
    sent: SipRequest[] = []
    raw: string[] = []
    closed = false
    openError?: Error
    /** Resposta automática para cada pedido; null deixa sem resposta. */
    answer: (request: SipRequest, n: number) => { status: number; reason: string; extra?: [string, string][] } | null =
        () => ({ status: 200, reason: 'OK' })

    constructor(readonly options: TransportOptions) {
        this.kind = options.kind
        this.reliable = options.kind !== 'udp'
    }

    async open(): Promise<void> {
        if (this.openError) throw this.openError
    }

    send(text: string): void {
        this.raw.push(text)
        if (!text.trim()) return
        const message = parseMessage(text)
        if (message.kind !== 'request') return
        this.sent.push(message)
        const reply = this.answer(message, this.sent.length)
        if (reply) queueMicrotask(() => this.respond(message, reply.status, reply.reason, reply.extra))
    }

    respond(request: SipRequest, status: number, reason: string, extra: [string, string][] = []): void {
        this.onMessage(
            serializeMessage({
                kind: 'response',
                status,
                reason,
                headers: [
                    ['Via', `${header(request, 'Via')};received=203.0.113.7`.replace(';rport', ';rport=40000')],
                    ['From', header(request, 'From')!],
                    ['To', `${header(request, 'To')};tag=pbx`],
                    ['Call-ID', header(request, 'Call-ID')!],
                    ['CSeq', header(request, 'CSeq')!],
                    ...extra
                ],
                body: ''
            })
        )
    }

    close(): void {
        this.closed = true
    }
}

const CHALLENGE = 'Digest realm="asterisk", nonce="abc123", qop="auth", algorithm=MD5'
const config: UserAgentConfig = {
    user: '2001',
    domain: 'pbx.teste',
    password: '1234',
    transport: 'udp',
    host: 'pbx.teste',
    port: 5060
}

function setup(overrides: Partial<UserAgentConfig> = {}, prepare?: (t: FakeTransport) => void) {
    let transport!: FakeTransport
    const statuses: UaStatus[] = []
    const logs: string[] = []
    const certificates: string[] = []
    const agent = new SipUserAgent(
        { ...config, ...overrides },
        (options) => {
            transport = new FakeTransport(options)
            prepare?.(transport)
            return transport
        },
        {
            status: (s) => statuses.push(s),
            log: (_level, _kind, text) => logs.push(text),
            certificate: (host) => certificates.push(host)
        }
    )
    return { agent, statuses, logs, certificates, transport: () => transport }
}

/** Como um Asterisk: o primeiro REGISTER leva 401; com Authorization certa, 200. */
const withAuth =
    (password = '1234') =>
    (request: SipRequest) => {
        const auth = header(request, 'Authorization')
        if (!auth)
            return {
                status: 401,
                reason: 'Unauthorized',
                extra: [['WWW-Authenticate', CHALLENGE]] as [string, string][]
            }
        const cnonce = /cnonce="([^"]+)"/.exec(auth)![1]!
        const expected = digestAuthorization({
            challenge: parseChallenge(CHALLENGE),
            method: request.method,
            uri: request.uri,
            username: '2001',
            password,
            nc: 1,
            cnonce
        })
        return auth === expected
            ? { status: 200, reason: 'OK', extra: [['Expires', '120']] as [string, string][] }
            : { status: 403, reason: 'Forbidden' }
    }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('motor próprio: registro por SIP puro (RF-39)', () => {
    it('registra respondendo ao desafio 401 com a senha', async () => {
        const { agent, statuses, transport } = setup({}, (t) => (t.answer = withAuth()))
        await agent.start()
        expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected', 'registered'])
        const [first, second] = transport().sent
        expect(first!.method).toBe('REGISTER')
        expect(first!.uri).toBe('sip:pbx.teste')
        expect(header(first!, 'Via')).toMatch(/^SIP\/2\.0\/UDP 192\.168\.0\.10:50600;rport;branch=z9hG4bK/)
        expect(header(first!, 'Authorization')).toBeUndefined()
        expect(header(second!, 'Authorization')).toContain('username="2001"')
        // Mesmo Call-ID, CSeq crescente e branch novo a cada pedido.
        expect(header(second!, 'Call-ID')).toBe(header(first!, 'Call-ID'))
        expect(cseqOf(second!).seq).toBe(cseqOf(first!).seq + 1)
        expect(header(second!, 'Via')).not.toBe(header(first!, 'Via'))
        await agent.stop()
    })

    it('usa no Contact o endereço que o PBX viu (received e rport), para atravessar NAT', async () => {
        const { agent, transport } = setup({}, (t) => (t.answer = withAuth()))
        await agent.start()
        const [first, second] = transport().sent
        expect(header(first!, 'Contact')).toBe('<sip:2001@192.168.0.10:50600;transport=udp>')
        expect(header(second!, 'Contact')).toBe('<sip:2001@203.0.113.7:40000;transport=udp>')
        await agent.stop()
    })

    it('senha errada vira erro 403, sem insistir', async () => {
        const { agent, statuses, transport } = setup({ password: 'errada' }, (t) => (t.answer = withAuth()))
        await agent.start()
        expect(statuses.at(-1)).toMatchObject({ state: 'error', code: 403, reason: 'Forbidden' })
        expect(transport().sent).toHaveLength(2)
    })

    it('duas recusas 401 seguidas param na segunda tentativa', async () => {
        const { agent, statuses, transport } = setup({}, (t) => {
            t.answer = () => ({ status: 401, reason: 'Unauthorized', extra: [['WWW-Authenticate', CHALLENGE]] })
        })
        await agent.start()
        expect(statuses.at(-1)).toMatchObject({ state: 'error', code: 401 })
        expect(transport().sent).toHaveLength(2)
    })

    it('nonce vencido (stale) é respondido de novo', async () => {
        const { agent, statuses, transport } = setup({}, (t) => {
            t.answer = (_request, n) =>
                n === 1
                    ? { status: 401, reason: 'Unauthorized', extra: [['WWW-Authenticate', CHALLENGE]] }
                    : n === 2
                      ? {
                            status: 401,
                            reason: 'Unauthorized',
                            extra: [['WWW-Authenticate', `${CHALLENGE.replace('abc123', 'novo')}, stale=true`]]
                        }
                      : { status: 200, reason: 'OK' }
        })
        await agent.start()
        expect(statuses.at(-1)?.state).toBe('registered')
        expect(header(transport().sent[2]!, 'Authorization')).toContain('nonce="novo"')
        await agent.stop()
    })

    it('423 Interval Too Brief: repete com o Min-Expires do PBX', async () => {
        const { agent, statuses, transport } = setup({ expires: 60 }, (t) => {
            t.answer = (request) =>
                header(request, 'Expires') === '60'
                    ? { status: 423, reason: 'Interval Too Brief', extra: [['Min-Expires', '600']] }
                    : { status: 200, reason: 'OK' }
        })
        await agent.start()
        expect(statuses.at(-1)?.state).toBe('registered')
        expect(header(transport().sent[1]!, 'Expires')).toBe('600')
        await agent.stop()
    })

    it('renova o registro antes de vencer', async () => {
        const { agent, transport } = setup({}, (t) => (t.answer = withAuth()))
        await agent.start()
        const before = transport().sent.length
        // O PBX concedeu 120 s: renova em 85% disso.
        await vi.advanceTimersByTimeAsync(101_000)
        expect(transport().sent.length).toBe(before)
        await vi.advanceTimersByTimeAsync(2_000)
        expect(transport().sent.length).toBeGreaterThan(before)
        expect(transport().sent.at(-1)!.method).toBe('REGISTER')
        await agent.stop()
    })

    it('em UDP repete o pedido em 0,5 s, 1 s, 2 s… e desiste com 408', async () => {
        const { agent, statuses, transport } = setup({}, (t) => (t.answer = () => null))
        const started = agent.start()
        await vi.advanceTimersByTimeAsync(T1 - 1)
        expect(transport().sent).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(transport().sent).toHaveLength(2)
        await vi.advanceTimersByTimeAsync(2 * T1)
        expect(transport().sent).toHaveLength(3)
        // Mesma transação: o branch não muda nas repetições.
        expect(header(transport().sent[2]!, 'Via')).toBe(header(transport().sent[0]!, 'Via'))
        await vi.advanceTimersByTimeAsync(TIMER_F)
        await started
        expect(statuses.at(-1)).toMatchObject({ state: 'error', code: 408 })
    })

    it('em TCP não repete: o transporte já entrega', async () => {
        const { agent, transport } = setup({ transport: 'tcp' }, (t) => (t.answer = () => null))
        void agent.start()
        await vi.advanceTimersByTimeAsync(10 * T1)
        expect(transport().sent).toHaveLength(1)
        expect(header(transport().sent[0]!, 'Via')).toContain('SIP/2.0/TCP')
        expect(header(transport().sent[0]!, 'Contact')).toContain('transport=tcp')
    })

    it('ao parar, desregistra com Expires 0 e fecha o transporte', async () => {
        const { agent, transport } = setup({}, (t) => (t.answer = withAuth()))
        await agent.start()
        await agent.stop()
        const last = transport().sent.at(-1)!
        expect(last.method).toBe('REGISTER')
        expect(header(last, 'Expires')).toBe('0')
        expect(transport().closed).toBe(true)
    })

    it('queda do transporte vira erro sem código, para a conta tentar de novo', async () => {
        const { agent, statuses, transport } = setup({ transport: 'tcp' })
        await agent.start()
        transport().onClose(new Error('ECONNRESET'))
        expect(statuses.at(-1)?.state).toBe('error')
        expect(statuses.at(-1)?.code).toBeUndefined()
        expect(agent.connected).toBe(false)
    })

    it('certificado TLS recusado avisa a tela e vira erro', async () => {
        const { agent, statuses, certificates } = setup({ transport: 'tls' }, (t) => {
            t.openError = new TlsCertificateError('pbx.teste', 'DEPTH_ZERO_SELF_SIGNED_CERT')
        })
        await agent.start()
        expect(certificates).toEqual(['pbx.teste'])
        expect(statuses.at(-1)?.state).toBe('error')
    })

    it('responde ao OPTIONS do PBX com 200 e recusa INVITE com 480 nesta entrega', async () => {
        const { agent, transport } = setup()
        await agent.start()
        const incoming = (method: string): string =>
            [
                `${method} sip:2001@192.168.0.10:50600 SIP/2.0`,
                'Via: SIP/2.0/UDP pbx.teste:5060;branch=z9hG4bKpbx1',
                'From: <sip:pbx@pbx.teste>;tag=a',
                'To: <sip:2001@pbx.teste>',
                'Call-ID: qualify-1',
                `CSeq: 7 ${method}`,
                'Content-Length: 0',
                '',
                ''
            ].join('\r\n')
        transport().onMessage(incoming('OPTIONS'))
        transport().onMessage(incoming('INVITE'))
        const [options, invite] = transport()
            .raw.slice(-2)
            .map((text) => parseMessage(text))
        expect(options).toMatchObject({ kind: 'response', status: 200 })
        expect(header(options!, 'Via')).toBe('SIP/2.0/UDP pbx.teste:5060;branch=z9hG4bKpbx1')
        expect(header(options!, 'To')).toMatch(/;tag=/)
        expect(invite).toMatchObject({ kind: 'response', status: 480 })
        await agent.stop()
    })

    it('mede a ida e volta do OPTIONS', async () => {
        const { agent, transport } = setup()
        await agent.start()
        const ping = agent.ping()
        await vi.advanceTimersByTimeAsync(0)
        expect(await ping).toBeGreaterThanOrEqual(0)
        expect(transport().sent.at(-1)!.method).toBe('OPTIONS')
        await agent.stop()
    })

    it('o log da tela não leva a resposta do desafio (RNF-10)', async () => {
        const { agent, logs } = setup({}, (t) => (t.answer = withAuth()))
        await agent.start()
        const sent = logs.filter((line) => line.startsWith('→') && line.includes('Authorization'))
        expect(sent.length).toBeGreaterThan(0)
        for (const line of sent) expect(line).toContain('response="[removido]"')
        expect(logs.join('\n')).not.toContain('1234"')
        expect(redact('response="abc", cnonce="def", nonce="fica"')).toBe(
            'response="[removido]", cnonce="[removido]", nonce="fica"'
        )
        await agent.stop()
    })
})

describe('servidor SIP da conta', () => {
    it('vazio usa o domínio e a porta padrão do transporte', () => {
        expect(parseSipServer('', 'pbx.empresa.com', 'udp')).toEqual({ host: 'pbx.empresa.com', port: 5060 })
        expect(parseSipServer(undefined, 'pbx.empresa.com', 'tls')).toEqual({ host: 'pbx.empresa.com', port: 5061 })
    })

    it('aceita host, IP e IPv6 com porta', () => {
        expect(parseSipServer('10.0.0.5:5080', 'x', 'tcp')).toEqual({ host: '10.0.0.5', port: 5080 })
        expect(parseSipServer('[2001:db8::1]:5070', 'x', 'udp')).toEqual({ host: '2001:db8::1', port: 5070 })
    })

    it('recusa o que não é host', () => {
        for (const bad of ['sip:pbx', 'pbx empresa', 'pbx:99999', 'pbx:0', 'a\r\nVia: x', 'wss://pbx/ws'])
            expect(parseSipServer(bad, 'x', 'udp')).toBeNull()
    })
})
