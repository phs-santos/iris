import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    buildDialogs,
    describeDialog,
    dialogPeer,
    dialogFailed,
    ladderHtml,
    layoutLadder,
    parseSipEntry,
    type LadderSource
} from '@renderer/lib/ladder'
import { MockEngine, MOCK_TIMING, resetMockNetwork } from '@renderer/sip/mock-engine'
import { newAccount } from '@renderer/lib/accounts'

let id = 1
const entry = (accountId: string, text: string, ts = 1000 + id): LadderSource => ({ id: id++, ts, accountId, text })

/** Como o SIP.js escreve no log: uma frase, linha em branco e a mensagem com CRLF. */
const sipjs = (dir: 'out' | 'in', message: string[]): string =>
    `${dir === 'out' ? 'Sending WebSocket message' : 'Received WebSocket text message'}:\n\n${message.join('\r\n')}\r\n\r\n`

const invite = sipjs('out', [
    'INVITE sip:1002@pbx.local SIP/2.0',
    'Via: SIP/2.0/WSS abc.invalid;branch=z9hG4bK1',
    'Call-ID: abc123',
    'CSeq: 1 INVITE',
    'Content-Type: application/sdp'
])
const reply = (status: string, seq = 1, method = 'INVITE', callId = 'abc123'): string =>
    sipjs('in', [`SIP/2.0 ${status}`, `Call-ID: ${callId}`, `CSeq: ${seq} ${method}`])

describe('diagrama de escada: leitura do SIP bruto', () => {
    it('lê pedido e resposta no formato do SIP.js', () => {
        const out = parseSipEntry(entry('a', invite))
        expect(out).toMatchObject({ dir: 'out', label: 'INVITE', method: 'INVITE', callId: 'abc123' })
        expect(out?.raw.startsWith('INVITE sip:1002@pbx.local SIP/2.0')).toBe(true)
        expect(parseSipEntry(entry('a', reply('486 Busy Here')))).toMatchObject({
            dir: 'in',
            label: '486 Busy Here',
            status: 486,
            severity: 'error',
            cseq: { seq: 1, method: 'INVITE' }
        })
    })

    it('aceita o Call-ID na forma compacta e ignora o que não é mensagem SIP', () => {
        expect(parseSipEntry(entry('a', sipjs('in', ['SIP/2.0 200 OK', 'i: x1', 'CSeq: 2 BYE'])))?.callId).toBe('x1')
        expect(parseSipEntry(entry('a', 'Transport: conectando'))).toBeNull()
        expect(parseSipEntry(entry('a', '→ SIP/2.0 200 OK'))).toBeNull()
    })

    it('agrupa por conta e Call-ID, acha a resposta final e marca a retransmissão', () => {
        const dialogs = buildDialogs([
            entry('a', invite),
            entry('a', reply('100 Trying')),
            entry('a', reply('180 Ringing')),
            entry('a', reply('180 Ringing')),
            entry('a', reply('486 Busy Here')),
            entry('b', reply('200 OK', 1, 'REGISTER', 'reg1'))
        ])
        expect(dialogs).toHaveLength(2)
        const call = dialogs[0]!
        expect(call.messages.map((m) => m.retransmission)).toEqual([false, false, false, true, false])
        expect(describeDialog(call)).toBe('INVITE → 486 Busy Here')
        expect(dialogPeer(call)).toBe('para 1002')
        expect(dialogFailed(call)).toBe(true)
    })

    it('no REGISTER, o 401 do desafio não é a resposta final', () => {
        const [reg] = buildDialogs([
            entry('a', sipjs('out', ['REGISTER sip:pbx SIP/2.0', 'Call-ID: r', 'CSeq: 1 REGISTER'])),
            entry('a', reply('401 Unauthorized', 1, 'REGISTER', 'r')),
            entry('a', sipjs('out', ['REGISTER sip:pbx SIP/2.0', 'Call-ID: r', 'CSeq: 2 REGISTER'])),
            entry('a', reply('200 OK', 2, 'REGISTER', 'r'))
        ])
        expect(reg!.messages[1]!.severity).toBe('auth')
        expect(describeDialog(reg!)).toBe('REGISTER → 200 OK')
        expect(dialogFailed(reg!)).toBe(false)
    })
})

