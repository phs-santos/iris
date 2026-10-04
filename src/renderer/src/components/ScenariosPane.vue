<script setup lang="ts">
import { DEFAULT_MONITOR, isWebhookUrl, MAX_MONITOR_MINUTES, type MonitorSettings } from '@shared/monitor'
import { useMonitorStore } from '@renderer/stores/monitor'
import { t } from '@renderer/i18n'
import { computed, ref, watch } from 'vue'
import type { Scenario, ScenarioStep, ScenarioStepType } from '@shared/types'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useScenariosStore } from '@renderer/stores/scenarios'
import {
    CALL_STATES,
    CHECKS,
    STEP_TYPES,
    lastCallAlias,
    newScenario,
    newStep,
    validateScenario
} from '@renderer/lib/scenarios'
import { reportToText, type StepResult } from '@renderer/scenarios/runner'

const accounts = useAccountsStore()
const calls = useCallsStore()
const store = useScenariosStore()

const repeat = ref(20)
const addType = ref<ScenarioStepType>('dial')
const saved = ref('')

const scenario = computed(() => store.selected)
const errors = computed(() => (scenario.value ? validateScenario(scenario.value) : []))
const ready = computed(() => Boolean(scenario.value?.accountId) && errors.value.every((e) => !e))

/** Apelidos de chamada criados antes de cada passo, para as listas de escolha. */
function aliasesBefore(index: number): string[] {
    const list: string[] = []
    for (const step of scenario.value?.steps.slice(0, index) ?? []) {
        if ((step.type === 'dial' || step.type === 'answer') && step.call.trim() && !list.includes(step.call))
            list.push(step.call)
    }
    return list
}

// Salva sozinho, um pouco depois da última edição.
let timer: ReturnType<typeof setTimeout> | undefined
watch(
    () => JSON.stringify(scenario.value),
    (now, before) => {
        if (!before || !now || store.running) return
        const id = scenario.value?.id
        if (before && JSON.parse(before)?.id !== id) return
        clearTimeout(timer)
        timer = setTimeout(async () => {
            await store.persist()
            saved.value = 'salvo'
            setTimeout(() => (saved.value = ''), 1500)
        }, 400)
    }
)
watch(
    () => store.selectedId,
    () => store.resetResults()
)

function addStep(): void {
    const s = scenario.value
    if (!s) return
    s.steps.push(newStep(addType.value, lastCallAlias(s.steps)))
}

function move(index: number, delta: number): void {
    const steps = scenario.value?.steps
    if (!steps) return
    const target = index + delta
    if (target < 0 || target >= steps.length) return
    const [step] = steps.splice(index, 1)
    steps.splice(target, 0, step)
    store.resetResults()
}

function removeStep(index: number): void {
    scenario.value?.steps.splice(index, 1)
    store.resetResults()
}

function changeType(index: number, type: ScenarioStepType): void {
    const steps = scenario.value?.steps
    if (!steps) return
    steps[index] = newStep(type, lastCallAlias(steps, index))
}

/** Exemplo pronto: URA do PBX simulado ou do Asterisk de teste. */
async function createIvrExample(): Promise<void> {
    const created = await store.create()
    const s: Scenario = newScenario(created.accountId, {
        id: created.id,
        name: t('scenariosPane.ura_8000_atende_e_recebe'),
        steps: [
            { type: 'register' },
            { type: 'dial', to: '8000', call: 'c1' },
            { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 10_000 },
            { type: 'wait', ms: 2000 },
            { type: 'dtmf', call: 'c1', digits: '1234' },
            { type: 'hangup', call: 'c1' }
        ]
    })
    Object.assign(created, s)
    await store.persist()
}

async function remove(): Promise<void> {
    const s = scenario.value
    if (!s || !confirm(t('scenariosPane.excluir_o_cenario', { name: s.name }))) return
    await store.remove(s.id)
}

