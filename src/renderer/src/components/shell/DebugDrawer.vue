<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogStore } from '@renderer/stores/log'
import { clampWidth, DEBUG_WIDTH, useDebugStore, type DebugTab } from '@renderer/stores/debug'
import Icon from '../icons/Icon.vue'
import LogPane from './LogPane.vue'
import FlowPane from './FlowPane.vue'
import HealthPane from './HealthPane.vue'

// Gaveta de depuração à direita: começa recolhida numa tira; aberta, tem as abas SIP, Fluxo, Log e
// Saúde, todas filtradas pela mesma conta (RF-21), e muda de tamanho pela alça da borda.

const accounts = useAccountsStore()
const log = useLogStore()
const debug = useDebugStore()

const tabs = computed<{ id: DebugTab; label: string }[]>(() => [
    { id: 'sip', label: t('debug.sip') },
    { id: 'flow', label: t('debug.fluxo') },
    { id: 'log', label: t('debug.log') },
    { id: 'health', label: t('debug.saude') }
])

// O filtro acompanha a conta atual (RF-21); clicar numa chamada também troca (CallRow).
watch(
    () => accounts.current?.id ?? null,
    (id) => (log.accountFilter = id),
    { immediate: true }
)

/** A Saúde é sempre de uma conta: com "Todas", vale a atual. */
const healthAccountId = computed(() => log.accountFilter ?? accounts.current?.id ?? null)

// Erro novo desde que a gaveta fechou: a tira muda de cor, sem abrir sozinha.
const seenErrors = ref(debug.open ? log.errorCount : 0)
watch(
    () => [debug.open, log.errorCount] as const,
    ([open, count]) => {
        if (open) seenErrors.value = count
    }
)
const newError = computed(() => !debug.open && log.errorCount > seenErrors.value)

// ─── Tamanho ───────────────────────────────────────────────────────────
const windowWidth = ref(window.innerWidth)
const onResize = (): void => void (windowWidth.value = window.innerWidth)
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
/** O tamanho escolhido fica guardado; numa janela estreita a gaveta encolhe sem esquecer a escolha. */
const shownWidth = computed(() => clampWidth(debug.width, windowWidth.value))
const maxWidth = computed(() => clampWidth(Infinity, windowWidth.value))

let drag: { x: number; width: number } | null = null
function startDrag(event: PointerEvent): void {
    drag = { x: event.clientX, width: shownWidth.value }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onDrag(event: PointerEvent): void {
    if (!drag) return
    // A alça fica na borda esquerda: puxar para a esquerda alarga.
    debug.width = clampWidth(drag.width + drag.x - event.clientX, windowWidth.value)
}
function endDrag(): void {
    drag = null
}
function onHandleKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 64 : 16
    if (event.key === 'ArrowLeft') debug.width = clampWidth(shownWidth.value + step, windowWidth.value)
    else if (event.key === 'ArrowRight') debug.width = clampWidth(shownWidth.value - step, windowWidth.value)
    else if (event.key === 'Home') debug.width = DEBUG_WIDTH.min
    else if (event.key === 'End') debug.width = maxWidth.value
    else return
    event.preventDefault()
}

// ─── Abas ──────────────────────────────────────────────────────────────
const tabEls = ref<HTMLElement[]>([])
/** ←/→ trocam de aba, como nas Configurações (RNF-12). */
function onTabKey(event: KeyboardEvent): void {
    const index = tabs.value.findIndex((tab) => tab.id === debug.tab)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.value.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.value.length) % tabs.value.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.value.length - 1
    else return
    event.preventDefault()
    debug.tab = tabs.value[next]!.id
    tabEls.value[next]?.focus()
}

const stripLabel = computed(() => (newError.value ? t('debug.abrir_erro') : t('debug.abrir')))
</script>