describe('diagrama de escada: desenho e exportação', () => {
    const names = (accountId: string): { label: string; sublabel: string } => ({ label: accountId, sublabel: '' })

    it('põe o PBX entre as duas contas e as setas no sentido certo', () => {
        const dialogs = buildDialogs([
            entry('a', invite, 10),
            entry('b', sipjs('in', ['INVITE sip:1002@pbx SIP/2.0', 'Call-ID: leg2', 'CSeq: 1 INVITE']), 20)
        ])
        const layout = layoutLadder(dialogs, names, 'pbx.local')
        expect(layout.columns.map((c) => c.accountId)).toEqual(['a', null, 'b'])
        const [a, pbx, b] = layout.columns
        expect([layout.rows[0]!.x1, layout.rows[0]!.x2]).toEqual([a!.x, pbx!.x])
        expect([layout.rows[1]!.x1, layout.rows[1]!.x2]).toEqual([pbx!.x, b!.x])
        expect(layout.rows[1]!.offsetMs).toBe(10)
    })

    it('o HTML exportado escapa o texto e não leva credenciais', () => {
        const withAuth = sipjs('out', [
            'REGISTER sip:pbx SIP/2.0',
            'Call-ID: <script>',
            'CSeq: 2 REGISTER',
            'Authorization: Digest username="1001", nonce="abc", response="deadbeef"'
        ])
        const layout = layoutLadder(buildDialogs([entry('a', withAuth)]), names, 'pbx')
        const html = ladderHtml(layout, 'Teste', ['resumo'])
        expect(html).not.toContain('<script>')
        expect(html).not.toContain('deadbeef')
        expect(html).toContain('Authorization: [removido]')
    })
})

describe('diagrama de escada com o motor simulado', () => {
    afterEach(() => {
        vi.useRealTimers()
        resetMockNetwork()
    })

    it('uma chamada atendida e desligada vira dois diálogos completos', async () => {
        vi.useFakeTimers()
        const logs: LadderSource[] = []
        const engine = (accountId: string, extension: string): MockEngine => {
            const account = newAccount({ id: accountId, name: accountId, extension, domain: 'demo.local' })
            account.rawSipLog = true
            const e = new MockEngine(account, '1234')
            e.on(
                'log',
                (l) => l.kind === 'sip' && logs.push({ id: logs.length, ts: logs.length, accountId, text: l.text })
            )
            return e
        }
        const a = engine('a', '1001')
        const b = engine('b', '1002')
        const connected = Promise.all([a.connect(), b.connect()])
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.register)
        await connected
        let incoming: Awaited<ReturnType<MockEngine['dial']>> | undefined
        b.on('incoming', (call) => (incoming = call))
        const out = await a.dial('1002')
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying + MOCK_TIMING.ringing)
        await incoming!.answer()
        await out.hangup()

        const calls = buildDialogs(logs).filter((d) => d.method === 'INVITE')
        expect(calls.map((d) => d.accountId)).toEqual(['a', 'b'])
        expect(calls[0]!.messages.map((m) => `${m.dir} ${m.label}`)).toEqual([
            'out INVITE',
            'in 100 Trying',
            'in 180 Ringing',
            'in 200 OK',
            'out ACK',
            'out BYE',
            'in 200 OK'
        ])
        expect(describeDialog(calls[1]!)).toBe('INVITE → 200 OK')
        expect(dialogPeer(calls[1]!)).toBe('de 1001')
        expect(calls[0]!.messages[0]!.raw.startsWith('INVITE sip:1002@demo.local SIP/2.0')).toBe(true)
        const register = buildDialogs(logs).find((d) => d.method === 'REGISTER' && d.accountId === 'a')!
        expect(register.messages.map((m) => m.label)).toEqual(['REGISTER', '401 Unauthorized', 'REGISTER', '200 OK'])
    })
})
