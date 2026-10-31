<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, ref, watch } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { usePreferencesStore } from '@renderer/stores/preferences'
import { formatTime, useLogStore } from '@renderer/stores/log'
import {
    buildDialogs,
    describeDialog,
    dialogPeer,
    dialogFailed,
    formatOffset,
    ladderHtml,
    layoutLadder,
    LADDER,
    SEVERITY_COLORS,
    SEVERITY_COLORS_LIGHT,
    type Dialog,
    type LadderRow
} from '@renderer/lib/ladder'

// Aba Fluxo da gaveta de depuração: o SIP bruto de cada chamada desenhado como setas entre a conta e o PBX.
// A conta vem do filtro da gaveta (RF-21).

/** Desenho estreito, para caber na gaveta; o arquivo exportado usa o largo. */
const NARROW = { columnGap: 170, margin: 64, rowHeight: 30 }

const accounts = useAccountsStore()
const log = useLogStore()
const prefs = usePreferencesStore()
/** Cores das setas: as claras não têm contraste sobre o fundo branco. */
const colors = computed(() => (prefs.theme === 'light' ? SEVERITY_COLORS_LIGHT : SEVERITY_COLORS))

const accountFilter = computed(() => log.accountFilter)
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
const layout = computed(() => layoutLadder(chosen.value, describeAccount, pbxLabel.value, NARROW))
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
    const arrow = row.message.dir === 'out' ? t('flowPane.para_o_pbx', { who }) : t('flowPane.pbx_para', { who })
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
    const title = t('flowPane.fluxo_sip', { p: chosen.value.map((d) => describeDialog(d)).join(' · ') })
    const path = await window.iris.files.saveText(
        `iris-fluxo-${stamp}.html`,
        ladderHtml(layoutLadder(chosen.value, describeAccount, pbxLabel.value, LADDER), title, summary())
    )
    if (path) note.value = t('flowPane.salvo_em', { path })
}

async function copyMessage(): Promise<void> {
    if (!current.value) return
    try {
        await navigator.clipboard.writeText(current.value.message.raw)
        note.value = t('flowPane.mensagem_copiada')
    } catch {
        note.value = t('flowPane.nao_foi_possivel_copiar')
    }
}
</script>

