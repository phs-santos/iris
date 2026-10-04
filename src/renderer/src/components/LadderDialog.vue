<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, ref, watch } from 'vue'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { formatTime, useLogStore } from '@renderer/stores/log'
import {
    buildDialogs,
    describeDialog,
    dialogPeer,
    dialogFailed,
    formatOffset,
    ladderHtml,
    layoutLadder,
    SEVERITY_COLORS,
    type Dialog,
    type LadderRow
} from '@renderer/lib/ladder'

// Diagrama de escada: o SIP bruto de cada chamada desenhado como setas entre a conta e o PBX.

const props = defineProps<{ accountId: string | null }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const log = useLogStore()

const accountFilter = ref<string | null>(props.accountId)
/** REGISTER e OPTIONS repetem o tempo todo; ficam escondidos até o usuário pedir. */
const showHousekeeping = ref(false)
const selected = ref<string[]>([])
/** Mensagem aberta embaixo, pelo id da linha do log: o desenho é refeito a cada linha nova. */
const currentId = ref<number | null>(null)
const note = ref('')

const all = computed(() => buildDialogs(log.entries.filter((e) => e.kind === 'sip')))
const list = computed(() =>
    all.value
        .filter((d) => !accountFilter.value || d.accountId === accountFilter.value)
        .filter((d) => showHousekeeping.value || !['REGISTER', 'OPTIONS'].includes(d.method))
        .reverse()
)
const chosen = computed(() => all.value.filter((d) => selected.value.includes(d.key)))

const describeAccount = (accountId: string): { label: string; sublabel: string } => {
    const account = accounts.byId(accountId)
    return {
        label: account?.name ?? accountId,
        sublabel: account ? `${account.extension}@${account.domain}` : ''
    }
}
const pbxLabel = computed(
    () =>
        [...new Set(chosen.value.map((d) => accounts.byId(d.accountId)?.domain).filter(Boolean))].join(', ') ||
        'servidor'
)
const layout = computed(() => layoutLadder(chosen.value, describeAccount, pbxLabel.value))
const current = computed(() => layout.value.rows.find((row) => row.message.entryId === currentId.value) ?? null)

// Abre na chamada mais recente; se a lista mudar e a escolha sumir, volta para ela.
watch(
    list,
    (value) => {
        if (selected.value.some((key) => value.some((d) => d.key === key))) return
        selected.value = value[0] ? [value[0].key] : []
        currentId.value = null
    },
    { immediate: true }
)

function only(dialog: Dialog): void {
    selected.value = [dialog.key]
    currentId.value = null
}

function toggle(dialog: Dialog): void {
    selected.value = selected.value.includes(dialog.key)
        ? selected.value.filter((key) => key !== dialog.key)
        : [...selected.value, dialog.key]
    currentId.value = null
}

const rowLabel = (row: LadderRow): string => `${row.message.label}${row.message.retransmission ? ' (de novo)' : ''}`

function describeRow(row: LadderRow): string {
    const who = describeAccount(row.message.accountId).label
    const arrow =
        row.message.dir === 'out' ? t('ladderDialog.para_o_pbx', { who }) : t('ladderDialog.pbx_para', { who })
    return `${rowLabel(row)}, ${arrow}, ${formatOffset(row.offsetMs)}`
}

function arrowHead(row: LadderRow): string {
    const dir = row.x2 > row.x1 ? 1 : -1
    return `M${row.x2} ${row.y} l${-dir * 8} -4 v8 z`
}

function summary(): string[] {
    return chosen.value.map(
        (d) =>
            `${describeAccount(d.accountId).label} · ${formatTime(d.start)} · ${describeDialog(d)} · Call-ID ${d.callId}`
    )
}

async function saveHtml(): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const title = t('ladderDialog.fluxo_sip_2', { p: chosen.value.map((d) => describeDialog(d)).join(' · ') })
    const path = await window.iris.files.saveText(
        `iris-fluxo-${stamp}.html`,
        ladderHtml(layout.value, title, summary())
    )
    if (path) note.value = t('ladderDialog.salvo_em', { path })
}

