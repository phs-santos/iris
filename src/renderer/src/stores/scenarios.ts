import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { Scenario } from '@shared/types'
import { newScenario, normalizeScenarios } from '@renderer/lib/scenarios'
import {
    buildReport,
    runScenario,
    type RunResult,
    type ScenarioReport,
    type StepResult
} from '@renderer/scenarios/runner'
import { storeDriver } from '@renderer/scenarios/store-driver'
import { useAccountsStore } from './accounts'
import { useLogStore } from './log'

/** Pausa entre execuções repetidas, para o PBX liberar as chamadas anteriores. */
export const REPEAT_GAP_MS = 500

export const useScenariosStore = defineStore('scenarios', () => {
    const scenarios = ref<Scenario[]>([])
    const selectedId = ref<string | null>(null)
    const loaded = ref(false)

    /** Resultado ao vivo da execução atual (ou da última), passo a passo. */
    const live = ref<StepResult[]>([])
    const running = ref(false)
    const batch = ref<{ done: number; total: number; passed: number } | null>(null)
    const lastRun = ref<RunResult | null>(null)
    const report = ref<ScenarioReport | null>(null)
    let controller: AbortController | null = null

    const selected = computed(() => scenarios.value.find((s) => s.id === selectedId.value) ?? null)

    async function load(): Promise<void> {
        scenarios.value = normalizeScenarios(await window.iris.scenarios.load())
        selectedId.value = scenarios.value[0]?.id ?? null
        loaded.value = true
    }

    async function persist(): Promise<void> {
        await window.iris.scenarios.save(JSON.parse(JSON.stringify(toRaw(scenarios.value))))
    }

    async function create(): Promise<Scenario> {
        const accounts = useAccountsStore()
        const scenario = newScenario(accounts.selectedId ?? accounts.accounts[0]?.id ?? '')
        scenarios.value.push(scenario)
        selectedId.value = scenario.id
        await persist()
        // Devolve o objeto reativo da lista, para quem chamou poder editá-lo.
        return scenarios.value[scenarios.value.length - 1]
    }

    async function duplicate(id: string): Promise<void> {
        const source = scenarios.value.find((s) => s.id === id)
        if (!source) return
        const copy: Scenario = {
            ...JSON.parse(JSON.stringify(source)),
            id: crypto.randomUUID(),
            name: `${source.name} (cópia)`
        }
        scenarios.value.push(copy)
        selectedId.value = copy.id
        await persist()
    }

    async function remove(id: string): Promise<void> {
        scenarios.value = scenarios.value.filter((s) => s.id !== id)
        if (selectedId.value === id) selectedId.value = scenarios.value[0]?.id ?? null
        await persist()
    }

    function resetResults(): void {
        live.value = []
        lastRun.value = null
        report.value = null
        batch.value = null
    }

    /** Executa o cenário `times` vezes seguidas e monta o relatório (RF-29, RF-30). */
    async function run(id: string, times = 1): Promise<void> {
        const scenario = scenarios.value.find((s) => s.id === id)
        if (!scenario || running.value) return
        const accounts = useAccountsStore()
        const log = useLogStore()
        const snapshot: Scenario = JSON.parse(JSON.stringify(toRaw(scenario)))
        const driver = storeDriver()
        const results: RunResult[] = []
        controller = new AbortController()
        running.value = true
        resetResults()
        batch.value = times > 1 ? { done: 0, total: times, passed: 0 } : null
        log.add(null, 'info', 'event', `Cenário "${snapshot.name}": ${times > 1 ? `${times} execuções` : 'executando'}`)
        try {
            for (let i = 0; i < times && !controller.signal.aborted; i++) {
                if (i > 0) await new Promise((r) => setTimeout(r, REPEAT_GAP_MS))
                live.value = snapshot.steps.map(() => ({ status: 'pending' }))
                const result = await runScenario(snapshot, driver, {
                    signal: controller.signal,
                    onStep: (index, step) => {
                        live.value[index] = step
                    }
                })
                results.push(result)
                lastRun.value = result
                const where =
                    result.failedAt === undefined
                        ? ''
                        : ` no passo ${result.failedAt + 1}: ${result.steps[result.failedAt].message}`
                log.add(
                    null,
                    result.passed ? 'info' : 'warn',
                    'event',
                    `Cenário "${snapshot.name}"${times > 1 ? ` #${i + 1}` : ''}: ${result.passed ? 'passou' : `falhou${where}`} (${result.ms} ms)`
                )
                if (batch.value)
                    batch.value = { done: i + 1, total: times, passed: results.filter((r) => r.passed).length }
            }
        } finally {
            running.value = false
            controller = null
            if (results.length) report.value = buildReport(snapshot, results, (aid) => accounts.nameOf(aid ?? null))
        }
    }

    function stop(): void {
        controller?.abort()
    }

    return {
        scenarios,
        selectedId,
        selected,
        loaded,
        live,
        running,
        batch,
        lastRun,
        report,
        load,
        persist,
        create,
        duplicate,
        remove,
        run,
        stop,
        resetResults
    }
})