<template>
    <aside class="drawer" :class="{ open: debug.open }" :style="debug.open ? { width: `${shownWidth}px` } : undefined">
        <button
            v-if="!debug.open"
            type="button"
            class="strip"
            :class="{ alert: newError }"
            aria-controls="debug-panel"
            :aria-expanded="false"
            :aria-label="stripLabel"
            :title="newError ? $t('debug.erro_novo') : undefined"
            @click="debug.open = true"
        >
            <Icon name="chevron" class="strip-chevron" />
            <span v-if="newError" class="dot" aria-hidden="true"></span>
            <span class="strip-text" aria-hidden="true">{{ $t('debug.tira') }}</span>
        </button>

        <template v-else>
            <div
                class="handle"
                role="separator"
                aria-orientation="vertical"
                tabindex="0"
                :aria-label="$t('debug.tamanho')"
                :aria-valuenow="shownWidth"
                :aria-valuemin="DEBUG_WIDTH.min"
                :aria-valuemax="maxWidth"
                :title="$t('debug.tamanho_dica')"
                @pointerdown="startDrag"
                @pointermove="onDrag"
                @pointerup="endDrag"
                @pointercancel="endDrag"
                @dblclick="debug.width = DEBUG_WIDTH.initial"
                @keydown="onHandleKey"
            ></div>
            <div id="debug-panel" class="panel">
                <header class="head">
                    <div class="tabs" role="tablist" :aria-label="$t('debug.abas')" @keydown="onTabKey">
                        <button
                            v-for="tab in tabs"
                            :id="`debug-tab-${tab.id}`"
                            :key="tab.id"
                            ref="tabEls"
                            type="button"
                            role="tab"
                            class="tab"
                            :aria-selected="debug.tab === tab.id"
                            aria-controls="debug-tabpanel"
                            :tabindex="debug.tab === tab.id ? 0 : -1"
                            @click="debug.tab = tab.id"
                        >
                            {{ tab.label }}
                        </button>
                    </div>
                    <button
                        type="button"
                        class="close"
                        :aria-expanded="true"
                        aria-controls="debug-panel"
                        :aria-label="$t('debug.recolher')"
                        :title="$t('debug.recolher')"
                        @click="debug.open = false"
                    >
                        <Icon name="chevron" />
                    </button>
                </header>
                <div class="filter">
                    <span
                        class="swatch"
                        aria-hidden="true"
                        :style="{ '--account': accounts.byId(log.accountFilter ?? '')?.color }"
                        :class="{ all: !log.accountFilter }"
                    ></span>
                    <select v-model="log.accountFilter" class="input" :aria-label="$t('debug.conta')">
                        <option :value="null">{{ $t('debug.todas') }}</option>
                        <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                            {{ a.name }} · {{ a.extension }}
                        </option>
                    </select>
                </div>
                <p v-if="debug.tab === 'health' && !log.accountFilter && healthAccountId" class="hint">
                    {{ $t('healthPane.de_todas') }}
                </p>
                <div id="debug-tabpanel" class="tabpanel" role="tabpanel" :aria-labelledby="`debug-tab-${debug.tab}`">
                    <LogPane v-if="debug.tab === 'sip'" key="sip" kind="sip" />
                    <FlowPane v-else-if="debug.tab === 'flow'" />
                    <LogPane v-else-if="debug.tab === 'log'" key="log" kind="event" />
                    <HealthPane v-else :account-id="healthAccountId" />
                </div>
            </div>
        </template>
    </aside>
</template>

<style scoped>
.drawer {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    width: 30px;
    border-left: 1px solid var(--line);
    background: var(--panel);
}

/* Tira recolhida */
.strip {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    border: 0;
    background: var(--bg);
    color: var(--muted);
    cursor: pointer;
    transition:
        background 120ms,
        color 120ms;
}
.strip:hover {
    background: var(--raise);
    color: var(--fg);
}
.strip:focus-visible {
    outline-offset: -2px;
}
.strip-chevron {
    transform: rotate(180deg);
    font-size: 14px;
}
.strip-text {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
}
/* Erro novo: a tira ganha o fundo de erro e um ponto que pulsa uma vez. */
.strip.alert {
    background: var(--bad-soft);
    color: var(--bad-text);
    box-shadow: inset 2px 0 0 var(--bad);
}
.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bad);
}
@media (prefers-reduced-motion: no-preference) {
    .dot {
        animation: ping 1.2s ease-out 2;
    }
}
@keyframes ping {
    0% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--bad) 60%, transparent);
    }
    100% {
        box-shadow: 0 0 0 7px transparent;
    }
}

/* Alça de tamanho, na borda esquerda */
.handle {
    position: absolute;
    left: -4px;
    top: 0;
    bottom: 0;
    width: 8px;
    z-index: 5;
    cursor: col-resize;
    touch-action: none;
}
.handle::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
    transition: background 120ms;
}
.handle:hover::after,
.handle:focus-visible::after {
    background: var(--accent);
}
.handle:focus-visible {
    outline: none;
}

.panel {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.head {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    height: 34px;
    padding: 0 6px 0 4px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
    flex: none;
}
.tabs {
    display: flex;
    gap: 2px;
}
.tab {
    position: relative;
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 0 10px;
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
}
.tab:hover {
    color: var(--fg);
}
.tab[aria-selected='true'] {
    color: var(--fg);
    font-weight: 600;
}
.tab[aria-selected='true']::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: var(--accent);
}
.tab:focus-visible {
    outline-offset: -3px;
}
.close {
    align-self: center;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel);
    color: var(--muted);
    cursor: pointer;
}
.close:hover {
    color: var(--fg);
}
.filter {
    position: relative;
    display: flex;
    align-items: center;
    padding: 8px 10px 0;
}
.filter .input {
    flex: 1;
    min-width: 0;
    height: 28px;
    padding-top: 0;
    padding-bottom: 0;
    padding-left: 24px;
    line-height: 26px;
}
.swatch {
    position: absolute;
    left: 19px;
    top: 50%;
    margin-top: 4px;
    transform: translateY(-50%);
    z-index: 1;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--account, var(--muted));
    pointer-events: none;
}
.swatch.all {
    background: conic-gradient(var(--accent) 0 25%, var(--ok) 0 50%, var(--warn) 0 75%, var(--bad) 0);
}
.hint {
    margin: 6px 10px 0;
    font-size: 11.5px;
    color: var(--muted);
}
.tabpanel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
</style>
