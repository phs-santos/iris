import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { monitorTransition, type WebhookPayload } from '@shared/monitor'
import { useLogStore } from './log'
import { useScenariosStore } from './scenarios'

export interface MonitorState {
    /** Resultado da última execução; undefined antes da primeira. */
    passed?: boolean
    lastAt?: number
    message?: string
    nextAt: number
}

/** Espera depois de ligar o monitor (ou abrir o app) até a primeira execução. */
const FIRST_RUN_MS = 5000
const TICK_MS = 1000

/** Monitor (RF-43): executa os cenários marcados de tempos em tempos e avisa quando o resultado muda. */
export const useMonitorStore = defineStore('monitor', () => {
    const states = reactive<Record<string, MonitorState>>({})
    let timer: ReturnType<typeof setInterval> | undefined
    let busy = false

    async function tick(): Promise<void> {
        const scenarios = useScenariosStore()
        if (busy) return
        const now = Date.now()
        for (const id of Object.keys(states)) {
            if (!scenarios.scenarios.find((s) => s.id === id)?.monitor?.enabled) delete states[id]
        }
        for (const scenario of scenarios.scenarios) {
            if (!scenario.monitor?.enabled) continue
            const state = (states[scenario.id] ??= { nextAt: now + FIRST_RUN_MS })
            // Um cenário rodando à mão (ou outro monitor) tem a vez; este espera a próxima volta.
            if (now < state.nextAt || scenarios.running) continue
            busy = true
            try {
                await runOne(scenario.id)
            } finally {
                busy = false
            }
            return
        }
    }

    async function runOne(id: string): Promise<void> {
        const scenarios = useScenariosStore()
        const log = useLogStore()
        const scenario = scenarios.scenarios.find((s) => s.id === id)
        const state = states[id]
        if (!scenario?.monitor || !state) return
        const { everyMinutes, webhook } = scenario.monitor
        await scenarios.run(id)
        const result = scenarios.lastRun
        state.nextAt = Date.now() + everyMinutes * 60_000
        if (!result || result.scenarioId !== id) return
        const event = monitorTransition(state.passed, result.passed)
        const failed = result.failedAt === undefined ? undefined : result.steps[result.failedAt]
        state.passed = result.passed
        state.lastAt = Date.now()
        state.message = failed?.message
        if (!event) return

        const where = result.failedAt === undefined ? '' : `no passo ${result.failedAt + 1}: ${failed?.message ?? ''}`
        const text =
            event === 'failed'
                ? `Monitor: o cenário "${scenario.name}" falhou ${where}`
                : `Monitor: o cenário "${scenario.name}" voltou a passar`
        log.add(null, event === 'failed' ? 'error' : 'info', 'event', text)
        window.iris.notify(event === 'failed' ? `${scenario.name} falhou` : `${scenario.name} voltou a passar`, text)
        if (!webhook) return
        const payload: WebhookPayload = {
            app: 'Iris',
            event,
            scenario: scenario.name,
            failedStep: result.failedAt === undefined ? undefined : result.failedAt + 1,
            message: failed?.message,
            durationMs: result.ms,
            at: new Date().toISOString()
        }
        await window.iris.monitor.webhook(webhook, payload).then(
            (status) => log.add(null, status < 300 ? 'info' : 'warn', 'event', `Monitor: webhook respondeu ${status}`),
            (error: Error) => log.add(null, 'warn', 'event', `Monitor: webhook falhou: ${error.message}`)
        )
    }

    function start(): void {
        timer ??= setInterval(() => void tick(), TICK_MS)
    }

    function stop(): void {
        clearInterval(timer)
        timer = undefined
    }

    return { states, start, stop }
})
