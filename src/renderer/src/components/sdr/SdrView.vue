<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '@renderer/i18n'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useSdrStore } from '@renderer/stores/sdr'
import { useToastsStore } from '@renderer/stores/toasts'
import { formatDuration } from '@shared/history'
import type { OutcomeId } from '@shared/sdr'
import SdrSettings from './SdrSettings.vue'
import PhoneIcon from '../PhoneIcon.vue'

/**
 * Modo SDR: a fila do dia, a pessoa da vez com o roteiro, a abertura gravada, o resultado com um
 * clique (teclas 1 a 8) e o painel com a meta. Esc interrompe a abertura.
 */
const sdr = useSdrStore()
const accounts = useAccountsStore()
const calls = useCallsStore()
const toasts = useToastsStore()
const showSettings = ref(false)
const note = ref('')
const callbackAt = ref('')
const choosingCallback = ref(false)
const listFilter = ref<'pending' | 'done'>('pending')

const call = computed(() => calls.calls.find((c) => c.id === sdr.current?.callId))
const account = computed(() => accounts.byId(sdr.current?.accountId ?? sdr.settings.accountId ?? accounts.selectedId))
const stats = computed(() => sdr.stats)
const goal = computed(() => sdr.settings.dailyGoal)
const progress = computed(() => (goal.value ? Math.min(100, Math.round((stats.value.dialed / goal.value) * 100)) : 0))
const list = computed(() => sdr.data.leads.filter((l) => l.status === listFilter.value).slice(0, 200))
const outcomeName = (id: OutcomeId): string => t(`sdr.resultado_${id}`)
const phaseText = computed(() => (sdr.current ? t(`sdr.fase_${sdr.current.phase}`) : ''))
const talk = computed(() => {
    const c = sdr.current
    if (!c?.answeredAt) return ''
    return formatDuration((c.endedAt ?? now.value) - c.answeredAt) || '0:00'
})
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined

async function importCsv(): Promise<void> {
    const text = await window.iris.files.openText('csv')
    if (!text) return
    try {
        const r = sdr.importCsv(text)
        toasts.show(t('sdr.importados', { added: r.added, repeated: r.repeated, skipped: r.skipped }))
    } catch (error) {
        toasts.show((error as Error).message, 'bad')
    }
}

async function exportCsv(): Promise<void> {
    const path = await sdr.exportCsv()
    if (path) toasts.show(t('sdr.exportado', { path }))
}

function choose(id: OutcomeId): void {
    if (!sdr.current || sdr.current.phase !== 'wrapup') return
    if (id === 'ligar_depois' && !choosingCallback.value) {
        choosingCallback.value = true
        const later = new Date(Date.now() + 3_600_000)
        callbackAt.value = toLocalInput(later)
        return
    }
    const at = id === 'ligar_depois' ? new Date(callbackAt.value).getTime() : undefined
    sdr.finish(id, { note: note.value, callbackAt: at && Number.isFinite(at) ? at : undefined })
}

const toLocalInput = (date: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function tomorrowNine(): void {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0)
    callbackAt.value = toLocalInput(date)
}