<template>
    <div class="flow">
        <nav class="side" :aria-label="$t('flowPane.chamadas_no_log')">
            <label class="check">
                <input v-model="showHousekeeping" type="checkbox" />
                {{ $t('flowPane.mostrar_register_e_options') }}
            </label>
            <p v-if="list.length === 0" class="muted empty">{{ $t('flowPane.nenhuma_mensagem_sip_no_log') }}</p>
            <ul v-else>
                <li v-for="d in list" :key="d.key" :class="{ on: selected.includes(d.key) }">
                    <input
                        type="checkbox"
                        :checked="selected.includes(d.key)"
                        :aria-label="
                            $t('flowPane.juntar_de_no_desenho', {
                                p: describeDialog(d),
                                p2: describeAccount(d.accountId).label
                            })
                        "
                        @change="toggle(d)"
                    />
                    <button type="button" class="item" @click="only(d)">
                        <span class="mono time">{{ formatTime(d.start).slice(0, 8) }}</span>
                        <span class="what" :class="{ bad: dialogFailed(d) }">{{ describeDialog(d) }}</span>
                        <span v-if="dialogPeer(d)" class="peer">{{ dialogPeer(d) }}</span>
                        <span
                            v-if="!accountFilter"
                            class="chip"
                            :style="{ '--account': accounts.byId(d.accountId)?.color }"
                            :title="describeAccount(d.accountId).label"
                            ><i aria-hidden="true"></i>{{ accounts.byId(d.accountId)?.extension ?? '?' }}</span
                        >
                    </button>
                </li>
            </ul>
        </nav>

        <div class="canvas">
            <svg
                v-if="layout.rows.length"
                :width="layout.width"
                :height="layout.height"
                :viewBox="`0 0 ${layout.width} ${layout.height}`"
                role="group"
                :aria-label="$t('flowPane.diagrama_de_escada')"
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
                    <rect :x="0" :y="row.y - 18" :width="layout.width" height="26" class="hit" />
                    <text x="6" :y="row.y + 4" class="time">{{ formatOffset(row.offsetMs) }}</text>
                    <line
                        :x1="row.x1"
                        :y1="row.y"
                        :x2="row.x2 - (row.x2 > row.x1 ? 2 : -2)"
                        :y2="row.y"
                        :stroke="colors[row.message.severity]"
                        stroke-width="1.6"
                        :stroke-dasharray="row.message.retransmission ? '5 4' : undefined"
                    />
                    <path :d="arrowHead(row)" :fill="colors[row.message.severity]" />
                    <text :x="(row.x1 + row.x2) / 2" :y="row.y - 5" class="msg" :fill="colors[row.message.severity]">
                        {{ rowLabel(row) }}
                    </text>
                </g>
            </svg>
            <p v-else-if="list.length" class="muted empty">{{ $t('flowPane.escolha_uma_chamada_na_lista') }}</p>
        </div>

        <div v-if="layout.rows.length" class="detail">
            <template v-if="current">
                <div class="detail-head">
                    <span class="mono when">
                        {{ formatTime(current.message.ts) }} ·
                        {{ describeAccount(current.message.accountId).label }}
                        {{ current.message.dir === 'out' ? '→ PBX' : '← PBX' }}
                    </span>
                    <button type="button" class="btn small ghost" @click="copyMessage">
                        {{ $t('flowPane.copiar_mensagem') }}
                    </button>
                </div>
                <pre class="mono" tabindex="0" :aria-label="$t('flowPane.mensagem_sip_completa')">{{
                    current.message.raw
                }}</pre>
            </template>
            <p v-else class="muted">{{ $t('flowPane.clique_numa_seta_para_ver') }}</p>
        </div>

        <div class="foot">
            <span class="legend" aria-hidden="true">
                <span :style="{ color: colors.request }">{{ $t('flowPane.pedido') }}</span>
                <span :style="{ color: colors.provisional }">{{ $t('flowPane.t_1xx') }}</span>
                <span :style="{ color: colors.ok }">{{ $t('flowPane.t_2xx') }}</span>
                <span :style="{ color: colors.auth }">401/407</span>
                <span :style="{ color: colors.error }">{{ $t('flowPane.erro') }}</span>
            </span>
            <span class="note" role="status">{{ note }}</span>
            <button type="button" class="btn small" :disabled="layout.rows.length === 0" @click="saveHtml">
                {{ $t('flowPane.salvar_html') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.flow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.side {
    flex: none;
    max-height: 32%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-bottom: 1px solid var(--line);
}
.check {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 10px;
    font-size: 11.5px;
    color: var(--muted);
}
.side ul {
    list-style: none;
    margin: 0;
    padding: 0 0 4px;
    overflow: auto;
}
.side li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
}
.side li.on {
    background: var(--selected);
}
.item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: var(--fg);
    text-align: left;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}
.time {
    color: var(--muted);
    font-size: 11px;
}
.what {
    white-space: nowrap;
}
.what.bad {
    color: var(--bad-text);
}
.peer {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
}
.chip {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 15px;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--raise);
    font-family: var(--mono);
    font-size: 10.5px;
    flex: none;
}
.chip i {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    background: var(--account, var(--muted));
}
.canvas {
    flex: 1;
    min-height: 120px;
    overflow: auto;
    background: var(--bg);
}
svg text {
    font-family: var(--mono);
    font-size: 11px;
}
svg .col {
    fill: var(--fg);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 600;
    text-anchor: middle;
}
svg .sub {
    fill: var(--muted);
    font-size: 10.5px;
    text-anchor: middle;
}
svg .life {
    stroke: var(--line-strong);
    stroke-width: 1.5;
}
svg .time {
    fill: var(--muted);
    font-size: 10px;
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
.row:hover .hit {
    fill: var(--panel-2);
}
.row.on .hit {
    fill: var(--selected);
}
.row:focus-visible .hit {
    stroke: var(--accent);
    stroke-width: 1.5;
}
.detail {
    flex: none;
    height: 34%;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--panel);
}
.detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px 4px 10px;
}
.when {
    font-size: 10.5px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.detail pre {
    margin: 0;
    flex: 1;
    overflow: auto;
    padding: 0 10px 8px;
    font-size: 11px;
    line-height: 1.45;
    white-space: pre;
}
.detail > .muted {
    padding: 10px;
}
.muted {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
}
.empty {
    padding: 10px;
}
.foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-top: 1px solid var(--line);
}
.legend {
    display: flex;
    gap: 8px;
    font-size: 10.5px;
    font-family: var(--mono);
}
.note {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
