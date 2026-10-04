// Execução de cenários pela linha de comando (RF-31). Roda na janela invisível, com as mesmas stores
// e motores da interface, e escreve o resultado no terminal pelo processo principal.

import { createPinia, setActivePinia } from 'pinia'
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE, extractScenarioList, type CliConfig } from '@shared/cli'
import type { Account, Scenario } from '@shared/types'
import { describeStep, normalizeScenarios, validateScenario } from './lib/scenarios'
import { describeStatus } from './lib/accounts'
import {
    buildReport,
    REGISTER_TIMEOUT_MS,
    reportsToJUnit,
    reportToText,
    runScenario,
    type RunResult
} from './scenarios/runner'
import { storeDriver } from './scenarios/store-driver'
import { useAccountsStore } from './stores/accounts'
import { useScenariosStore } from './stores/scenarios'

class UsageError extends Error {}

const print = (line = ''): void => window.iris.cli.print(line)

/** Acha a conta por id, nome ou ramal@domínio, para cenários levados de uma máquina para outra. */
export function resolveAccount(ref: string, accounts: Account[]): Account | undefined {
    const key = ref.trim().toLowerCase()
    return (
        accounts.find((a) => a.id === ref) ??
        accounts.find((a) => a.name.toLowerCase() === key) ??
        accounts.find((a) => `${a.extension}@${a.domain}`.toLowerCase() === key)
    )
}

/** Escolhe os cenários pedidos por nome ou id, na ordem da linha de comando. */
export function pickScenarios(all: Scenario[], names: string[], everything: boolean): Scenario[] {
    if (everything) return all
    return names.map((name) => {
        const key = name.trim().toLowerCase()
        const found = all.find((s) => s.id === name) ?? all.find((s) => s.name.trim().toLowerCase() === key)
        if (!found) {
            const known = all.map((s) => `"${s.name}"`).join(', ') || 'nenhum'
            throw new UsageError(`cenário "${name}" não encontrado. Disponíveis: ${known}`)
        }
        return found
    })
}

const mark = { passed: '✓', failed: '✗', skipped: '–', pending: ' ', running: '…' } as const