// Teclas: 1 a 8 dão o resultado; Esc interrompe a abertura. Não valem enquanto se digita a nota.
function onKey(event: KeyboardEvent): void {
    const typing = (event.target as HTMLElement | null)?.closest('input, textarea, select')
    if (event.key === 'Escape' && sdr.current?.phase === 'opening') {
        void sdr.interrupt()
        return event.preventDefault()
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return
    const index = Number(event.key) - 1
    const outcome = sdr.outcomes[index]
    if (outcome && sdr.current?.phase === 'wrapup') {
        choose(outcome.id)
        event.preventDefault()
    }
}

watch(
    () => sdr.current?.leadId,
    () => {
        note.value = ''
        choosingCallback.value = false
    }
)

onMounted(() => {
    window.addEventListener('keydown', onKey)
    tick = setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    clearInterval(tick)
})
</script>

<template>
    <div class="sdr">
        <div class="bar">
            <button v-if="!sdr.running" class="btn go" :disabled="!sdr.pending.length" @click="sdr.start()">
                <PhoneIcon name="phone" />{{ $t('sdr.comecar') }}
            </button>
            <button v-else class="btn" @click="sdr.pause()">{{ $t('sdr.pausar') }}</button>
            <span class="who mono">{{ account ? `${account.name} · ${account.extension}` : $t('sdr.sem_conta') }}</span>
            <span class="spacer"></span>
            <button class="btn small" @click="importCsv">{{ $t('sdr.importar') }}</button>
            <button class="btn small" :disabled="!sdr.data.leads.length" @click="exportCsv">
                {{ $t('sdr.exportar') }}
            </button>
            <button class="btn small" @click="showSettings = true">
                <PhoneIcon name="gear" />{{ $t('sdr.opcoes') }}
            </button>
        </div>

        <section class="stats" :aria-label="$t('sdr.painel')">
            <div class="goal">
                <span class="tabular">{{ $t('sdr.discadas_meta', { n: stats.dialed, meta: goal }) }}</span>
                <span
                    class="progress"
                    role="progressbar"
                    :aria-label="$t('sdr.meta_do_dia')"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-valuenow="progress"
                    ><span :style="{ width: `${progress}%` }"></span
                ></span>
            </div>
            <dl>
                <div>
                    <dt>{{ $t('sdr.atendidas') }}</dt>
                    <dd class="tabular">{{ stats.answered }}</dd>
                </div>
                <div>
                    <dt>{{ $t('sdr.conversas') }}</dt>
                    <dd class="tabular">{{ stats.conversations }}</dd>
                </div>
                <div>
                    <dt>{{ $t('sdr.conversoes') }}</dt>
                    <dd class="tabular">{{ stats.successes }}</dd>
                </div>
                <div>
                    <dt>{{ $t('sdr.caixas_postais') }}</dt>
                    <dd class="tabular">{{ stats.voicemails }}</dd>
                </div>
                <div>
                    <dt>{{ $t('sdr.tempo_falando') }}</dt>
                    <dd class="tabular">{{ formatDuration(stats.talkMs) || '0:00' }}</dd>
                </div>
            </dl>
        </section>

        <div class="split">
            <section class="now" :aria-label="$t('sdr.chamada_atual')">
                <template v-if="sdr.current && sdr.lead">
                    <header class="lead">
                        <span class="name">
                            <b>{{ sdr.lead.name || sdr.lead.number }}</b>
                            <small class="mono">
                                {{ sdr.lead.number
                                }}<template v-if="sdr.lead.company"> · {{ sdr.lead.company }}</template> ·
                                {{ $t('sdr.tentativa', { n: sdr.lead.attempts }) }}
                            </small>
                        </span>
                        <span class="pill" role="status">{{ phaseText }}</span>
                        <span v-if="talk" class="mono tabular">{{ talk }}</span>
                    </header>
                    <p v-if="sdr.lead.note" class="prev">{{ $t('sdr.nota_anterior', { note: sdr.lead.note }) }}</p>
                    <dl v-if="Object.keys(sdr.lead.fields).length" class="fields">
                        <div v-for="(value, key) in sdr.lead.fields" :key="key">
                            <dt>{{ key }}</dt>
                            <dd>{{ value }}</dd>
                        </div>
                    </dl>
                    <div class="script" :aria-label="$t('sdr.roteiro')">{{ sdr.script }}</div>
                    <div class="actions">
                        <button v-if="sdr.current.phase === 'opening'" class="btn primary" @click="sdr.interrupt()">
                            {{ $t('sdr.interromper') }}
                        </button>
                        <button
                            v-if="call && call.state !== 'ended' && sdr.current.phase !== 'wrapup'"
                            class="btn stop"
                            @click="sdr.hangup()"
                        >
                            <PhoneIcon name="hangup" />{{ $t('sdr.desligar') }}
                        </button>
                        <button
                            v-if="call && call.state === 'established'"
                            class="btn"
                            :class="{ on: call.muted }"
                            @click="calls.toggleMute(call.id)"
                        >
                            <PhoneIcon name="mic" />{{ call.muted ? $t('sdr.ativar_mic') : $t('sdr.mudo') }}
                        </button>
                    </div>

                    <div v-if="sdr.current.phase === 'wrapup'" class="wrapup">
                        <h3>{{ $t('sdr.como_foi') }}</h3>
                        <div class="outcomes">
                            <button
                                v-for="(o, i) in sdr.outcomes"
                                :key="o.id"
                                class="btn"
                                :class="{ primary: sdr.current.suggested === o.id, go: o.success }"
                                :aria-keyshortcuts="String(i + 1)"
                                @click="choose(o.id)"
                            >
                                <kbd>{{ i + 1 }}</kbd
                                >{{ outcomeName(o.id) }}
                            </button>
                        </div>
                        <div v-if="choosingCallback" class="callback">
                            <label class="field">
                                <span class="label">{{ $t('sdr.ligar_em') }}</span>
                                <input v-model="callbackAt" type="datetime-local" class="input" />
                            </label>
                            <button class="btn small" @click="tomorrowNine">{{ $t('sdr.amanha_9h') }}</button>
                            <button class="btn small primary" @click="choose('ligar_depois')">
                                {{ $t('sdr.marcar') }}
                            </button>
                        </div>
                        <label class="field">
                            <span class="label">{{ $t('sdr.nota') }}</span>
                            <textarea v-model="note" class="input" rows="2"></textarea>
                        </label>
                        <div v-if="sdr.current.recording" class="summary">
                            <button class="btn small" :disabled="sdr.current.summarizing" @click="sdr.summarize()">
                                {{ sdr.current.summarizing ? $t('sdr.resumindo') : $t('sdr.resumir') }}
                            </button>
                            <p v-if="sdr.current.summary" class="text">{{ sdr.current.summary }}</p>
                            <p v-if="sdr.current.summaryError" class="error" role="alert">
                                {{ sdr.current.summaryError }}
                            </p>
                        </div>
                    </div>
                </template>
                <div v-else class="idle">
                    <p v-if="sdr.countdown !== null" class="countdown" role="status">
                        {{ $t('sdr.proxima_em', { s: sdr.countdown }) }}
                        <button class="btn small" @click="sdr.next()">{{ $t('sdr.ligar_agora') }}</button>
                        <button class="btn small" @click="sdr.pause()">{{ $t('sdr.pausar') }}</button>
                    </p>
                    <p v-else-if="sdr.notice" class="notice" role="status">{{ sdr.notice }}</p>
                    <p v-else-if="!sdr.data.leads.length" class="empty">{{ $t('sdr.vazia') }}</p>
                    <p v-else-if="!sdr.running" class="empty">{{ $t('sdr.pronta', { n: sdr.pending.length }) }}</p>
                    <button v-if="sdr.running && sdr.countdown === null && !sdr.notice" class="btn" @click="sdr.next()">
                        {{ $t('sdr.proxima') }}
                    </button>
                </div>
            </section>

            <section class="queue" :aria-label="$t('sdr.fila')">
                <div class="tabs" role="tablist">
                    <button
                        role="tab"
                        class="ctab"
                        :aria-selected="listFilter === 'pending'"
                        :class="{ on: listFilter === 'pending' }"
                        @click="listFilter = 'pending'"
                    >
                        {{ $t('sdr.na_fila', { n: sdr.pending.length }) }}
                    </button>
                    <button
                        role="tab"
                        class="ctab"
                        :aria-selected="listFilter === 'done'"
                        :class="{ on: listFilter === 'done' }"
                        @click="listFilter = 'done'"
                    >
                        {{ $t('sdr.concluidas', { n: sdr.data.leads.length - sdr.pending.length }) }}
                    </button>
                    <span class="spacer"></span>
                    <button
                        v-if="listFilter === 'done' && sdr.data.leads.length > sdr.pending.length"
                        class="btn small ghost"
                        @click="sdr.clearLeads(true)"
                    >
                        {{ $t('sdr.limpar_concluidas') }}
                    </button>
                </div>
                <ul class="list">
                    <li v-for="l in list" :key="l.id" :class="{ current: l.id === sdr.current?.leadId }">
                        <span class="who">
                            <b>{{ l.name || l.number }}</b>
                            <small class="mono">
                                {{ l.number }}<template v-if="l.outcome"> · {{ outcomeName(l.outcome) }}</template>
                                <template v-if="l.status === 'pending' && l.nextAt">
                                    ·
                                    {{
                                        $t('sdr.volta_as', {
                                            hora: new Date(l.nextAt).toLocaleString(undefined, {
                                                dateStyle: 'short',
                                                timeStyle: 'short'
                                            })
                                        })
                                    }}
                                </template>
                            </small>
                        </span>
                        <button
                            v-if="l.status === 'pending' && !sdr.current"
                            class="btn small"
                            :aria-label="$t('sdr.ligar_para', { name: l.name || l.number })"
                            @click="sdr.next(l.id)"
                        >
                            {{ $t('sdr.ligar') }}
                        </button>
                        <button
                            v-if="l.id !== sdr.current?.leadId"
                            class="btn small ghost"
                            :aria-label="$t('sdr.tirar_da_fila', { name: l.name || l.number })"
                            @click="sdr.removeLead(l.id)"
                        >
                            ✕
                        </button>
                    </li>
                </ul>
            </section>
        </div>
        <SdrSettings v-if="showSettings" @close="showSettings = false" />
    </div>
</template>

<style scoped>
.sdr {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    flex-wrap: wrap;
}
.bar .btn :deep(svg) {
    width: 16px;
    height: 16px;
    margin-right: 6px;
    vertical-align: -3px;
}
.who {
    color: var(--muted);
    font-size: 12px;
}
.spacer {
    flex: 1;
}
.stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 22px;
    padding: 10px 14px;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
}
.goal {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 180px;
}
.progress {
    height: 6px;
    border-radius: 3px;
    background: var(--raise);
    overflow: hidden;
}
.progress span {
    display: block;
    height: 100%;
    background: var(--accent);
}
dl {
    display: flex;
    gap: 18px;
    margin: 0;
}
dt {
    color: var(--muted);
    font-size: 11px;
}
dd {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}
.split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(220px, 1fr);
}
.now {
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-right: 1px solid var(--line);
}
.lead {
    display: flex;
    align-items: center;
    gap: 10px;
}
.lead .name {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.lead b {
    font-size: 20px;
}
small {
    color: var(--muted);
    font-size: 12px;
}
.prev {
    margin: 0;
    color: var(--muted);
}
.fields {
    flex-wrap: wrap;
    gap: 6px 18px;
}
.fields dd {
    font-size: 13px;
    font-weight: 500;
}
.script {
    white-space: pre-wrap;
    font-size: 17px;
    line-height: 1.5;
    padding: 12px 14px;
    border-radius: 10px;
    border-left: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--panel));
}
.actions,
.outcomes,
.callback {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: flex-end;
}
.actions .btn :deep(svg) {
    width: 16px;
    height: 16px;
    margin-right: 6px;
    vertical-align: -3px;
}
.wrapup {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
}
.wrapup h3 {
    margin: 0;
    font-size: 14px;
}
kbd {
    font-family: var(--mono);
    font-size: 11px;
    margin-right: 6px;
    opacity: 0.8;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
textarea {
    font-family: inherit;
    resize: vertical;
}
.summary .text {
    white-space: pre-wrap;
    margin: 6px 0 0;
}
.error {
    color: var(--bad-text);
    margin: 4px 0 0;
}
.idle {
    margin: auto;
    text-align: center;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}
.countdown {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    color: var(--fg);
}
.queue {
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 10px 0;
    border-bottom: 1px solid var(--line);
}
.ctab {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    padding: 6px 10px 8px;
    cursor: pointer;
}
.ctab.on {
    color: var(--fg);
    border-bottom-color: var(--accent);
}
.list {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 6px 10px 10px;
    list-style: none;
}
.list li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 4px;
    border-bottom: 1px solid var(--line);
}
.list li.current {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.list .who {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--fg);
    font-size: 13px;
}
</style>
