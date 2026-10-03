<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { formatEntry, formatTime, useLogStore, type LogFilter } from '@renderer/stores/log'

/** Linhas desenhadas na tela; o resto continua disponível para copiar e salvar. */
const VISIBLE_LIMIT = 1500

const accounts = useAccountsStore()
const log = useLogStore()
// Por padrão esconde o detalhe interno da biblioteca SIP (nível debug).
const filter = reactive<LogFilter>({ accountId: null, kind: 'event', minLevel: 'info', text: '' })
const follow = ref(true)
const listEl = ref<HTMLElement | null>(null)
const copied = ref('')

const matching = computed(() => log.filtered(filter))
const visible = computed(() => matching.value.slice(-VISIBLE_LIMIT))

const tabs = [
    { kind: 'event', label: 'Eventos' },
    { kind: 'sip', label: 'SIP bruto' },
    { kind: 'all', label: 'Tudo' }
] as const

watch(
    () => visible.value.length && visible.value[visible.value.length - 1]?.id,
    async () => {
        if (!follow.value) return
        await nextTick()
        listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
    }
)

function onScroll(): void {
    const el = listEl.value
    if (!el) return
    follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

function jumpToEnd(): void {
    follow.value = true
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
}

const asText = (): string => matching.value.map((e) => formatEntry(e, accounts.nameOf)).join('\n')

async function copy(): Promise<void> {
    try {
        await navigator.clipboard.writeText(asText())
        copied.value = `${matching.value.length} linhas copiadas`
    } catch {
        copied.value = 'Não foi possível copiar'
    }
    setTimeout(() => (copied.value = ''), 2500)
}

async function save(format: 'txt' | 'json'): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const content =
        format === 'txt'
            ? asText()
            : JSON.stringify(
                  matching.value.map((e) => ({
                      ...e,
                      time: new Date(e.ts).toISOString(),
                      account: accounts.nameOf(e.accountId)
                  })),
                  null,
                  2
              )
    const path = await window.iris.files.saveText(`iris-log-${stamp}.${format}`, content)
    if (path) copied.value = `Salvo em ${path}`
    setTimeout(() => (copied.value = ''), 4000)
}
</script>

<template>
    <aside class="pane">
        <div class="head">
            <div class="tabs" role="tablist">
                <button
                    v-for="t in tabs"
                    :key="t.kind"
                    role="tab"
                    class="tab"
                    :class="{ on: filter.kind === t.kind }"
                    :aria-selected="filter.kind === t.kind"
                    @click="filter.kind = t.kind"
                >
                    {{ t.label }}
                </button>
            </div>
            <span class="label tabular">{{ matching.length }} linhas</span>
        </div>

        <div class="filters">
            <select v-model="filter.accountId" class="input" aria-label="Filtrar por conta">
                <option :value="null">Todas as contas</option>
                <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <select v-model="filter.minLevel" class="input level" aria-label="Nível mínimo">
                <option value="debug">debug+</option>
                <option value="info">info+</option>
                <option value="warn">aviso+</option>
                <option value="error">erro</option>
            </select>
            <input v-model="filter.text" class="input" placeholder="Buscar" aria-label="Buscar no log" />
        </div>

        <div ref="listEl" class="list mono" role="log" tabindex="0" aria-label="Linhas do log" @scroll="onScroll">
            <p v-if="matching.length > VISIBLE_LIMIT" class="trimmed">
                Mostrando as últimas {{ VISIBLE_LIMIT }} de {{ matching.length }} linhas. Copiar e salvar levam todas.
            </p>
            <div v-for="e in visible" :key="e.id" class="line" :class="[e.level, e.kind]">
                <span class="t">{{ formatTime(e.ts) }}</span>
                <span class="a" :style="{ color: accounts.byId(e.accountId ?? '')?.color }">{{
                    accounts.nameOf(e.accountId)
                }}</span>
                <span class="x">{{ e.text }}</span>
            </div>
            <p v-if="matching.length === 0" class="trimmed">
                {{
                    filter.kind === 'sip'
                        ? 'Nenhuma mensagem SIP. Ative "Mostrar SIP bruto" na conta para vê-las aqui.'
                        : 'Nada no log com estes filtros.'
                }}
            </p>
        </div>

        <div class="foot">
            <button class="btn small" @click="copy">Copiar</button>
            <button class="btn small" @click="save('txt')">Salvar .txt</button>
            <button class="btn small" @click="save('json')">Salvar .json</button>
            <button class="btn small" @click="log.clear(filter.accountId)">Limpar</button>
            <span class="note">{{ copied }}</span>
            <button v-if="!follow" class="btn small ghost" @click="jumpToEnd">Ir para o fim</button>
        </div>
    </aside>
</template>

<style scoped>
.pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: var(--panel);
}
.head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 4px;
}
.tabs {
    display: flex;
    gap: 4px;
}
.tab {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 3px 9px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
}
.tab.on {
    background: var(--raise);
    color: var(--fg);
}
.filters {
    display: grid;
    grid-template-columns: 1fr 90px 1fr;
    gap: 6px;
    padding: 6px 12px;
}
.list {
    flex: 1;
    overflow: auto;
    padding: 4px 12px;
    font-size: 11.5px;
    background: var(--bg);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
}
.line {
    display: grid;
    grid-template-columns: 88px 90px 1fr;
    gap: 8px;
    padding: 1px 0;
}
.line.sip .x {
    white-space: pre-wrap;
    color: #b9c7d6;
}
.t {
    color: var(--faint);
}
.a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #9fb6ff;
}
.x {
    min-width: 0;
    overflow-wrap: anywhere;
}
.line.warn .x {
    color: #f3c56f;
}
.line.error .x {
    color: #ff8f86;
}
.line.debug .x {
    color: var(--muted);
}
.trimmed {
    color: var(--muted);
    margin: 6px 0;
    font-family: var(--sans);
}
.foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    flex-wrap: wrap;
}
.note {
    color: var(--muted);
    font-size: 12px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
