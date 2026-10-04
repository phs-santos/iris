import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scenario } from '@shared/types'
import { resetMockNetwork } from '@renderer/sip/mock-engine'
import { buildReport, reportToText, runScenario } from '@renderer/scenarios/runner'
import { lastCallAlias, newScenario, newStep, normalizeScenarios, validateScenario } from '@renderer/lib/scenarios'
import { mockDriver } from './helpers/mock-driver'

/** Cenário de URA: registra, liga para 8000, espera atender, manda DTMF, confere o log e desliga. */
const ivr = (): Scenario => ({
    id: 'ura',
    name: 'URA 8000',
    accountId: 'a',
    steps: [
        { type: 'register' },
        { type: 'dial', to: '8000', call: 'c1' },
        { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 5000 },
        { type: 'dtmf', call: 'c1', digits: '1234' },
        { type: 'verify', call: 'c1', check: 'log', expected: 'URA recebeu o dígito 4' },
        { type: 'hangup', call: 'c1' }
    ]
})

describe('Cenários: definição e arquivo (RF-28)', () => {
    it('um cenário de 6 passos sai e volta do arquivo sem perdas', () => {
        const original = ivr()
        const [reopened] = normalizeScenarios(JSON.parse(JSON.stringify([original])))
        expect(reopened).toEqual(original)
    })

    it('completa campos que faltam e descarta passos desconhecidos', () => {
        const [s] = normalizeScenarios([{ name: 'x', steps: [{ type: 'waitState', call: 'c9' }, { type: 'voar' }] }])
        expect(s.id).toBeTruthy()
        expect(s.steps).toEqual([{ type: 'waitState', call: 'c9', state: 'established', timeoutMs: 10000 }])
    })

    it('aponta passo que usa chamada ainda não criada e DTMF inválido', () => {
        const errors = validateScenario({
            ...newScenario('a'),
            steps: [{ type: 'hangup', call: 'c1' }, newStep('dial'), { type: 'dtmf', call: 'c1', digits: '12x' }]
        })
        expect(errors[0]).toMatch(/não existe/)
        expect(errors[1]).toMatch(/número/)
        expect(errors[2]).toMatch(/não é um dígito/)
        expect(validateScenario(ivr())).toEqual([null, null, null, null, null, null])
    })

    it('passos novos usam o apelido da última chamada', () => {
        expect(
            lastCallAlias([
                { type: 'dial', to: '1', call: 'x' },
                { type: 'wait', ms: 1 }
            ])
        ).toBe('x')
        expect(lastCallAlias([])).toBe('c1')
    })
})