const statusMark = (r?: StepResult): { text: string; cls: string } => {
    switch (r?.status) {
        case 'running':
            return { text: '…', cls: 'run' }
        case 'passed':
            return { text: `✓ ${r.ms} ms`, cls: 'ok' }
        case 'failed':
            return { text: `✗ ${r.ms} ms`, cls: 'bad' }
        case 'skipped':
            return { text: '–', cls: 'skip' }
        default:
            return { text: '', cls: '' }
    }
}

const summary = computed(() => {
    const run = store.lastRun
    if (!run || store.batch || run.scenarioId !== store.selected?.id) return null
    return run.passed
        ? t('scenariosPane.passou_em_ms', { ms: run.ms })
        : t('scenariosPane.falhou_no_passo_ms', { p: (run.failedAt ?? 0) + 1, ms: run.ms })
})

async function exportReport(format: 'txt' | 'json'): Promise<void> {
    const report = store.report
    if (!report) return
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const content = format === 'txt' ? reportToText(report) : JSON.stringify(report, null, 2)
    const path = await window.iris.files.saveText(`iris-cenario-${stamp}.${format}`, content)
    if (path) saved.value = t('scenariosPane.relatorio_salvo_em', { path })
}

const accountOptions = computed(() =>
    accounts.accounts.map((a) => ({ id: a.id, label: `${a.name} · ${a.extension}@${a.domain}` }))
)
const field = (step: ScenarioStep) => step as Record<string, any>
/** Passos que podem usar outra conta além da de origem. */
/** Resultado ao vivo do passo, só quando a execução é do cenário aberto. */
const liveAt = (i: number): StepResult | undefined => (store.liveId === store.selected?.id ? store.live[i] : undefined)

// ─── Monitor (RF-43) ───
const monitor = useMonitorStore()
const webhookError = ref(false)
const monitorOf = (s: Scenario): MonitorSettings => s.monitor ?? DEFAULT_MONITOR

function toggleMonitor(s: Scenario): void {
    s.monitor = { ...monitorOf(s), enabled: !monitorOf(s).enabled }
}

function setMonitorMinutes(s: Scenario, text: string): void {
    const minutes = Math.round(Number(text))
    if (minutes >= 1 && minutes <= MAX_MONITOR_MINUTES) s.monitor = { ...monitorOf(s), everyMinutes: minutes }
}

function setMonitorWebhook(s: Scenario, text: string): void {
    const url = text.trim()
    webhookError.value = Boolean(url) && !isWebhookUrl(url)
    if (!webhookError.value) s.monitor = { ...monitorOf(s), webhook: url || undefined }
}

/** "passou às 14:02 · próxima às 14:07", para saber que o monitor está vivo. */
const monitorText = computed(() => {
    const s = store.selected
    const state = s ? monitor.states[s.id] : undefined
    if (!s?.monitor?.enabled || !state) return ''
    const hour = (ts: number): string =>
        new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    const next = t('scenariosPane.monitor_proxima', { hora: hour(state.nextAt) })
    if (state.lastAt === undefined) return next
    const last = state.passed
        ? t('scenariosPane.monitor_passou', { hora: hour(state.lastAt) })
        : t('scenariosPane.monitor_falhou', { hora: hour(state.lastAt) })
    return `${last} · ${next}`
})

/** Diálogo do sistema para escolher o WAV de um passo "Tocar arquivo" (RF-41). */
async function pickWav(step: ScenarioStep): Promise<void> {
    const path = await window.iris.audio.pickWav()
    if (path && step.type === 'playFile') step.path = path
}

const hasAccount = (type: ScenarioStepType): boolean => type === 'register' || type === 'dial' || type === 'answer'
</script>

