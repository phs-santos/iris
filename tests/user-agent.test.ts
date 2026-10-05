import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { digestAuthorization, parseChallenge } from '../src/main/sip/digest'
import { cseqOf, header, parseMessage, serializeMessage, type SipRequest } from '../src/main/sip/message'
import { TlsCertificateError, type SipTransport, type TransportOptions } from '../src/main/sip/transport'
import { redact, SipUserAgent, T1, TIMER_F, type UaStatus, type UserAgentConfig } from '../src/main/sip/user-agent'
import { parseSipServer } from '../src/shared/sip-target'
import type { CallEvents, SipCall } from '../src/main/sip/call'
import { toneSamples } from '../src/shared/audio'

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

    it('responde ao OPTIONS do PBX com 200 e, sem ninguém para atender, recusa o INVITE com 480', async () => {
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

    it('mensagem de texto (RF-54): responde 200, entrega o texto e ignora o aviso de "digitando"', async () => {
        const received: Array<[string, string | undefined, string]> = []
        let transport!: FakeTransport
        const agent = new SipUserAgent(config, (options) => (transport = new FakeTransport(options)), {
            status: () => {},
            log: () => {},
            certificate: () => {},
            message: (from, name, text) => received.push([from, name, text])
        })
        await agent.start()
        const message = (type: string, body: string, seq: number): string =>
            [
                'MESSAGE sip:2001@192.168.0.10:50600 SIP/2.0',
                'Via: SIP/2.0/UDP pbx.teste:5060;branch=z9hG4bKmsg' + seq,
                'From: "Vendas" <sip:1002@pbx.teste>;tag=a',
                'To: <sip:2001@pbx.teste>',
                `Call-ID: msg-${seq}`,
                `CSeq: ${seq} MESSAGE`,
                `Content-Type: ${type}`,
                `Content-Length: ${Buffer.byteLength(body)}`,
                '',
                body
            ].join('\r\n')
        transport.onMessage(message('text/plain;charset=UTF-8', 'Olá, tudo bem?', 1))
        transport.onMessage(message('application/im-iscomposing+xml', '<isComposing/>', 2))
        const replies = transport.raw.slice(-2).map((text) => parseMessage(text))
        expect(replies).toMatchObject([
            { kind: 'response', status: 200 },
            { kind: 'response', status: 200 }
        ])
        expect(received).toEqual([['1002', 'Vendas', 'Olá, tudo bem?']])
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

    it('pedido manual (RF-45): leva os cabeçalhos extras e o corpo, responde ao desafio e mede o tempo', async () => {
        const { agent, transport } = setup({}, (t) => (t.answer = withAuth()))
        await agent.start()
        const before = transport().sent.length
        // O PBX pede a senha de novo, agora como proxy, para os pedidos que não são REGISTER.
        transport().answer = (request) =>
            request.method === 'REGISTER' || header(request, 'Proxy-Authorization')
                ? { status: 200, reason: 'OK' }
                : { status: 407, reason: 'Proxy Authentication Required', extra: [['Proxy-Authenticate', CHALLENGE]] }
        const { response, ms } = await agent.sendRequest({
            method: 'MESSAGE',
            uri: 'sip:1002@pbx.teste',
            headers: [['X-Teste', '1']],
            body: 'olá',
            contentType: 'text/plain'
        })
        expect(response.status).toBe(200)
        expect(ms).toBeGreaterThanOrEqual(0)
        const [first, second] = transport().sent.slice(before)
        expect(first!.method).toBe('MESSAGE')
        expect(header(first!, 'To')).toBe('<sip:1002@pbx.teste>')
        expect(header(first!, 'X-Teste')).toBe('1')
        expect(header(first!, 'Content-Type')).toBe('text/plain')
        expect(first!.body).toBe('olá')
        expect(header(first!, 'Proxy-Authorization')).toBeUndefined()
        expect(header(second!, 'Proxy-Authorization')).toContain('uri="sip:1002@pbx.teste"')
        expect(second!.body).toBe('olá')
        // Um pedido para o próprio PBX mantém o To da conta.
        await agent.sendRequest({ method: 'OPTIONS', uri: 'sip:pbx.teste', headers: [] })
        expect(header(transport().sent.at(-1)!, 'To')).toBe('<sip:2001@pbx.teste>')
        // Tudo o que foi e voltou está na captura (RF-44).
        expect(agent.capture.count).toBe(transport().sent.length * 2)
        await agent.stop()
    })

    it('BLF e correio de voz (RF-27): assina o estado dos ramais e lê os avisos do PBX', async () => {
        const presence: string[] = []
        const mwi: unknown[] = []
        let transport!: FakeTransport
        const agent = new SipUserAgent(
            { ...config, blf: ['1002', '1003'] },
            (options) => {
                transport = new FakeTransport(options)
                // O PBX aceita acompanhar o 1002 e recusa o 1003.
                transport.answer = (request) =>
                    request.method === 'SUBSCRIBE' && request.uri.includes('1003')
                        ? { status: 489, reason: 'Bad Event' }
                        : { status: 200, reason: 'OK', extra: [['Expires', '600']] }
                return transport
            },
            {
                status: () => undefined,
                log: () => undefined,
                certificate: () => undefined,
                presence: (extension, state) => presence.push(`${extension} ${state}`),
                mwi: (info) => mwi.push(info)
            }
        )
        await agent.start()
        await vi.advanceTimersByTimeAsync(0)
        const subscribes = transport.sent.filter((r) => r.method === 'SUBSCRIBE')
        expect(subscribes.map((r) => r.uri)).toEqual(['sip:1002@pbx.teste', 'sip:1003@pbx.teste'])
        expect(header(subscribes[0]!, 'Event')).toBe('dialog')
        expect(header(subscribes[0]!, 'Accept')).toBe('application/dialog-info+xml')
        expect(header(subscribes[0]!, 'To')).toBe('<sip:1002@pbx.teste>')

        const notify = (callId: string, event: string, body: string): string =>
            [
                'NOTIFY sip:2001@192.168.0.10:50600 SIP/2.0',
                'Via: SIP/2.0/UDP pbx.teste:5060;branch=z9hG4bKnotify' + body.length,
                'From: <sip:1002@pbx.teste>;tag=pbx',
                'To: <sip:2001@pbx.teste>;tag=a',
                `Call-ID: ${callId}`,
                'CSeq: 1 NOTIFY',
                `Event: ${event}`,
                'Subscription-State: active;expires=600',
                `Content-Length: ${Buffer.byteLength(body)}`,
                '',
                body
            ].join('\r\n')
        const callId = header(subscribes[0]!, 'Call-ID')!
        transport.onMessage(
            notify(callId, 'dialog', '<dialog-info><dialog id="a"><state>confirmed</state></dialog></dialog-info>')
        )
        transport.onMessage(notify(callId, 'dialog', '<dialog-info></dialog-info>'))
        // De uma assinatura que não é nossa: ignorado. O aviso de correio vale mesmo sem assinatura.
        transport.onMessage(
            notify(
                'desconhecido',
                'dialog',
                '<dialog-info><dialog id="a"><state>confirmed</state></dialog></dialog-info>'
            )
        )
        transport.onMessage(notify('avulso', 'message-summary', 'Messages-Waiting: yes\r\nVoice-Message: 3/1\r\n'))
        expect(presence).toEqual(['1003 unknown', '1002 busy', '1002 idle'])
        expect(mwi).toEqual([{ waiting: true, newMessages: 3, oldMessages: 1 }])
        // Todo NOTIFY recebe 200, inclusive o que foi ignorado.
        const replies = transport.raw.slice(-4).map((text) => parseMessage(text))
        expect(replies.every((r) => r.kind === 'response' && r.status === 200)).toBe(true)
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

// ─── Chamadas (segunda entrega) ────────────────────────────────────────────────

const PBX_SDP = (direction = 'sendrecv'): string =>
    [
        'v=0',
        'o=pbx 1 1 IN IP4 127.0.0.1',
        's=-',
        'c=IN IP4 127.0.0.1',
        't=0 0',
        'm=audio 30000 RTP/AVP 0 101',
        'a=rtpmap:0 PCMU/8000',
        'a=rtpmap:101 telephone-event/8000',
        `a=${direction}`,
        ''
    ].join('\r\n')

/** Espera uma condição com o relógio de verdade: as chamadas abrem uma porta UDP real para o áudio. */
async function until(condition: () => boolean, what: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
        if (condition()) return
        await new Promise((done) => setTimeout(done, 5))
    }
    throw new Error(`não aconteceu: ${what}`)
}

function callRecorder() {
    const seen: string[] = []
    const events: CallEvents = {
        progress: (code, reason, early) => seen.push(`progress ${code} ${reason}${early ? ' early' : ''}`),
        established: () => seen.push('established'),
        ended: (end) => seen.push(['ended', end.by, end.code, end.reason].filter(Boolean).join(' ')),
        hold: (held, by) => seen.push(`${held ? 'hold' : 'unhold'} ${by}`),
        transfer: (code, reason, final) => seen.push(`transfer ${code} ${reason}${final ? ' final' : ''}`),
        dtmf: (tone) => seen.push(`dtmf ${tone}`),
        audio: () => undefined
    }
    return { seen, events }
}

async function registered(overrides: Partial<UserAgentConfig> = {}) {
    const incoming: { call?: SipCall; seen: string[] } = { seen: [] }
    let transport!: FakeTransport
    const agent = new SipUserAgent({ ...config, ...overrides }, (options) => (transport = new FakeTransport(options)), {
        status: () => undefined,
        log: () => undefined,
        certificate: () => undefined,
        incoming: (call) => {
            const recorder = callRecorder()
            incoming.call = call
            incoming.seen = recorder.seen
            return recorder.events
        }
    })
    await agent.start()
    transport.answer = () => null
    return { agent, transport, incoming }
}

const sentOf = (transport: FakeTransport, method: string): SipRequest[] =>
    transport.sent.filter((r) => r.method === method)
const inbound = (method: string, callId: string, extra: string[] = [], body = ''): string =>
    [
        `${method} sip:2001@192.168.0.10:50600 SIP/2.0`,
        `Via: SIP/2.0/UDP pbx.teste:5060;branch=z9hG4bK${method}${callId}${extra.length}`,
        'From: "Ana" <sip:1001@pbx.teste>;tag=pbxtag',
        `To: <sip:2001@pbx.teste>${method === 'INVITE' && !extra.includes('reinvite') ? '' : ';tag=local'}`,
        `Call-ID: ${callId}`,
        `CSeq: ${method === 'INVITE' && extra.includes('reinvite') ? 2 : 1} ${method}`,
        'Contact: <sip:pbx@pbx.teste:5060>',
        ...(body ? ['Content-Type: application/sdp'] : []),
        `Content-Length: ${Buffer.byteLength(body)}`,
        '',
        body
    ].join('\r\n')

describe('motor próprio: chamadas por SIP puro (RF-39)', () => {
    beforeEach(() => vi.useRealTimers())

    it('liga: INVITE com SDP, toca, atende, manda ACK e desliga com BYE', async () => {
        const { agent, transport } = await registered()
        const { seen, events } = callRecorder()
        const call = agent.dial('600', events, ['X-Teste: 1'])
        await until(() => sentOf(transport, 'INVITE').length === 1, 'INVITE enviado')
        const invite = sentOf(transport, 'INVITE')[0]!
        expect(invite.uri).toBe('sip:600@pbx.teste')
        expect(header(invite, 'X-Teste')).toBe('1')
        expect(header(invite, 'Content-Type')).toBe('application/sdp')
        expect(invite.body).toContain('RTP/AVP 0 8 111 101 110')

        transport.respond(invite, 100, 'Trying')
        transport.respond(invite, 180, 'Ringing')
        transport.respond(invite, 200, 'OK', [
            ['Contact', '<sip:600@10.0.0.9:5060>'],
            ['Record-Route', '<sip:proxy.teste;lr>'],
            ['Content-Type', 'application/sdp'],
            ['Content-Length', '0']
        ])
        // O FakeTransport não leva corpo: a resposta sem SDP encerra a chamada com 488 e BYE.
        await until(() => seen.some((line) => line.startsWith('ended')), 'chamada encerrada')
        expect(seen).toEqual(['progress 180 Ringing', expect.stringMatching(/^ended system 488/)])
        const ack = sentOf(transport, 'ACK')[0]!
        expect(ack.uri).toBe('sip:600@10.0.0.9:5060')
        expect(header(ack, 'Route')).toBe('<sip:proxy.teste;lr>')
        expect(header(ack, 'To')).toContain(';tag=pbx')
        expect(cseqOf(ack).seq).toBe(cseqOf(invite).seq)
        expect(header(ack, 'Via')).not.toBe(header(invite, 'Via'))
        expect(sentOf(transport, 'BYE')).toHaveLength(1)
        expect(call.ended).toBe(true)
        await agent.stop()
    })

    it('em andamento: espera dos dois lados, DTMF por INFO, transferência cega e o BYE do outro lado', async () => {
        const { agent, transport } = await registered()
        const { seen, events } = callRecorder()
        const call = agent.dial('1002', events)
        await until(() => sentOf(transport, 'INVITE').length === 1, 'INVITE enviado')
        const invite = sentOf(transport, 'INVITE')[0]!
        const callId = header(invite, 'Call-ID')!
        // Resposta com corpo, escrita à mão.
        const ok = (body: string): string =>
            [
                'SIP/2.0 200 OK',
                `Via: ${header(invite, 'Via')}`,
                `From: ${header(invite, 'From')}`,
                `To: ${header(invite, 'To')};tag=pbx`,
                `Call-ID: ${callId}`,
                `CSeq: ${header(invite, 'CSeq')}`,
                'Contact: <sip:1002@pbx.teste:5060>',
                'Content-Type: application/sdp',
                `Content-Length: ${Buffer.byteLength(body)}`,
                '',
                body
            ].join('\r\n')
        transport.onMessage(ok(PBX_SDP()))
        await until(() => seen.includes('established'), 'chamada em andamento')
        // O 200 repetido (o ACK se perdeu) faz o ACK sair de novo.
        transport.onMessage(ok(PBX_SDP()))
        expect(sentOf(transport, 'ACK')).toHaveLength(2)

        const inDialog = (method: string, cseq: number, body = '', type = 'application/sdp'): string =>
            [
                `${method} sip:2001@192.168.0.10:50600 SIP/2.0`,
                `Via: SIP/2.0/UDP pbx.teste:5060;branch=z9hG4bK${method}${cseq}`,
                `From: ${header(invite, 'To')};tag=pbx`,
                `To: ${header(invite, 'From')}`,
                `Call-ID: ${callId}`,
                `CSeq: ${cseq} ${method}`,
                ...(body ? [`Content-Type: ${type}`] : []),
                `Content-Length: ${Buffer.byteLength(body)}`,
                '',
                body
            ].join('\r\n')
        const lastReply = () => parseMessage(transport.raw.at(-1)!)

        transport.onMessage(inDialog('INVITE', 10, PBX_SDP('sendonly')))
        expect(lastReply()).toMatchObject({ kind: 'response', status: 200 })
        expect(lastReply().body).toContain('a=recvonly')
        transport.onMessage(inDialog('INVITE', 11, PBX_SDP()))
        expect(lastReply().body).toContain('a=sendrecv')
        transport.onMessage(inDialog('INFO', 12, 'Signal=7\r\nDuration=160\r\n', 'application/dtmf-relay'))
        transport.onMessage(inDialog('MESSAGE', 13))
        expect(lastReply()).toMatchObject({ status: 501 })
        // Espera local: re-INVITE com sendonly; a resposta recvonly do PBX não conta como espera dele.
        const hold = call.setHeld(true)
        await until(() => sentOf(transport, 'INVITE').length === 2, 're-INVITE da espera')
        const reinvite = sentOf(transport, 'INVITE')[1]!
        expect(reinvite.body).toContain('a=sendonly')
        expect(reinvite.uri).toBe('sip:1002@pbx.teste:5060')
        expect(header(reinvite, 'To')).toContain(';tag=pbx')
        transport.onMessage(
            ok(PBX_SDP('recvonly'))
                .replace(`Via: ${header(invite, 'Via')}`, `Via: ${header(reinvite, 'Via')}`)
                .replace(`CSeq: ${header(invite, 'CSeq')}`, `CSeq: ${header(reinvite, 'CSeq')}`)
        )
        await hold
        expect(sentOf(transport, 'ACK')).toHaveLength(3)

        // Transferência cega: REFER, e o andamento chega por NOTIFY.
        transport.answer = (request) => (request.method === 'REFER' ? { status: 202, reason: 'Accepted' } : null)
        await call.transfer('8000')
        const refer = sentOf(transport, 'REFER')[0]!
        expect(header(refer, 'Refer-To')).toBe('<sip:8000@pbx.teste>')
        expect(header(refer, 'Referred-By')).toBe('<sip:2001@pbx.teste>')
        const notify = (frag: string, state: string): string =>
            inDialog('NOTIFY', 20, `${frag}\r\n`, 'message/sipfrag').replace(
                'Content-Type:',
                `Event: refer\r\nSubscription-State: ${state}\r\nContent-Type:`
            )
        transport.onMessage(notify('SIP/2.0 100 Trying', 'active;expires=60'))
        transport.onMessage(notify('SIP/2.0 200 OK', 'terminated;reason=noresource'))
        transport.answer = () => null

        // Concluída a transferência, esta conta sai da chamada com BYE.
        expect(sentOf(transport, 'BYE')).toHaveLength(1)
        expect(seen).toEqual([
            'established',
            'hold remote',
            'unhold remote',
            'dtmf 7',
            'hold local',
            'transfer 100 Trying',
            'transfer 200 OK final',
            'ended local'
        ])
        await agent.stop()
    })

    it('transferência assistida: REFER com Replaces apontando para a chamada de consulta', async () => {
        const { agent, transport } = await registered()
        const answer = (invite: SipRequest, tag: string): void =>
            transport.onMessage(
                [
                    'SIP/2.0 200 OK',
                    `Via: ${header(invite, 'Via')}`,
                    `From: ${header(invite, 'From')}`,
                    `To: ${header(invite, 'To')};tag=${tag}`,
                    `Call-ID: ${header(invite, 'Call-ID')}`,
                    `CSeq: ${header(invite, 'CSeq')}`,
                    'Contact: <sip:pbx@pbx.teste:5060>',
                    'Content-Type: application/sdp',
                    `Content-Length: ${Buffer.byteLength(PBX_SDP())}`,
                    '',
                    PBX_SDP()
                ].join('\r\n')
            )
        const first = callRecorder()
        const original = agent.dial('1002', first.events)
        await until(() => sentOf(transport, 'INVITE').length === 1, 'primeiro INVITE')
        const second = callRecorder()
        const consult = agent.dial('1003', second.events)
        await expect(original.attendedTransfer(consult)).rejects.toThrow(/consulta precisa estar em andamento/)
        await until(() => sentOf(transport, 'INVITE').length === 2, 'INVITE da consulta')
        answer(sentOf(transport, 'INVITE')[0]!, 'tagA')
        await until(() => first.seen.includes('established'), 'original em andamento')
        await expect(original.attendedTransfer(consult)).rejects.toThrow(/consulta precisa estar em andamento/)
        answer(sentOf(transport, 'INVITE')[1]!, 'tagB')
        await until(() => second.seen.includes('established'), 'consulta em andamento')

        transport.answer = (request) => (request.method === 'REFER' ? { status: 603, reason: 'Declined' } : null)
        await original.attendedTransfer(consult)
        const referTo = header(sentOf(transport, 'REFER')[0]!, 'Refer-To')!
        const consultInvite = sentOf(transport, 'INVITE')[1]!
        const fromTag = /tag=([^;>]+)/.exec(header(consultInvite, 'From')!)![1]
        expect(referTo).toBe(
            `<sip:1003@pbx.teste?Replaces=${encodeURIComponent(`${consult.callId};to-tag=tagB;from-tag=${fromTag}`)}>`
        )
        // O PBX recusou o REFER: a recusa já é o resultado final.
        expect(first.seen).toEqual(['established', 'transfer 603 Declined final'])
        transport.answer = () => null
        await agent.stop()
    })

    it('toca um áudio no lugar do microfone, no ritmo de 20 ms por bloco, e mede o que chega (RF-41)', async () => {
        const { agent, transport } = await registered()
        const { seen, events } = callRecorder()
        const call = agent.dial('600', events)
        await expect(call.play(toneSamples(440, 100))).rejects.toThrow(/não está em andamento/)
        await until(() => sentOf(transport, 'INVITE').length === 1, 'INVITE enviado')
        const invite = sentOf(transport, 'INVITE')[0]!
        const body = PBX_SDP()
        transport.onMessage(
            [
                'SIP/2.0 200 OK',
                `Via: ${header(invite, 'Via')}`,
                `From: ${header(invite, 'From')}`,
                `To: ${header(invite, 'To')};tag=pbx`,
                `Call-ID: ${header(invite, 'Call-ID')}`,
                `CSeq: ${header(invite, 'CSeq')}`,
                'Contact: <sip:600@pbx.teste:5060>',
                'Content-Type: application/sdp',
                `Content-Length: ${Buffer.byteLength(body)}`,
                '',
                body
            ].join('\r\n')
        )
        await until(() => seen.includes('established'), 'chamada em andamento')
        const copied: Int16Array[] = []
        call.tap = (side, pcm) => side === 'sent' && copied.push(pcm)
        const started = Date.now()
        const playing = call.play(toneSamples(440, 200))
        // Enquanto toca, o microfone é descartado.
        call.sendPcm(new Int16Array(160).fill(9999))
        await playing
        const elapsed = Date.now() - started
        expect(elapsed).toBeGreaterThanOrEqual(170)
        expect(elapsed).toBeLessThan(1500)
        expect(copied).toHaveLength(10)
        expect(copied.every((frame) => frame.length === 160 && !frame.includes(9999))).toBe(true)
        expect(call.stats().packetsSent).toBe(10)
        // Depois do áudio, o microfone volta a passar; e ninguém mandou nada de volta.
        call.sendPcm(new Int16Array(160).fill(9999))
        expect(copied).toHaveLength(11)
        expect(call.receivedLevel()).toBe(-96)
        transport.answer = () => ({ status: 200, reason: 'OK' })
        await call.hangup()
        await agent.stop()
    })

    it('ocupado: manda o ACK da recusa e encerra com o código', async () => {
        const { agent, transport } = await registered()
        const { seen, events } = callRecorder()
        agent.dial('486', events)
        await until(() => sentOf(transport, 'INVITE').length === 1, 'INVITE enviado')
        const invite = sentOf(transport, 'INVITE')[0]!
        transport.respond(invite, 486, 'Busy Here')
        await until(() => seen.length === 1, 'chamada encerrada')
        expect(seen).toEqual(['ended remote 486 Busy Here'])
        const ack = sentOf(transport, 'ACK')[0]!
        // ACK de recusa: mesma transação, então o mesmo branch do INVITE.
        expect(header(ack, 'Via')).toBe(header(invite, 'Via'))
        await agent.stop()
    })

    it('o PBX pede a senha no INVITE (407): repete com Proxy-Authorization', async () => {
        const { agent, transport } = await registered()
        const { seen, events } = callRecorder()
        agent.dial('600', events)
        await until(() => sentOf(transport, 'INVITE').length === 1, 'INVITE enviado')
        transport.respond(sentOf(transport, 'INVITE')[0]!, 407, 'Proxy Authentication Required', [
            ['Proxy-Authenticate', CHALLENGE]
        ])
        await until(() => sentOf(transport, 'INVITE').length === 2, 'INVITE repetido')
        const second = sentOf(transport, 'INVITE')[1]!
        expect(header(second, 'Proxy-Authorization')).toContain('uri="sip:600@pbx.teste"')
        expect(cseqOf(second).seq).toBe(cseqOf(sentOf(transport, 'INVITE')[0]!).seq + 1)
        transport.respond(second, 403, 'Forbidden')
        await until(() => seen.length === 1, 'chamada encerrada')
        expect(seen).toEqual(['ended remote 403 Forbidden'])
        await agent.stop()
    })

    it('desistir antes de atender manda CANCEL depois do primeiro provisório', async () => {
        const { agent, transport } = await registered()
        const { seen, events } = callRecorder()
        const call = agent.dial('1002', events)
        await until(() => sentOf(transport, 'INVITE').length === 1, 'INVITE enviado')
        const invite = sentOf(transport, 'INVITE')[0]!
        void call.hangup()
        // Sem provisório ainda, o CANCEL espera (RFC 3261, 9.1).
        expect(sentOf(transport, 'CANCEL')).toHaveLength(0)
        transport.respond(invite, 100, 'Trying')
        await until(() => sentOf(transport, 'CANCEL').length === 1, 'CANCEL enviado')
        const cancel = sentOf(transport, 'CANCEL')[0]!
        expect(header(cancel, 'Via')).toBe(header(invite, 'Via'))
        expect(cseqOf(cancel)).toEqual({ seq: cseqOf(invite).seq, method: 'CANCEL' })
        transport.respond(cancel, 200, 'OK')
        transport.respond(invite, 487, 'Request Terminated')
        await until(() => seen.length === 1, 'chamada encerrada')
        expect(seen).toEqual(['ended local 487 Request Terminated'])
        await agent.stop()
    })

    it('recebe: toca com 100 e 180, atende com 200 e SDP, e o BYE encerra', async () => {
        const { agent, transport, incoming } = await registered()
        transport.onMessage(inbound('INVITE', 'entrada-1', [], PBX_SDP()))
        const call = incoming.call!
        expect(call).toMatchObject({ direction: 'in', remote: '1001', remoteName: 'Ana' })
        const replies = () => transport.raw.map((text) => parseMessage(text)).filter((m) => m.kind === 'response')
        expect(
            replies()
                .slice(-2)
                .map((r) => (r.kind === 'response' ? r.status : 0))
        ).toEqual([100, 180])

        await call.answer()
        const ok = replies().at(-1)!
        expect(ok).toMatchObject({ status: 200 })
        expect(ok.body).toContain('RTP/AVP 0 101')
        expect(header(ok, 'Contact')).toContain('sip:2001@')
        // O mesmo INVITE repetido recebe a mesma resposta.
        transport.onMessage(inbound('INVITE', 'entrada-1', [], PBX_SDP()))
        expect(replies().at(-1)).toMatchObject({ status: 200 })
        transport.onMessage(inbound('ACK', 'entrada-1'))
        transport.onMessage(inbound('BYE', 'entrada-1'))
        expect(incoming.seen).toEqual(['established', 'ended remote'])
        await agent.stop()
    })

    it('recebe e recusa com 486; quem liga desiste e a chamada some com 487', async () => {
        const { agent, transport, incoming } = await registered()
        const statuses = () =>
            transport.raw.map((text) => parseMessage(text)).flatMap((m) => (m.kind === 'response' ? [m.status] : []))
        transport.onMessage(inbound('INVITE', 'entrada-2', [], PBX_SDP()))
        incoming.call!.reject()
        expect(statuses().at(-1)).toBe(486)
        expect(incoming.seen).toEqual(['ended local 486 Recusada'])

        transport.onMessage(inbound('INVITE', 'entrada-3', [], PBX_SDP()))
        transport.onMessage(inbound('CANCEL', 'entrada-3'))
        expect(statuses().slice(-2)).toEqual([200, 487])
        expect(incoming.seen).toEqual(['ended remote Chamada cancelada por quem ligou'])
        await agent.stop()
    })

    it('oferta sem codec em comum é recusada com 488 ao atender', async () => {
        const { agent, transport, incoming } = await registered()
        transport.onMessage(
            inbound(
                'INVITE',
                'entrada-4',
                [],
                'v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 4000 RTP/AVP 18\r\na=rtpmap:18 G729/8000\r\n'
            )
        )
        await incoming.call!.answer()
        expect(incoming.seen[0]).toMatch(/^ended system 488/)
        await agent.stop()
    })

    it('a queda do transporte encerra as chamadas abertas', async () => {
        const { agent, transport, incoming } = await registered({ transport: 'tcp' })
        transport.onMessage(inbound('INVITE', 'entrada-5', [], PBX_SDP()).replace(/UDP/g, 'TCP'))
        transport.onClose(new Error('ECONNRESET'))
        expect(incoming.seen).toEqual(['ended system A conexão com o PBX caiu'])
        expect(() => agent.dial('600', callRecorder().events)).toThrow(/Registre a conta/)
    })
})
