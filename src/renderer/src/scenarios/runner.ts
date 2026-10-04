// Executor de cenários (RF-29 e RF-30). Não conhece Vue nem Pinia: fala com o app por um
// ScenarioDriver, então roda igual na interface e nos testes com o PBX simulado.

import type { Scenario, ScenarioCallState, ScenarioStep } from '@shared/types'
import type { RegStatus } from '@renderer/sip/engine'
import { describeStep, stateLabel } from '@renderer/lib/scenarios'
import { AUDIO_THRESHOLD_DB, SAMPLE_RATE, toneSamples } from '@shared/audio'

/** O que o executor precisa saber de uma chamada. */
export interface DriverCall {
    id: string
    accountId: string
    direction: 'in' | 'out'
    state: 'dialing' | 'ringing' | 'early' | 'established' | 'ended'
    held: boolean
    heldByRemote: boolean
    /** Último código recebido, ex.: "180 Ringing". */
    progress?: string
    /** Como terminou, ex.: "Encerrada pelo outro lado · 486 Busy Here". */
    endText?: string
    dtmfReceived: string
    transfer?: { code: number; reason: string; final: boolean }
    startedAt: number
}

export interface ScenarioDriver {
    regStatus(accountId: string): RegStatus
    register(accountId: string): Promise<void>
    dial(accountId: string, to: string): Promise<string | undefined>
    call(id: string): DriverCall | undefined
    calls(): DriverCall[]
    answer(id: string): Promise<void>
    hangup(id: string): Promise<void>
    sendDtmf(id: string, digits: string): Promise<void>
    transfer(id: string, to: string): Promise<void>
    /** Toca um áudio na chamada, no lugar do microfone (RF-41). */
    playAudio(id: string, pcm: Int16Array): Promise<void>
    /** Volume do que chega na chamada, em dBFS; null quando o motor não mede. */
    audioLevel(id: string): Promise<number | null>
    /** Lê um WAV como PCM de 16 bits a 8000 Hz. */
    loadWav(path: string): Promise<Int16Array>
    /** Linhas de log desde `since` (ms), opcionalmente de uma conta. */
    logSince(since: number, accountId?: string): string[]
    accountName(id: string): string
}

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

export interface StepResult {
    status: StepStatus
    ms?: number
    message?: string
}

export interface RunResult {
    scenarioId: string
    scenarioName: string
    startedAt: number
    ms: number
    passed: boolean
    steps: StepResult[]
    /** Índice do passo que falhou, se algum. */
    failedAt?: number
}

export interface RunOptions {
    signal?: AbortSignal
    onStep?: (index: number, result: StepResult) => void
    /** Intervalo de verificação dos estados, em ms. */
    pollMs?: number
}

export const REGISTER_TIMEOUT_MS = 15_000
export const TRANSFER_TIMEOUT_MS = 15_000
/** Duração de um tom RTP (100 ms) mais o intervalo depois dele, com folga. */
export const DTMF_SETTLE_MS = 300
/** Intervalo entre as medidas de volume e quantas seguidas confirmam áudio ou silêncio (RF-41). */
export const AUDIO_POLL_MS = 100
export const AUDIO_READS = 3

class StepFailure extends Error {}
class Stopped extends Error {}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Stopped('Interrompido'))
        const t = setTimeout(resolve, ms)
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(t)
                reject(new Stopped('Interrompido'))
            },
            { once: true }
        )
    })

/** Estado em palavras, como no cartão da chamada. */
function describeCall(c: DriverCall): string {
    if (c.state === 'ended') return c.endText ?? 'encerrada'
    if (c.held || c.heldByRemote) return 'em espera'
    return { dialing: 'discando', ringing: 'chamando', early: 'early media', established: 'em chamada' }[c.state]
}

function reached(c: DriverCall, state: ScenarioCallState): boolean {
    switch (state) {
        case 'ringing':
            return c.state === 'ringing' || c.state === 'early' || c.state === 'established'
        case 'early':
            return c.state === 'early' || c.state === 'established'
        case 'established':
            return c.state === 'established'
        case 'held':
            return c.state === 'established' && (c.held || c.heldByRemote)
        case 'ended':
            return c.state === 'ended'
    }
}