<template>
    <div class="scenarios">
        <div class="bar">
            <select
                v-if="store.scenarios.length"
                v-model="store.selectedId"
                class="input pick"
                :aria-label="$t('scenariosPane.cenario')"
                :disabled="store.running"
            >
                <option v-for="s in store.scenarios" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <span v-else class="muted">{{ $t('scenariosPane.nenhum_cenario_ainda') }}</span>
            <button class="btn small" :disabled="store.running" @click="store.create()">
                {{ $t('scenariosPane.novo') }}
            </button>
            <button class="btn small" :disabled="store.running" @click="createIvrExample">
                {{ $t('scenariosPane.exemplo_de_ura') }}
            </button>
            <template v-if="scenario">
                <button class="btn small" :disabled="store.running" @click="store.duplicate(scenario.id)">
                    {{ $t('scenariosPane.duplicar') }}
                </button>
                <button class="btn small" :disabled="store.running" @click="remove">
                    {{ $t('scenariosPane.excluir') }}
                </button>
            </template>
            <span class="note">{{ saved }}</span>
        </div>

        <p v-if="!scenario" class="empty">
            {{ $t('scenariosPane.um_cenario_e_um_roteiro') }}
        </p>

        <template v-else>
            <fieldset class="head" :disabled="store.running">
                <label>
                    <span class="label">{{ $t('scenariosPane.nome') }}</span>
                    <input v-model="scenario.name" class="input" :aria-label="$t('scenariosPane.nome_do_cenario')" />
                </label>
                <label>
                    <span class="label">{{ $t('scenariosPane.conta_de_origem') }}</span>
                    <select
                        v-model="scenario.accountId"
                        class="input"
                        :aria-label="$t('scenariosPane.conta_de_origem')"
                    >
                        <option value="" disabled>{{ $t('scenariosPane.escolha_a_conta') }}</option>
                        <option v-for="a in accountOptions" :key="a.id" :value="a.id">{{ a.label }}</option>
                    </select>
                </label>
            </fieldset>
            <fieldset class="monitor" :disabled="store.running">
                <label class="check">
                    <input type="checkbox" :checked="monitorOf(scenario).enabled" @change="toggleMonitor(scenario)" />
                    {{ $t('scenariosPane.monitorar_a_cada') }}
                </label>
                <input
                    class="input mono tiny"
                    type="number"
                    min="1"
                    :max="MAX_MONITOR_MINUTES"
                    step="1"
                    :value="monitorOf(scenario).everyMinutes"
                    :aria-label="$t('scenariosPane.minutos_do_monitor')"
                    @change="setMonitorMinutes(scenario, ($event.target as HTMLInputElement).value)"
                />
                <span class="muted">{{ $t('scenariosPane.min') }}</span>
                <input
                    class="input mono webhook"
                    :class="{ invalid: webhookError }"
                    :value="monitorOf(scenario).webhook ?? ''"
                    :placeholder="$t('scenariosPane.webhook_opcional')"
                    :aria-label="$t('scenariosPane.webhook_do_monitor')"
                    @change="setMonitorWebhook(scenario, ($event.target as HTMLInputElement).value)"
                />
                <span v-if="webhookError" class="bad">{{ $t('scenariosPane.webhook_invalido') }}</span>
                <span v-else-if="monitorText" class="muted" role="status">{{ monitorText }}</span>
            </fieldset>

            <ol class="steps">
                <li v-for="(step, i) in scenario.steps" :key="i" class="step" :class="statusMark(liveAt(i)).cls">
                    <fieldset class="row" :disabled="store.running">
                        <span class="num tabular">{{ i + 1 }}</span>
                        <div class="params">
                            <select
                                class="input type"
                                :value="step.type"
                                :aria-label="$t('scenariosPane.tipo_do_passo', { p: i + 1 })"
                                @change="changeType(i, ($event.target as HTMLSelectElement).value as ScenarioStepType)"
                            >
                                <option v-for="t in STEP_TYPES" :key="t.type" :value="t.type">{{ t.label }}</option>
                            </select>

                            <template v-if="hasAccount(step.type)">
                                <select
                                    v-model="field(step).account"
                                    class="input acct"
                                    :aria-label="$t('scenariosPane.conta_do_passo', { p: i + 1 })"
                                >
                                    <option :value="undefined">{{ $t('scenariosPane.conta_de_origem_2') }}</option>
                                    <option v-for="a in accountOptions" :key="a.id" :value="a.id">{{ a.label }}</option>
                                </select>
                            </template>

                            <template v-if="step.type === 'dial' || step.type === 'transfer'">
                                <input
                                    v-model="step.to"
                                    class="input mono short"
                                    :placeholder="$t('scenariosPane.numero')"
                                    :aria-label="$t('scenariosPane.numero_do_passo', { p: i + 1 })"
                                />
                            </template>
                            <template v-if="step.type === 'dial' || step.type === 'answer'">
                                <span class="muted">{{ $t('scenariosPane.como') }}</span>
                                <input
                                    v-model="step.call"
                                    class="input mono tiny"
                                    :aria-label="$t('scenariosPane.apelido_da_chamada_do_passo', { p: i + 1 })"
                                />
                            </template>

                            <template
                                v-if="
                                    [
                                        'waitState',
                                        'dtmf',
                                        'transfer',
                                        'hangup',
                                        'playTone',
                                        'playFile',
                                        'waitAudio',
                                        'waitSilence'
                                    ].includes(step.type) ||
                                    (step.type === 'verify' && step.check !== 'log')
                                "
                            >
                                <select
                                    v-model="field(step).call"
                                    class="input tiny"
                                    :aria-label="$t('scenariosPane.chamada_do_passo', { p: i + 1 })"
                                >
                                    <option v-for="a in aliasesBefore(i)" :key="a" :value="a">{{ a }}</option>
                                    <option
                                        v-if="!aliasesBefore(i).includes(field(step).call)"
                                        :value="field(step).call"
                                    >
                                        {{ field(step).call || '?' }}
                                    </option>
                                </select>
                            </template>

                            <template v-if="step.type === 'waitState'">
                                <select
                                    v-model="step.state"
                                    class="input"
                                    :aria-label="$t('scenariosPane.estado_esperado_do_passo', { p: i + 1 })"
                                >
                                    <option v-for="s in CALL_STATES" :key="s.state" :value="s.state">
                                        {{ s.label }}
                                    </option>
                                </select>
                            </template>
                            <template v-if="step.type === 'dtmf'">
                                <input
                                    v-model="step.digits"
                                    class="input mono short"
                                    :placeholder="$t('scenariosPane.t_1_w2_4321')"
                                    :aria-label="$t('scenariosPane.digitos_do_passo', { p: i + 1 })"
                                />
                            </template>
                            <template v-if="step.type === 'verify'">
                                <select
                                    v-model="step.check"
                                    class="input"
                                    :aria-label="$t('scenariosPane.verificacao_do_passo', { p: i + 1 })"
                                >
                                    <option v-for="c in CHECKS" :key="c.check" :value="c.check">{{ c.label }}</option>
                                </select>
                                <input
                                    v-model="step.expected"
                                    class="input mono short"
                                    :placeholder="CHECKS.find((c) => c.check === step.check)?.hint"
                                    :aria-label="$t('scenariosPane.valor_esperado_do_passo', { p: i + 1 })"
                                />
                            </template>
                            <template v-if="step.type === 'playTone'">
                                <input
                                    v-model.number="step.hz"
                                    class="input mono tiny"
                                    type="number"
                                    min="100"
                                    max="3400"
                                    step="10"
                                    :aria-label="$t('scenariosPane.frequencia_do_passo', { p: i + 1 })"
                                />
                                <span class="muted">{{ $t('scenariosPane.hz_por') }}</span>
                                <input
                                    class="input mono tiny"
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    :value="step.ms / 1000"
                                    :aria-label="$t('scenariosPane.segundos_do_passo', { p: i + 1 })"
                                    @input="
                                        step.ms = Math.round(Number(($event.target as HTMLInputElement).value) * 1000)
                                    "
                                />
                                <span class="muted">{{ $t('scenariosPane.s') }}</span>
                            </template>
                            <template v-if="step.type === 'playFile'">
                                <input
                                    v-model="step.path"
                                    class="input mono short"
                                    :placeholder="$t('scenariosPane.caminho_do_wav')"
                                    :aria-label="$t('scenariosPane.arquivo_do_passo', { p: i + 1 })"
                                />
                                <button type="button" class="btn small" @click="pickWav(step)">
                                    {{ $t('scenariosPane.escolher') }}
                                </button>
                            </template>
                            <template v-if="step.type === 'wait'">
                                <input
                                    class="input mono tiny"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    :value="step.ms / 1000"
                                    :aria-label="$t('scenariosPane.segundos_do_passo', { p: i + 1 })"
                                    @input="
                                        step.ms = Math.round(Number(($event.target as HTMLInputElement).value) * 1000)
                                    "
                                />
                                <span class="muted">{{ $t('scenariosPane.s') }}</span>
                            </template>
                            <template
                                v-if="
                                    step.type === 'waitState' ||
                                    step.type === 'answer' ||
                                    step.type === 'waitAudio' ||
                                    step.type === 'waitSilence'
                                "
                            >
                                <span class="muted">{{ $t('scenariosPane.ate') }}</span>
                                <input
                                    class="input mono tiny"
                                    type="number"
                                    min="1"
                                    :value="step.timeoutMs / 1000"
                                    :aria-label="$t('scenariosPane.tempo_limite_do_passo', { p: i + 1 })"
                                    @input="
                                        step.timeoutMs = Math.round(
                                            Number(($event.target as HTMLInputElement).value) * 1000
                                        )
                                    "
                                />
                                <span class="muted">{{ $t('scenariosPane.s') }}</span>
                            </template>
                        </div>
                        <div class="side">
                            <span class="mark mono tabular" :data-testid="`resultado-${i + 1}`">
                                {{ statusMark(liveAt(i)).text }}
                            </span>
                            <button
                                class="btn small ghost"
                                :aria-label="$t('scenariosPane.subir')"
                                :disabled="i === 0"
                                @click="move(i, -1)"
                            >
                                ↑
                            </button>
                            <button
                                class="btn small ghost"
                                :aria-label="$t('scenariosPane.descer')"
                                :disabled="i === scenario.steps.length - 1"
                                @click="move(i, 1)"
                            >
                                ↓
                            </button>
                            <button
                                class="btn small ghost"
                                :aria-label="$t('scenariosPane.remover_passo')"
                                @click="removeStep(i)"
                            >
                                ✕
                            </button>
                        </div>
                    </fieldset>
                    <p v-if="liveAt(i)?.message" class="msg" :class="statusMark(liveAt(i)).cls">
                        {{ liveAt(i)?.message }}
                    </p>
                    <p v-else-if="errors[i]" class="msg warn">{{ errors[i] }}</p>
                </li>
            </ol>

            <fieldset class="add" :disabled="store.running">
                <select v-model="addType" class="input" :aria-label="$t('scenariosPane.tipo_do_novo_passo')">
                    <option v-for="t in STEP_TYPES" :key="t.type" :value="t.type">{{ t.label }}</option>
                </select>
                <button class="btn small" @click="addStep">{{ $t('scenariosPane.passo') }}</button>
            </fieldset>

            <div class="run">
                <template v-if="!store.running">
                    <button class="btn primary" :disabled="!ready" @click="store.run(scenario.id)">
                        {{ $t('scenariosPane.executar') }}
                    </button>
                    <span class="muted">{{ $t('scenariosPane.ou') }}</span>
                    <input
                        v-model.number="repeat"
                        class="input mono tiny"
                        type="number"
                        min="2"
                        max="500"
                        :aria-label="$t('scenariosPane.quantidade_de_execucoes')"
                    />
                    <button class="btn" :disabled="!ready || repeat < 2" @click="store.run(scenario.id, repeat)">
                        {{ $t('scenariosPane.repetir', { repeat }) }}
                    </button>
                </template>
                <button v-else class="btn stop" @click="store.stop()">{{ $t('scenariosPane.parar') }}</button>
                <span v-if="store.batch" class="mono tabular progress">
                    {{
                        $t('scenariosPane.passaram', {
                            done: store.batch.done,
                            total: store.batch.total,
                            passed: store.batch.passed
                        })
                    }}
                </span>
                <span v-else-if="summary" class="mono" :class="store.lastRun?.passed ? 'ok' : 'bad'">{{
                    summary
                }}</span>
                <span class="spacer"></span>
                <span class="muted tabular">{{
                    $t('scenariosPane.chamadas_ativas', { length: calls.active.length })
                }}</span>
            </div>
            <p v-if="!ready && !store.running" class="hint">
                {{
                    !scenario.accountId
                        ? $t('scenariosPane.escolha_a_conta_de_origem')
                        : $t('scenariosPane.corrija_os_passos_marcados_para')
                }}
            </p>

            <section
                v-if="store.report && store.report.runs > 1"
                class="report"
                :aria-label="$t('scenariosPane.relatorio')"
            >
                <div class="figures">
                    <span
                        ><b class="tabular">{{ store.report.successRate }}%</b>
                        {{ $t('scenariosPane.de_sucesso') }}</span
                    >
                    <span class="tabular">{{
                        $t('scenariosPane.passaram_2', { passed: store.report.passed, runs: store.report.runs })
                    }}</span>
                    <span class="tabular">{{
                        $t('scenariosPane.media_ms_p95_ms', { avgMs: store.report.avgMs, p95Ms: store.report.p95Ms })
                    }}</span>
                </div>
                <ul v-if="store.report.failures.length" class="failures">
                    <li v-for="f in store.report.failures" :key="f.step">
                        {{
                            $t('scenariosPane.passo_2', {
                                step: f.step,
                                description: f.description,
                                count: f.count,
                                lastMessage: f.lastMessage
                            })
                        }}
                    </li>
                </ul>
                <div class="exports">
                    <button class="btn small" @click="exportReport('txt')">
                        {{ $t('scenariosPane.relatorio_txt') }}
                    </button>
                    <button class="btn small" @click="exportReport('json')">
                        {{ $t('scenariosPane.relatorio_json') }}
                    </button>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