describe('Cenários: execução no PBX simulado (RF-29, RF-30)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
        resetMockNetwork()
    })
    afterEach(() => vi.useRealTimers())

    async function run(scenario: Scenario, driver = mockDriver([{ id: 'a', extension: '1001' }])) {
        const p = runScenario(scenario, driver, { pollMs: 20 })
        await vi.runAllTimersAsync()
        return p
    }

    it('passa o cenário de URA e mede cada passo', async () => {
        const result = await run(ivr())
        expect(result.passed).toBe(true)
        expect(result.steps.map((s) => s.status)).toEqual(Array(6).fill('passed'))
        expect(result.steps.every((s) => typeof s.ms === 'number')).toBe(true)
    })

    it('esperar "em chamada" e receber 486 falha no passo, com o código', async () => {
        const scenario: Scenario = {
            id: 'b',
            name: 'Ocupado',
            accountId: 'a',
            steps: [
                { type: 'register' },
                { type: 'dial', to: '486', call: 'c1' },
                { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 5000 },
                { type: 'hangup', call: 'c1' }
            ]
        }
        const result = await run(scenario)
        expect(result.passed).toBe(false)
        expect(result.failedAt).toBe(2)
        expect(result.steps[2].status).toBe('failed')
        expect(result.steps[2].message).toMatch(/486 · Busy Here/)
        expect(result.steps[3].status).toBe('skipped')
    })

    it('atende em outra conta e confere o DTMF recebido', async () => {
        const driver = mockDriver([
            { id: 'a', extension: '1001' },
            { id: 'b', extension: '1002' }
        ])
        const scenario: Scenario = {
            id: 'c',
            name: 'Entre contas',
            accountId: 'a',
            steps: [
                { type: 'register' },
                { type: 'register', account: 'b' },
                { type: 'dial', to: '1002', call: 'saida' },
                { type: 'answer', account: 'b', call: 'entrada', timeoutMs: 5000 },
                { type: 'waitState', call: 'saida', state: 'established', timeoutMs: 5000 },
                { type: 'dtmf', call: 'saida', digits: '42#' },
                { type: 'verify', call: 'entrada', check: 'dtmfReceived', expected: '42#' },
                { type: 'hangup', call: 'saida' },
                { type: 'waitState', call: 'entrada', state: 'ended', timeoutMs: 2000 }
            ]
        }
        const result = await run(scenario, driver)
        expect(result.steps.map((s) => s.message ?? s.status)).toEqual([
            'passed',
            'passed',
            'passed',
            'passed',
            'passed',
            'passed',
            '42#',
            'passed',
            'passed'
        ])
    })

    const between = (steps: Scenario['steps']): Scenario => ({
        id: 'audio',
        name: 'Áudio',
        accountId: 'a',
        steps: [
            { type: 'register' },
            { type: 'register', account: 'b' },
            { type: 'dial', to: '1002', call: 'saida' },
            { type: 'answer', account: 'b', call: 'entrada', timeoutMs: 5000 },
            { type: 'waitState', call: 'saida', state: 'established', timeoutMs: 5000 },
            ...steps
        ]
    })
    const two = () =>
        mockDriver([
            { id: 'a', extension: '1001' },
            { id: 'b', extension: '1002' }
        ])

    it('áudio (RF-41): espera o áudio chegar, toca tom e arquivo e mostra a duração', async () => {
        const result = await run(
            between([
                { type: 'waitAudio', call: 'entrada', timeoutMs: 2000 },
                { type: 'playTone', call: 'saida', hz: 440, ms: 300 },
                { type: 'playFile', call: 'saida', path: '/tmp/teste.wav' },
                { type: 'hangup', call: 'saida' }
            ]),
            two()
        )
        expect(result.passed).toBe(true)
        expect(result.steps.slice(5).map((s) => s.message ?? s.status)).toEqual([
            '-30 dBFS',
            '300 ms de áudio',
            '200 ms de áudio',
            'passed'
        ])
    })

    it('áudio (RF-41): "esperar silêncio" falha com o volume quando o outro lado continua falando', async () => {
        const result = await run(between([{ type: 'waitSilence', call: 'saida', timeoutMs: 500 }]), two())
        expect(result.failedAt).toBe(5)
        expect(result.steps[5]!.message).toBe('O áudio não parou em 0.5 s (volume: -30 dBFS)')
    })

    it('áudio (RF-41): arquivo que não abre e chamada que não foi atendida falham no passo', async () => {
        const missing = await run(between([{ type: 'playFile', call: 'saida', path: '/tmp/outro.wav' }]), two())
        expect(missing.steps[5]!.message).toBe('Não foi possível ler o arquivo: arquivo não encontrado')

        const notAnswered = await run({
            id: 'x',
            name: 'x',
            accountId: 'a',
            steps: [
                { type: 'register' },
                { type: 'dial', to: '408', call: 'c1' },
                { type: 'waitAudio', call: 'c1', timeoutMs: 1000 }
            ]
        })
        expect(notAnswered.steps[2]!.message).toMatch(/não em chamada/)
    })

    it('áudio (RF-41): valida a frequência, a duração e o arquivo', () => {
        const errors = validateScenario({
            ...newScenario('a'),
            steps: [
                newStep('dial'),
                { type: 'playTone', call: 'c1', hz: 50, ms: 1000 },
                { type: 'playTone', call: 'c1', hz: 440, ms: 0 },
                { type: 'playFile', call: 'c1', path: 'som.mp3' },
                { type: 'waitAudio', call: 'c9', timeoutMs: 1000 },
                { type: 'playTone', call: 'c1', hz: 440, ms: 500 }
            ]
        })
        expect(errors.slice(1)).toEqual([
            'Use uma frequência de 100 a 3400 Hz',
            'Use de 1 ms a 2 minutos',
            'Escolha um arquivo .wav',
            'A chamada c9 ainda não existe neste ponto',
            null
        ])
    })

    it('transferência cega espera a resposta final do PBX', async () => {
        const driver = mockDriver([{ id: 'a', extension: '1001' }])
        const scenario: Scenario = {
            id: 't',
            name: 'Transferir',
            accountId: 'a',
            steps: [
                { type: 'register' },
                { type: 'dial', to: '8000', call: 'c1' },
                { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 5000 },
                { type: 'transfer', call: 'c1', to: '1002' }
            ]
        }
        const result = await run(scenario, driver)
        expect(result.passed).toBe(true)
        expect(result.steps[3].message).toBe('200 OK')
    })

    it('desliga as chamadas que o cenário deixou abertas', async () => {
        const driver = mockDriver([{ id: 'a', extension: '1001' }])
        const scenario: Scenario = {
            id: 'd',
            name: 'Sem desligar',
            accountId: 'a',
            steps: [
                { type: 'register' },
                { type: 'dial', to: '8000', call: 'c1' },
                { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 5000 }
            ]
        }
        await run(scenario, driver)
        expect(driver.calls().every((c) => c.state === 'ended')).toBe(true)
    })

    it('20 execuções geram um relatório com taxa de sucesso', async () => {
        const driver = mockDriver([{ id: 'a', extension: '1001' }])
        const ok = ivr()
        const busy: Scenario = {
            ...ivr(),
            steps: ivr().steps.map((s) => (s.type === 'dial' ? { ...s, to: '486' } : s))
        }
        const runs = []
        for (let i = 0; i < 20; i++) runs.push(await run(i % 5 === 4 ? busy : ok, driver))
        const report = buildReport(ok, runs, (id) => (id === 'a' ? 'Conta 1001' : '?'))
        expect(report.runs).toBe(20)
        expect(report.passed).toBe(16)
        expect(report.successRate).toBe(80)
        expect(report.failures).toEqual([
            expect.objectContaining({ step: 3, count: 4, lastMessage: expect.stringMatching(/486/) })
        ])
        const text = reportToText(report)
        expect(text).toContain('taxa de sucesso: 80%')
        expect(text).toContain('2. Discar 8000 de Conta 1001 (c1)')
    })

    it('para no meio quando interrompido', async () => {
        const controller = new AbortController()
        const driver = mockDriver([{ id: 'a', extension: '1001' }])
        const scenario: Scenario = {
            ...ivr(),
            steps: [{ type: 'register' }, { type: 'wait', ms: 60_000 }, { type: 'wait', ms: 1 }]
        }
        const p = runScenario(scenario, driver, { signal: controller.signal })
        await vi.advanceTimersByTimeAsync(1000)
        controller.abort()
        await vi.runAllTimersAsync()
        const result = await p
        expect(result.steps.map((s) => s.status)).toEqual(['passed', 'failed', 'skipped'])
        expect(result.steps[1].message).toBe('Interrompido')
    })
})