async function copyMessage(): Promise<void> {
    if (!current.value) return
    try {
        await navigator.clipboard.writeText(current.value.message.raw)
        note.value = t('ladderDialog.mensagem_copiada')
    } catch {
        note.value = t('ladderDialog.nao_foi_possivel_copiar')
    }
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <div
            ref="dialogEl"
            class="dialog ladder"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ladder-title"
            tabindex="-1"
        >
            <header>
                <h2 id="ladder-title">{{ $t('ladderDialog.fluxo_sip') }}</h2>
                <button class="btn small ghost" :aria-label="$t('ladderDialog.fechar')" @click="emit('close')">
                    ✕
                </button>
            </header>
            <div class="layout">
                <nav class="side" :aria-label="$t('ladderDialog.chamadas_no_log')">
                    <div class="filters">
                        <select v-model="accountFilter" class="input" :aria-label="$t('ladderDialog.conta')">
                            <option :value="null">{{ $t('ladderDialog.todas_as_contas') }}</option>
                            <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
                        </select>
                        <label class="check">
                            <input v-model="showHousekeeping" type="checkbox" />
                            {{ $t('ladderDialog.mostrar_register_e_options') }}
                        </label>
                    </div>
                    <p v-if="list.length === 0" class="muted empty">
                        {{ $t('ladderDialog.nenhuma_mensagem_sip_no_log') }}
                    </p>
                    <ul>
                        <li v-for="d in list" :key="d.key" :class="{ on: selected.includes(d.key) }">
                            <input
                                type="checkbox"
                                :checked="selected.includes(d.key)"
                                :aria-label="
                                    $t('ladderDialog.juntar_de_no_desenho', {
                                        p: describeDialog(d),
                                        p2: describeAccount(d.accountId).label
                                    })
                                "
                                @change="toggle(d)"
                            />
                            <button class="item" @click="only(d)">
                                <span class="top">
                                    <span class="mono time">{{ formatTime(d.start) }}</span>
                                    <span class="who" :style="{ color: accounts.byId(d.accountId)?.color }">{{
                                        describeAccount(d.accountId).label
                                    }}</span>
                                </span>
                                <span class="what" :class="{ bad: dialogFailed(d) }">{{ describeDialog(d) }}</span>
                                <span v-if="dialogPeer(d)" class="peer">{{ dialogPeer(d) }}</span>
                            </button>
                        </li>
                    </ul>
                    <p class="muted tip">{{ $t('ladderDialog.marque_duas_chamadas_para_ver') }}</p>
                </nav>

                <section class="main">
                    <div class="canvas">
                        <svg
                            v-if="layout.rows.length"
                            :width="layout.width"
                            :height="layout.height"
                            :viewBox="`0 0 ${layout.width} ${layout.height}`"
                            role="group"
                            :aria-label="$t('ladderDialog.diagrama_de_escada')"
                        >
                            <g v-for="c in layout.columns" :key="c.accountId ?? 'pbx'">
                                <text :x="c.x" y="20" class="col">{{ c.label }}</text>
                                <text :x="c.x" y="36" class="sub">{{ c.sublabel }}</text>
                                <line :x1="c.x" :y1="layout.top" :x2="c.x" :y2="layout.height - 24" class="life" />
                            </g>
                            <g
                                v-for="row in layout.rows"
                                :key="row.message.entryId"
                                class="row"
                                :class="{ on: currentId === row.message.entryId }"
                                role="button"
                                tabindex="0"
                                :aria-label="describeRow(row)"
                                :aria-pressed="currentId === row.message.entryId"
                                @click="currentId = row.message.entryId"
                                @keydown.enter.prevent="currentId = row.message.entryId"
                                @keydown.space.prevent="currentId = row.message.entryId"
                            >
                                <rect :x="0" :y="row.y - 20" :width="layout.width" height="30" class="hit" />
                                <text x="8" :y="row.y + 4" class="time">{{ formatOffset(row.offsetMs) }}</text>
                                <line
                                    :x1="row.x1"
                                    :y1="row.y"
                                    :x2="row.x2 - (row.x2 > row.x1 ? 2 : -2)"
                                    :y2="row.y"
                                    :stroke="SEVERITY_COLORS[row.message.severity]"
                                    stroke-width="1.6"
                                    :stroke-dasharray="row.message.retransmission ? '5 4' : undefined"
                                />
                                <path :d="arrowHead(row)" :fill="SEVERITY_COLORS[row.message.severity]" />
                                <text
                                    :x="(row.x1 + row.x2) / 2"
                                    :y="row.y - 6"
                                    class="msg"
                                    :fill="SEVERITY_COLORS[row.message.severity]"
                                >
                                    {{ rowLabel(row) }}
                                </text>
                            </g>
                        </svg>
                        <p v-else class="muted empty">{{ $t('ladderDialog.escolha_uma_chamada_na_lista') }}</p>
                    </div>
                    <div class="detail">
                        <template v-if="current">
                            <div class="detail-head">
                                <span class="label">
                                    {{ formatTime(current.message.ts) }} ·
                                    {{ describeAccount(current.message.accountId).label }}
                                    {{ current.message.dir === 'out' ? '→ PBX' : '← PBX' }}
                                </span>
                                <button class="btn small" @click="copyMessage">
                                    {{ $t('ladderDialog.copiar_mensagem') }}
                                </button>
                            </div>
                            <pre class="mono" tabindex="0" :aria-label="$t('ladderDialog.mensagem_sip_completa')">{{
                                current.message.raw
                            }}</pre>
                        </template>
                        <p v-else class="muted">{{ $t('ladderDialog.clique_numa_seta_para_ver') }}</p>
                    </div>
                </section>
            </div>
            <footer>
                <span class="note" role="status">{{ note }}</span>
                <span class="legend" aria-hidden="true">
                    <span :style="{ color: SEVERITY_COLORS.request }">{{ $t('ladderDialog.pedido') }}</span>
                    <span :style="{ color: SEVERITY_COLORS.provisional }">{{ $t('ladderDialog.t_1xx') }}</span>
                    <span :style="{ color: SEVERITY_COLORS.ok }">{{ $t('ladderDialog.t_2xx') }}</span>
                    <span :style="{ color: SEVERITY_COLORS.auth }">401/407</span>
                    <span :style="{ color: SEVERITY_COLORS.error }">{{ $t('ladderDialog.erro') }}</span>
                    <span>{{ $t('ladderDialog.de_novo') }}</span>
                </span>
                <button class="btn" :disabled="layout.rows.length === 0" @click="saveHtml">
                    {{ $t('ladderDialog.salvar_html') }}
                </button>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.dialog.ladder {
    width: min(1180px, 100%);
    height: 100%;
    overflow: hidden;
}
.layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 280px 1fr;
}
.side {
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.filters {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
}
.check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    color: var(--muted);
}
.side ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    flex: 1;
}
.side li {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 4px 10px;
}
.side li input {
    margin-top: 6px;
}
.side li.on {
    background: var(--raise);
}
.item {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--fg);
    text-align: left;
    padding: 2px 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font: inherit;
}
.top {
    display: flex;
    gap: 8px;
    font-size: 12px;
}
.time {
    color: var(--faint);
}
/* Na linha escolhida o fundo clareia; o cinza mais claro mantém o contraste AA. */
.side li.on .time {
    color: var(--muted);
}
.who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.what {
    font-size: 12.5px;
}
.peer {
    font-size: 12px;
    color: var(--muted);
}
.what.bad {
    color: var(--bad);
}
.main {
    display: grid;
    grid-template-rows: 1fr 190px;
    min-width: 0;
    min-height: 0;
}
.canvas {
    overflow: auto;
    background: var(--bg);
}
svg text {
    font-family: var(--mono);
    font-size: 12px;
}
svg .col {
    fill: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    text-anchor: middle;
}
svg .sub {
    fill: var(--muted);
    text-anchor: middle;
}
svg .life {
    stroke: var(--line);
    stroke-width: 2;
}
svg .time {
    fill: var(--faint);
}
.row.on .time,
.row:hover .time {
    fill: var(--muted);
}
svg .msg {
    text-anchor: middle;
}
.row {
    cursor: pointer;
    outline: none;
}
.hit {
    fill: transparent;
}
.row:hover .hit,
.row:focus-visible .hit {
    fill: var(--panel-2);
}
.row.on .hit {
    fill: var(--raise);
}
.row:focus-visible .hit {
    stroke: var(--accent);
}
.detail {
    border-top: 1px solid var(--line);
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
}
.detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.detail pre {
    margin: 0;
    flex: 1;
    overflow: auto;
    font-size: 11.5px;
    color: #b9c7d6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.muted {
    color: var(--muted);
    font-size: 12px;
}
.empty {
    padding: 12px;
}
.tip {
    padding: 8px 12px;
    margin: 0;
    border-top: 1px solid var(--line);
}
footer .note {
    flex: 1;
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.legend {
    display: flex;
    gap: 10px;
    font-size: 12px;
    align-items: center;
    font-family: var(--mono);
    color: var(--muted);
}
</style>