.scenarios {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.bar,
.run,
.add,
.figures,
.exports {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
}
.pick {
    min-width: 200px;
    flex: 1;
}
.head {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.head label {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.step {
    border: 1px solid var(--line);
    border-left-width: 3px;
    border-radius: 6px;
    padding: 6px 8px;
    background: var(--panel);
}
.step.ok {
    border-left-color: var(--ok);
}
.step.bad {
    border-left-color: var(--bad);
}
.step.run {
    border-left-color: var(--accent);
}
.step.skip {
    opacity: 0.6;
}
.row {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    align-items: start;
    gap: 6px;
}
.params {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
}
.params .input {
    width: auto;
}
.side {
    display: flex;
    align-items: center;
    gap: 2px;
}
.num {
    padding-top: 6px;
}
.acct {
    max-width: 190px;
}
.num {
    width: 18px;
    color: var(--faint);
    text-align: right;
}
.params .type {
    width: 150px;
}
.add .input {
    width: 180px;
}
.params .short {
    width: 110px;
}
.params .tiny,
.run .tiny {
    width: 64px;
}
.spacer {
    flex: 1;
}
.mark {
    min-width: 70px;
    text-align: right;
    font-size: 12px;
}
.ok {
    color: var(--ok);
}
.bad {
    color: var(--bad);
}
.run .progress,
.muted,
.note,
.hint {
    color: var(--muted);
    font-size: 12px;
}
.msg {
    margin: 4px 0 0 24px;
    font-size: 12px;
    color: var(--muted);
}
.msg.bad {
    color: var(--bad);
}
.msg.warn {
    color: var(--warn);
}
.empty {
    color: var(--muted);
    line-height: 1.6;
}
.report {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--panel-2);
}
.failures {
    margin: 0;
    padding-left: 18px;
    color: var(--bad);
    font-size: 12px;
}
.monitor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    border: 0;
    margin: 0;
    padding: 0 14px 8px;
}
.monitor .webhook {
    flex: 1;
    min-width: 180px;
}
.monitor .bad {
    color: var(--bad);
}
</style>
