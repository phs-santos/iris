import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockEngine, MOCK_TIMING, resetMockNetwork } from '@renderer/sip/mock-engine'
import type { CallEnd, EngineCall, RegStatus } from '@renderer/sip/engine'
import { newAccount } from '@renderer/lib/accounts'
import { levelDb, SILENCE_DB, toneSamples } from '@shared/audio'

const make = (extension: string, password = '1234', domain = 'demo.local'): MockEngine =>
    new MockEngine(newAccount({ name: extension, extension, domain, simulated: true, rawSipLog: true }), password)

async function registered(engine: MockEngine): Promise<void> {
    const p = engine.connect()
    await vi.advanceTimersByTimeAsync(MOCK_TIMING.register)
    await p
}

describe('MockEngine', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetMockNetwork()
    })
    afterEach(() => vi.useRealTimers())

    it('registra com senha válida e recusa senha errada com 403', async () => {
        const ok = make('1001')
        const bad = make('1002', 'errada')
        const statuses: RegStatus[] = []
        bad.on('status', (s) => statuses.push(s))
        await registered(ok)
        await registered(bad)
        expect(ok.registered).toBe(true)
        expect(statuses.at(-1)).toEqual({ state: 'error', code: 403, reason: 'Forbidden' })
    })

    it('mensagem de texto (RF-54): chega à outra conta, a URA responde e ramal desconhecido dá 404', async () => {
        const a = make('1001')
        const b = make('1002')
        await registered(a)
        await registered(b)
        const got: Array<[string, string, string]> = []
        a.on('message', (from, text) => got.push(['a', from, text]))
        b.on('message', (from, text) => got.push(['b', from, text]))

        await a.sendMessage('1002', 'oi')
        await a.sendMessage('8000', 'teste')
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.ringing)
        expect(got).toEqual([
            ['b', '1001', 'oi'],
            ['a', '8000', 'URA recebeu: teste']
        ])
        await expect(a.sendMessage('1999', 'alguém?')).rejects.toThrow('404 Not Found')
        await expect(make('1003').sendMessage('1001', 'x')).rejects.toThrow('Registre a conta')
    })

    it('liga entre duas contas do mesmo domínio e encerra dos dois lados', async () => {
        const a = make('1001')
        const b = make('1002')
        await registered(a)
        await registered(b)

        let incoming: EngineCall | undefined
        b.on('incoming', (call) => (incoming = call))
        const out = await a.dial('1002')
        const progress: number[] = []
        let outEstablished = false
        let inEnd: CallEnd | undefined
        out.on('progress', (code) => progress.push(code))
        out.on('established', () => (outEstablished = true))

        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying + MOCK_TIMING.ringing)
        expect(progress).toEqual([100, 180])
        expect(incoming?.remote).toBe('1001')

        incoming!.on('ended', (e) => (inEnd = e))
        await incoming!.answer()
        expect(outEstablished).toBe(true)

        await out.hangup()
        expect(inEnd).toEqual({ by: 'remote' })
    })

    it('simula o áudio: voz dos dois lados, silêncio em mudo e em espera, e o volume de um tom tocado (RF-41)', async () => {
        const a = make('1001')
        const b = make('1002')
        await registered(a)
        await registered(b)
        let incoming: EngineCall | undefined
        b.on('incoming', (call) => (incoming = call))
        const out = await a.dial('1002')
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying)
        expect(await out.audioLevel()).toBe(SILENCE_DB)
        await incoming!.answer()
        expect(await out.audioLevel()).toBe(-30)
        expect(await incoming!.audioLevel()).toBe(-30)

        // Mudo de um lado: só o outro lado deixa de ouvir.
        incoming!.setMuted(true)
        expect(await out.audioLevel()).toBe(SILENCE_DB)
        expect(await incoming!.audioLevel()).toBe(-30)
        incoming!.setMuted(false)

        // Um tom tocado por A chega em B com o volume do tom, enquanto durar.
        const tone = toneSamples(440, 300)
        const playing = out.playAudio!(tone)
        expect(await incoming!.audioLevel()).toBe(levelDb(tone))
        await vi.advanceTimersByTimeAsync(300)
        await playing
        expect(await incoming!.audioLevel()).toBe(-30)

        await out.setHeld(true)
        expect(await out.audioLevel()).toBe(SILENCE_DB)
        expect(await incoming!.audioLevel()).toBe(SILENCE_DB)
    })

    it('pedido manual no simulado (RF-45): 200 para OPTIONS, 489 para assinatura, erro sem registro', async () => {
        const a = make('1001')
        await expect(a.request({ method: 'OPTIONS', uri: 'sip:demo.local', headers: [] })).rejects.toThrow(
            /Registre a conta/
        )
        await registered(a)
        const ok = await a.request({ method: 'OPTIONS', uri: 'sip:demo.local', headers: [] })
        expect(ok).toMatchObject({ status: 200, reason: 'OK' })
        expect(ok.text).toContain('Allow: INVITE')
        expect(await a.request({ method: 'SUBSCRIBE', uri: 'sip:1002@demo.local', headers: [] })).toMatchObject({
            status: 489
        })
    })

    it('BLF simulado (RF-27): quem acompanha um ramal vê livre, em chamada e livre de novo', async () => {
        const watcher = new MockEngine(
            newAccount({ name: 'vigia', extension: '1003', domain: 'demo.local', simulated: true, blf: '1002, 1009' }),
            '1234'
        )
        const a = make('1001')
        const b = make('1002')
        const seen: string[] = []
        watcher.on('presence', (extension, state) => seen.push(`${extension} ${state}`))
        await registered(b)
        await registered(a)
        await registered(watcher)
        // 1002 já estava registrado; 1009 não existe.
        expect(seen).toEqual(['1002 idle', '1009 unknown'])
        let incoming: EngineCall | undefined
        b.on('incoming', (call) => (incoming = call))
        const out = await a.dial('1002')
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying)
        await incoming!.answer()
        await out.hangup()
        expect(seen.slice(2)).toEqual(['1002 busy', '1002 idle'])
    })

    it('entrega o DTMF enviado ao outro lado', async () => {
        const a = make('1001')
        const b = make('1002')
        await registered(a)
        await registered(b)
        let incoming: EngineCall | undefined
        b.on('incoming', (call) => (incoming = call))
        const out = await a.dial('1002')
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying)
        const received: string[] = []
        incoming!.on('dtmf', (t) => received.push(t))
        await incoming!.answer()
        await out.sendDtmf('5', 'sip-info')
        expect(received).toEqual(['5'])
    })

    it('recusar devolve 486 para quem ligou', async () => {
        const a = make('1001')
        const b = make('1002')
        await registered(a)
        await registered(b)
        let incoming: EngineCall | undefined
        b.on('incoming', (call) => (incoming = call))
        const out = await a.dial('1002')
        let end: CallEnd | undefined
        out.on('ended', (e) => (end = e))
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying)
        await incoming!.reject()
        expect(end).toEqual({ by: 'remote', code: 486, reason: 'Busy Here' })
    })

    it('simula números especiais: 486 ocupado, 404 desconhecido e URA com early media', async () => {
        const a = make('1001')
        await registered(a)

        const ends: Record<string, CallEnd | undefined> = {}
        for (const n of ['486', '777']) {
            const call = await a.dial(n)
            call.on('ended', (e) => (ends[n] = e))
        }
        const ivr = await a.dial('8000')
        const ivrProgress: Array<[number, boolean]> = []
        let ivrUp = false
        ivr.on('progress', (code, _r, early) => ivrProgress.push([code, early]))
        ivr.on('established', () => (ivrUp = true))

        await vi.advanceTimersByTimeAsync(MOCK_TIMING.ivrAnswer + MOCK_TIMING.trying)
        expect(ends['486']?.code).toBe(486)
        expect(ends['777']?.code).toBe(404)
        expect(ivrProgress).toEqual([
            [100, false],
            [183, true]
        ])
        expect(ivrUp).toBe(true)
    })

    it('não liga para conta de outro domínio', async () => {
        const a = make('1001', '1234', 'demo.local')
        const b = make('1002', '1234', 'lab.local')
        await registered(a)
        await registered(b)
        const incoming = vi.fn()
        b.on('incoming', incoming)
        const out = await a.dial('1002')
        let end: CallEnd | undefined
        out.on('ended', (e) => (end = e))
        await vi.advanceTimersByTimeAsync(MOCK_TIMING.trying)
        expect(incoming).not.toHaveBeenCalled()
        expect(end?.code).toBe(404)
    })

    it('exige registro para ligar', async () => {
        await expect(make('1001').dial('1002')).rejects.toThrow(/registrada/)
    })
})
