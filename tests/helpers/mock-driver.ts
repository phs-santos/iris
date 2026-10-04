// Driver de cenários para testes: contas no PBX simulado, sem Vue nem Pinia.
import { toneSamples } from '@shared/audio'
import { MockEngine } from '@renderer/sip/mock-engine'
import type { EngineCall, RegStatus } from '@renderer/sip/engine'
import { newAccount } from '@renderer/lib/accounts'
import { parseDtmfSequence, runDtmfSequence } from '@renderer/lib/dtmf'
import type { DriverCall, ScenarioDriver } from '@renderer/scenarios/runner'

export interface MockAccount {
    id: string
    extension: string
    autoAnswerMs?: number
}

export function mockDriver(list: MockAccount[]): ScenarioDriver & { engines: Map<string, MockEngine> } {
    const engines = new Map<string, MockEngine>()
    const status = new Map<string, RegStatus>()
    const calls = new Map<string, DriverCall>()
    const engineCalls = new Map<string, EngineCall>()
    const log: Array<{ ts: number; accountId: string; text: string }> = []

    const track = (accountId: string, call: EngineCall, state: DriverCall['state']): DriverCall => {
        const c: DriverCall = {
            id: call.id,
            accountId,
            direction: call.direction,
            state,
            held: false,
            heldByRemote: false,
            dtmfReceived: '',
            startedAt: Date.now()
        }
        calls.set(call.id, c)
        engineCalls.set(call.id, call)
        call.on('progress', (code, reason, early) => {
            if (c.state === 'established') return
            c.progress = `${code} ${reason}`
            if (code >= 180 && c.state === 'dialing') c.state = early ? 'early' : 'ringing'
            if (early) c.state = 'early'
        })
        call.on('established', () => (c.state = 'established'))
        call.on('ended', (end) => {
            c.state = 'ended'
            c.endText = [end.by, end.code, end.reason].filter(Boolean).join(' · ')
        })
        call.on('hold', (by) => (by === 'remote' ? (c.heldByRemote = true) : (c.held = true)))
        call.on('unhold', (by) => (by === 'remote' ? (c.heldByRemote = false) : (c.held = false)))
        call.on('dtmf', (tone) => (c.dtmfReceived += tone))
        call.on('transfer', (code, reason, final) => (c.transfer = { code, reason, final }))
        return c
    }

    for (const a of list) {
        const engine = new MockEngine(
            newAccount({
                id: a.id,
                name: `Conta ${a.extension}`,
                extension: a.extension,
                domain: 'demo.local',
                simulated: true
            }),
            '1234'
        )
        engines.set(a.id, engine)
        status.set(a.id, { state: 'disconnected' })
        engine.on('status', (s) => status.set(a.id, s))
        engine.on('log', (e) => log.push({ ts: Date.now(), accountId: a.id, text: e.text }))
        engine.on('incoming', (call) => {
            track(a.id, call, 'ringing')
            if (a.autoAnswerMs !== undefined) setTimeout(() => void call.answer(), a.autoAnswerMs)
        })
    }

    const call = (id: string): EngineCall => {
        const c = engineCalls.get(id)
        if (!c) throw new Error(`chamada ${id} desconhecida`)
        return c
    }

    return {
        engines,
        regStatus: (id) => status.get(id) ?? { state: 'disconnected' },
        register: async (id) => void engines.get(id)?.connect(),
        dial: async (id, to) => track(id, await engines.get(id)!.dial(to), 'dialing').id,
        call: (id) => calls.get(id),
        calls: () => [...calls.values()],
        answer: (id) => call(id).answer(),
        hangup: (id) => call(id).hangup(),
        sendDtmf: (id, digits) =>
            runDtmfSequence(parseDtmfSequence(digits), (t) => call(id).sendDtmf(t, 'sip-info'), undefined, 10),
        transfer: (id, to) => call(id).transfer(to),
        playAudio: (id, pcm) => call(id).playAudio!(pcm),
        audioLevel: (id) => call(id).audioLevel(),
        loadWav: async (path) => {
            if (!path.endsWith('teste.wav')) throw new Error('arquivo não encontrado')
            return toneSamples(600, 200)
        },
        logSince: (since, accountId) =>
            log.filter((l) => l.ts >= since && (!accountId || l.accountId === accountId)).map((l) => l.text),
        accountName: (id) => `Conta ${list.find((a) => a.id === id)?.extension ?? '?'}`
    }
}