export async function runScenario(
    scenario: Scenario,
    driver: ScenarioDriver,
    options: RunOptions = {}
): Promise<RunResult> {
    const { signal, onStep, pollMs = 50 } = options
    const startedAt = Date.now()
    const aliases = new Map<string, string>()
    const results: StepResult[] = scenario.steps.map(() => ({ status: 'pending' }))
    const accountOf = (step: { account?: string }): string => step.account || scenario.accountId
    const claimed = new Set<string>()

    const callOf = (alias: string): DriverCall => {
        const id = aliases.get(alias.trim())
        const call = id ? driver.call(id) : undefined
        if (!call) throw new StepFailure(`A chamada ${alias} não existe (nenhum passo anterior a criou)`)
        return call
    }

    /** Repete `check` até ele devolver true; falha com `onTimeout()` quando o tempo acaba. */
    async function until(check: () => boolean, timeoutMs: number, onTimeout: () => string): Promise<void> {
        const deadline = Date.now() + timeoutMs
        while (!check()) {
            if (Date.now() >= deadline) throw new StepFailure(onTimeout())
            await sleep(pollMs, signal)
        }
    }

    async function execute(step: ScenarioStep): Promise<string | undefined> {
        switch (step.type) {
            case 'register': {
                const id = accountOf(step)
                if (!id) throw new StepFailure('Escolha a conta de origem do cenário')
                if (driver.regStatus(id).state === 'registered') return 'já registrada'
                await driver.register(id)
                await until(
                    () => {
                        const s = driver.regStatus(id)
                        if (s.state === 'error')
                            throw new StepFailure(`Registro recusado: ${[s.code, s.reason].filter(Boolean).join(' ')}`)
                        return s.state === 'registered'
                    },
                    REGISTER_TIMEOUT_MS,
                    () => `Não registrou em ${REGISTER_TIMEOUT_MS / 1000} s`
                )
                return undefined
            }
            case 'dial': {
                const id = accountOf(step)
                if (driver.regStatus(id).state !== 'registered')
                    throw new StepFailure(`${driver.accountName(id)} não está registrada`)
                const callId = await driver.dial(id, step.to.trim()).catch((error: Error) => {
                    throw new StepFailure(`Não discou: ${error.message}`)
                })
                if (!callId) throw new StepFailure('Não discou')
                aliases.set(step.call.trim(), callId)
                return undefined
            }
            case 'answer': {
                const id = accountOf(step)
                let found: DriverCall | undefined
                await until(
                    () => {
                        found = driver
                            .calls()
                            .find(
                                (c) =>
                                    c.accountId === id &&
                                    c.direction === 'in' &&
                                    c.state === 'ringing' &&
                                    c.startedAt >= startedAt &&
                                    !claimed.has(c.id)
                            )
                        return Boolean(found)
                    },
                    step.timeoutMs,
                    () => `Nenhuma chamada chegou em ${driver.accountName(id)} em ${step.timeoutMs / 1000} s`
                )
                claimed.add(found!.id)
                aliases.set(step.call.trim(), found!.id)
                await driver.answer(found!.id)
                return undefined
            }
            case 'wait':
                await sleep(step.ms, signal)
                return undefined
            case 'waitState': {
                const label = stateLabel(step.state)
                await until(
                    () => {
                        const c = callOf(step.call)
                        if (reached(c, step.state)) return true
                        if (c.state === 'ended')
                            throw new StepFailure(
                                `Esperava ${label}, mas a chamada terminou: ${c.endText ?? 'encerrada'}`
                            )
                        return false
                    },
                    step.timeoutMs,
                    () => `Esperava ${label} em ${step.timeoutMs / 1000} s; estado: ${describeCall(callOf(step.call))}`
                )
                return undefined
            }
            case 'dtmf': {
                const c = callOf(step.call)
                if (c.state !== 'established')
                    throw new StepFailure(`A chamada está ${describeCall(c)}, não em chamada`)
                await driver.sendDtmf(c.id, step.digits)
                // O envio por RTP termina de tocar depois que a promessa resolve; sem esta espera,
                // um "desligar" logo em seguida cortava o último dígito.
                await sleep(DTMF_SETTLE_MS, signal)
                return undefined
            }
            case 'transfer': {
                const c = callOf(step.call)
                if (c.state !== 'established')
                    throw new StepFailure(`A chamada está ${describeCall(c)}, não em chamada`)
                await driver.transfer(c.id, step.to.trim())
                await until(
                    () => Boolean(callOf(step.call).transfer?.final),
                    TRANSFER_TIMEOUT_MS,
                    () => `Transferência sem resposta final em ${TRANSFER_TIMEOUT_MS / 1000} s`
                )
                const t = callOf(step.call).transfer!
                if (t.code >= 300) throw new StepFailure(`Transferência recusada: ${t.code} ${t.reason}`)
                return `${t.code} ${t.reason}`
            }
            case 'playTone':
            case 'playFile': {
                const c = callOf(step.call)
                if (c.state !== 'established')
                    throw new StepFailure(`A chamada está ${describeCall(c)}, não em chamada`)
                const pcm =
                    step.type === 'playTone'
                        ? toneSamples(step.hz, step.ms)
                        : await driver.loadWav(step.path.trim()).catch((error: Error) => {
                              throw new StepFailure(`Não foi possível ler o arquivo: ${error.message}`)
                          })
                await driver.playAudio(c.id, pcm).catch((error: Error) => {
                    throw new StepFailure(error.message)
                })
                return `${Math.round((pcm.length / SAMPLE_RATE) * 1000)} ms de áudio`
            }
            case 'waitAudio':
            case 'waitSilence': {
                const wantAudio = step.type === 'waitAudio'
                const deadline = Date.now() + step.timeoutMs
                let streak = 0
                let last: number | null = null
                // Uma medida só não basta: um estalo conta como áudio e uma pausa entre palavras, como silêncio.
                for (;;) {
                    const c = callOf(step.call)
                    if (c.state !== 'established')
                        throw new StepFailure(`A chamada está ${describeCall(c)}, não em chamada`)
                    last = await driver.audioLevel(c.id)
                    if (last === null) throw new StepFailure('Esta conta não mede o áudio da chamada')
                    streak = last >= AUDIO_THRESHOLD_DB === wantAudio ? streak + 1 : 0
                    if (streak >= AUDIO_READS) return `${last} dBFS`
                    if (Date.now() >= deadline)
                        throw new StepFailure(
                            wantAudio
                                ? `Sem áudio em ${step.timeoutMs / 1000} s (volume: ${last} dBFS)`
                                : `O áudio não parou em ${step.timeoutMs / 1000} s (volume: ${last} dBFS)`
                        )
                    await sleep(Math.min(AUDIO_POLL_MS, pollMs * 2), signal)
                }
            }
            case 'hangup': {
                const c = callOf(step.call)
                if (c.state === 'ended') return 'já estava encerrada'
                await driver.hangup(c.id)
                await until(
                    () => callOf(step.call).state === 'ended',
                    5000,
                    () => 'A chamada não terminou em 5 s'
                )
                return undefined
            }
            case 'verify': {
                const expected = step.expected.trim()
                if (step.check === 'log') {
                    const hit = driver.logSince(startedAt).some((line) => line.includes(expected))
                    if (!hit) throw new StepFailure(`"${expected}" não apareceu no log`)
                    return undefined
                }
                const c = callOf(step.call)
                const actual =
                    step.check === 'code' ? [c.progress, c.endText].filter(Boolean).join(' · ') : c.dtmfReceived
                if (!actual.includes(expected))
                    throw new StepFailure(`Esperava "${expected}", veio "${actual || 'nada'}"`)
                return actual
            }
        }
    }

    let failedAt: number | undefined
    try {
        for (let i = 0; i < scenario.steps.length; i++) {
            if (signal?.aborted) throw new Stopped('Interrompido')
            const step = scenario.steps[i]
            results[i] = { status: 'running' }
            onStep?.(i, results[i])
            const t0 = performance.now()
            try {
                const message = await execute(step)
                results[i] = { status: 'passed', ms: Math.round(performance.now() - t0), message }
            } catch (error) {
                const stopped = error instanceof Stopped
                results[i] = {
                    status: 'failed',
                    ms: Math.round(performance.now() - t0),
                    message: stopped
                        ? 'Interrompido'
                        : error instanceof StepFailure
                          ? error.message
                          : `Erro inesperado: ${(error as Error).message}`
                }
                failedAt = i
                onStep?.(i, results[i])
                if (stopped) throw error
                break
            }
            onStep?.(i, results[i])
        }
    } catch (error) {
        if (!(error instanceof Stopped)) throw error
    } finally {
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'pending') {
                results[i] = { status: 'skipped' }
                onStep?.(i, results[i])
            }
        }
        // Não deixa chamadas abertas para a próxima execução.
        for (const id of aliases.values()) {
            const c = driver.call(id)
            if (c && c.state !== 'ended') await driver.hangup(id).catch(() => undefined)
        }
    }

    return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        startedAt,
        ms: Date.now() - startedAt,
        passed: failedAt === undefined,
        steps: results,
        failedAt
    }
}

