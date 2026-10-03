import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockEngine, MOCK_TIMING, resetMockNetwork } from '@renderer/sip/mock-engine'
import type { CallEnd, EngineCall } from '@renderer/sip/engine'
import { newAccount } from '@renderer/lib/accounts'

const make = (extension: string): MockEngine =>
    new MockEngine(newAccount({ name: extension, extension, domain: 'demo.local', simulated: true }), '1234')

async function registered(engine: MockEngine): Promise<void> {
    const p = engine.connect()
    await vi.advanceTimersByTimeAsync(MOCK_TIMING.register)
    await p
}

/** Liga de `from` para `to`, atende e devolve as duas pontas. */
async function connect(from: MockEngine, to: MockEngine): Promise<{ out: EngineCall; inc: EngineCall }> {
    let inc: EngineCall | undefined
    const off = to.on('incoming', (call) => (inc = call))
    const out = await from.dial(to.extension)
    await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying)
    off()
    await inc!.answer()
    return { out, inc: inc! }
}

describe('Transferência assistida no PBX simulado (RF-16)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetMockNetwork()
    })
    afterEach(() => vi.useRealTimers())

    it('liga A com C e derruba as duas pernas de quem transferiu', async () => {
        const a = make('1001')
        const b = make('1002')
        const c = make('1003')
        await Promise.all([registered(a), registered(b), registered(c)])

        // A liga para B; B põe A em espera e consulta C.
        const ab = await connect(a, b)
        await ab.inc.setHeld(true)
        const bc = await connect(b, c)

        const progress: Array<[number, boolean]> = []
        const ends: Record<string, CallEnd> = {}
        ab.inc.on('transfer', (code, _r, final) => progress.push([code, final]))
        ab.inc.on('ended', (e) => (ends.original = e))
        bc.out.on('ended', (e) => (ends.consult = e))

        await ab.inc.attendedTransfer(bc.out)
        await vi.advanceTimersByTimeAsync(300)

        expect(progress).toEqual([
            [100, false],
            [200, true]
        ])
        expect(ends.original?.reason).toBe('Transferida para 1003')
        expect(ends.consult?.reason).toBe('Transferência concluída com 1001')

        // A e C continuam em chamada e agora falam entre si.
        const received: string[] = []
        bc.inc.on('dtmf', (t) => received.push(t))
        await ab.out.sendDtmf('7', 'sip-info')
        expect(received).toEqual(['7'])
    })

    it('recusa se a consulta ainda não foi atendida', async () => {
        const a = make('1001')
        const b = make('1002')
        const c = make('1003')
        await Promise.all([registered(a), registered(b), registered(c)])
        const ab = await connect(a, b)
        const ringing = await b.dial('1003')
        await expect(ab.inc.attendedTransfer(ringing)).rejects.toThrow('As duas chamadas precisam estar em andamento')
    })

    it('falha com 481 se a consulta cair antes de o PBX concluir', async () => {
        const a = make('1001')
        const b = make('1002')
        const c = make('1003')
        await Promise.all([registered(a), registered(b), registered(c)])
        const ab = await connect(a, b)
        const bc = await connect(b, c)
        const progress: number[] = []
        ab.inc.on('transfer', (code) => progress.push(code))

        await ab.inc.attendedTransfer(bc.out)
        await bc.inc.hangup()
        await vi.advanceTimersByTimeAsync(300)

        expect(progress).toEqual([100, 481])
    })
})