export async function runCli(config: CliConfig): Promise<number> {
    setActivePinia(createPinia())
    const accounts = useAccountsStore()
    const store = useScenariosStore()
    const info = await window.iris.appInfo()

    try {
        // Contas: do arquivo (pasta de dados temporária) ou as salvas no app.
        if (config.accountsText) {
            try {
                await accounts.importJson(config.accountsText)
            } catch (error) {
                throw new UsageError(`arquivo de contas inválido: ${(error as Error).message}`)
            }
        } else {
            await accounts.load()
        }

        // Cenários: do arquivo ou os salvos no app.
        if (config.scenariosText) {
            let data: unknown
            try {
                data = JSON.parse(config.scenariosText)
            } catch (error) {
                throw new UsageError(`arquivo de cenários não é JSON válido: ${(error as Error).message}`)
            }
            store.scenarios = normalizeScenarios(extractScenarioList(data))
        } else {
            await store.load()
        }
        const chosen = pickScenarios(store.scenarios, config.scenarios, config.all)
        if (chosen.length === 0) throw new UsageError('nenhum cenário para executar')

        // Liga as contas citadas nos cenários às contas desta máquina e confere os passos antes de começar.
        // Com --conta, cada cenário roda uma vez para cada conta de origem pedida (RF-48).
        const expanded = config.origins.length
            ? chosen.flatMap((scenario) =>
                  config.origins.map((origin) => ({
                      ...scenario,
                      accountId: origin,
                      name: config.origins.length > 1 ? `${scenario.name} · ${origin}` : scenario.name
                  }))
              )
            : chosen
        const prepared = expanded.map((original) => {
            const scenario: Scenario = JSON.parse(JSON.stringify(original))
            const map = (ref: string | undefined, where: string): string => {
                const account = resolveAccount(ref ?? '', accounts.accounts)
                if (!account)
                    throw new UsageError(`${where} do cenário "${scenario.name}" usa a conta "${ref}", que não existe`)
                return account.id
            }
            scenario.accountId = map(scenario.accountId, 'a conta de origem')
            scenario.steps.forEach((step, i) => {
                if ('account' in step && step.account) step.account = map(step.account, `o passo ${i + 1}`)
            })
            const errors = validateScenario(scenario)
            const bad = errors.findIndex(Boolean)
            if (bad >= 0) throw new UsageError(`passo ${bad + 1} do cenário "${scenario.name}": ${errors[bad]}`)
            return scenario
        })

        print(`Íris ${info.version} · ${prepared.length} cenário(s) · ${config.runs} execução(ões) cada`)

        // Registra antes as contas, como estariam na interface: todas as do arquivo --contas (inclusive
        // as que só recebem chamadas) ou, com as contas do app, as citadas nos cenários.
        const used = new Set<string | undefined>(
            config.accountsText
                ? accounts.accounts.map((a) => a.id)
                : prepared.flatMap((s) => [
                      s.accountId,
                      ...s.steps.map((st) => ('account' in st ? st.account : undefined))
                  ])
        )
        used.delete(undefined)
        for (const id of used) {
            if (accounts.statusOf(id!).state !== 'registered') void accounts.register(id!)
        }
        const deadline = Date.now() + REGISTER_TIMEOUT_MS
        while (
            Date.now() < deadline &&
            [...used].some((id) => ['connecting', 'connected', 'disconnected'].includes(accounts.statusOf(id!).state))
        )
            await new Promise((r) => setTimeout(r, 100))
        for (const id of used) print(`  conta ${accounts.nameOf(id!)}: ${describeStatus(accounts.statusOf(id!))}`)

        const driver = storeDriver()
        let anyFailed = false
        const reports = []
        for (const scenario of prepared) {
            const name = (id?: string): string => accounts.nameOf(id || scenario.accountId)
            const steps = scenario.steps.map((s) => describeStep(s, name))
            const runs: RunResult[] = []
            print()
            print(`Cenário "${scenario.name}"`)
            for (let i = 0; i < config.runs; i++) {
                if (i > 0) await new Promise((r) => setTimeout(r, 500))
                const result = await runScenario(scenario, driver)
                runs.push(result)
                if (config.runs > 1) print(`  execução ${i + 1}/${config.runs}`)
                result.steps.forEach((r, index) => {
                    const time = r.ms !== undefined ? ` · ${r.ms} ms` : ''
                    const detail = r.message ? ` · ${r.message}` : ''
                    print(`    ${mark[r.status]} ${index + 1}. ${steps[index]}${time}${detail}`)
                })
                print(
                    `  ${result.passed ? 'passou' : `FALHOU no passo ${(result.failedAt ?? 0) + 1}`} em ${result.ms} ms`
                )
            }
            const report = buildReport(scenario, runs, name)
            reports.push(report)
            if (report.failed > 0) anyFailed = true
            print(
                `  resumo: ${report.passed}/${report.runs} passaram (${report.successRate}%) · média ${report.avgMs} ms · p95 ${report.p95Ms} ms`
            )
        }

        if (config.report) {
            const file = config.report.toLowerCase()
            const content = file.endsWith('.json')
                ? JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2)
                : file.endsWith('.xml')
                  ? reportsToJUnit(reports)
                  : reports.map(reportToText).join('\n\n')
            const path = await window.iris.cli.writeReport(content)
            if (path) print(`\nRelatório salvo em ${path}`)
        }
        print(anyFailed ? '\nResultado: FALHOU' : '\nResultado: passou')
        return anyFailed ? EXIT_FAILED : EXIT_OK
    } catch (error) {
        if (error instanceof UsageError) {
            window.iris.cli.print(`iris: ${error.message}`, true)
            return EXIT_USAGE
        }
        throw error
    } finally {
        await Promise.all(accounts.accounts.map((a) => accounts.unregister(a.id).catch(() => undefined)))
    }
}