// ─── Execução repetida e relatório (RF-30) ─────────────────────────────────

export interface ScenarioReport {
    scenario: string
    steps: string[]
    startedAt: string
    runs: number
    passed: number
    failed: number
    successRate: number
    avgMs: number
    p95Ms: number
    /** Falhas agrupadas por passo, com a última mensagem. */
    failures: Array<{ step: number; description: string; count: number; lastMessage: string }>
    results: Array<{ run: number; passed: boolean; ms: number; failedStep?: number; message?: string }>
}

export function buildReport(
    scenario: Scenario,
    runs: RunResult[],
    accountName: (id?: string) => string
): ScenarioReport {
    const steps = scenario.steps.map((s) => describeStep(s, (id) => accountName(id || scenario.accountId)))
    const passed = runs.filter((r) => r.passed).length
    const durations = runs.map((r) => r.ms).sort((a, b) => a - b)
    const failures = new Map<number, { count: number; lastMessage: string }>()
    for (const r of runs) {
        if (r.failedAt === undefined) continue
        const f = failures.get(r.failedAt) ?? { count: 0, lastMessage: '' }
        f.count++
        f.lastMessage = r.steps[r.failedAt]?.message ?? ''
        failures.set(r.failedAt, f)
    }
    return {
        scenario: scenario.name,
        steps,
        startedAt: new Date(runs[0]?.startedAt ?? Date.now()).toISOString(),
        runs: runs.length,
        passed,
        failed: runs.length - passed,
        successRate: runs.length ? Math.round((passed / runs.length) * 1000) / 10 : 0,
        avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
        p95Ms: durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0,
        failures: [...failures.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .map(([step, f]) => ({ step: step + 1, description: steps[step], ...f })),
        results: runs.map((r, i) => ({
            run: i + 1,
            passed: r.passed,
            ms: r.ms,
            failedStep: r.failedAt === undefined ? undefined : r.failedAt + 1,
            message: r.failedAt === undefined ? undefined : r.steps[r.failedAt]?.message
        }))
    }
}

export function reportToText(report: ScenarioReport): string {
    const lines = [
        `Relatório do cenário "${report.scenario}"`,
        `Início: ${report.startedAt}`,
        `Execuções: ${report.runs} · passaram: ${report.passed} · falharam: ${report.failed} · taxa de sucesso: ${report.successRate}%`,
        `Duração: média ${report.avgMs} ms · p95 ${report.p95Ms} ms`,
        '',
        'Passos:',
        ...report.steps.map((s, i) => `  ${i + 1}. ${s}`)
    ]
    if (report.failures.length) {
        lines.push('', 'Falhas por passo:')
        for (const f of report.failures)
            lines.push(`  passo ${f.step} (${f.description}): ${f.count}× · ${f.lastMessage}`)
    }
    lines.push('', 'Execuções:')
    for (const r of report.results)
        lines.push(`  #${r.run} ${r.passed ? 'passou' : `falhou no passo ${r.failedStep}: ${r.message}`} · ${r.ms} ms`)
    return lines.join('\n')
}
