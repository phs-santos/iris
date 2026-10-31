<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, nextTick, ref, watch } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { formatEntry, formatTime, useLogStore, type LogEntry } from '@renderer/stores/log'
import type { LogLevel } from '@renderer/sip/engine'
import { severityOf, sipHeadline } from '@renderer/lib/ladder'
import Icon from '../icons/Icon.vue'
import { useDebugStore } from '@renderer/stores/debug'

// Abas SIP e Log da gaveta de depuração (RF-21, RF-22, RF-23). A mensagem usa a largura toda: a hora
// e a conta ficam numa linha curta em cima, e a conta só aparece com o filtro em "Todas".

const props = defineProps<{ kind: 'sip' | 'event' }>()

/** Linhas desenhadas na tela; o resto continua disponível para copiar e salvar. */
const VISIBLE_LIMIT = props.kind === 'sip' ? 600 : 1500

const accounts = useAccountsStore()
const log = useLogStore()
// Por padrão esconde o detalhe interno da biblioteca SIP (nível debug).
const minLevel = ref<LogLevel>('info')
const text = ref('')
const follow = ref(true)
const listEl = ref<HTMLElement | null>(null)
const note = ref('')
/** Mensagem SIP aberta, pelo id da linha. */
const openId = ref<number | null>(null)
const debug = useDebugStore()

// Mensagem pedida de fora (atividade recente da conta): abre ela e rola até lá, sem seguir o fim.
watch(
    () => debug.focusEntryId,
    async (id) => {
        if (props.kind !== 'sip' || id === null) return
        openId.value = id
        follow.value = false
        debug.focusEntryId = null
        await nextTick()
        listEl.value?.querySelector(`[data-entry="${id}"]`)?.scrollIntoView({ block: 'center' })
    },
    { immediate: true }
)

const matching = computed(() =>
    log.filtered({
        accountId: log.accountFilter,
        kind: props.kind,
        minLevel: props.kind === 'sip' ? 'debug' : minLevel.value,
        text: text.value
    })
)
const visible = computed(() => matching.value.slice(-VISIBLE_LIMIT))
/** Com uma conta só no filtro, o nome dela não se repete em cada linha. */
const showAccount = computed(() => log.accountFilter === null)

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

const hms = (ts: number): string => formatTime(ts).slice(0, 8)
const ms = (ts: number): string => formatTime(ts).slice(8)

function headline(e: LogEntry): { arrow: string; dirLabel: string; line: string; severity: string } {
    const h = sipHeadline(e.text)
    // "INVITE sip:8000@pbx SIP/2.0" vira "INVITE sip:8000@pbx"; a resposta fica "200 OK".
    const line = h.status !== undefined ? h.line.replace(/^SIP\/2\.0\s+/, '') : h.line.replace(/\s+SIP\/2\.0$/, '')
    return {
        arrow: h.dir === 'in' ? '←' : '→',
        dirLabel: h.dir === 'in' ? t('logPane.recebida') : t('logPane.enviada'),
        line,
        severity: severityOf(h.status)
    }
}

const accountOf = (e: LogEntry) => accounts.byId(e.accountId ?? '')

function toggle(id: number): void {
    openId.value = openId.value === id ? null : id
}

function flash(message: string, ms = 2500): void {
    note.value = message
    setTimeout(() => (note.value === message ? (note.value = '') : undefined), ms)
}

const asText = (): string => matching.value.map((e) => formatEntry(e, accounts.nameOf)).join('\n')

async function copy(): Promise<void> {
    try {
        await navigator.clipboard.writeText(asText())
        flash(t('logPane.linhas_copiadas', { length: matching.value.length }))
    } catch {
        flash(t('logPane.nao_foi_possivel_copiar'))
    }
}

async function copyMessage(e: LogEntry): Promise<void> {
    try {
        await navigator.clipboard.writeText(e.text)
        flash(t('logPane.mensagem_copiada'))
    } catch {
        flash(t('logPane.nao_foi_possivel_copiar'))
    }
}

/** Salva o mesmo que a aba mostra, com todas as linhas e não só as desenhadas (RF-23). */
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
    const name = props.kind === 'sip' ? 'iris-sip' : 'iris-log'
    const path = await window.iris.files.saveText(`${name}-${stamp}.${format}`, content)
    if (path) flash(t('logPane.salvo_em', { path }), 4000)
}

function clear(): void {
    log.clear(log.accountFilter)
    openId.value = null
}
</script>

<template>
    <div class="pane">
        <div class="tools">
            <input
                v-model="text"
                class="input search"
                type="search"
                :placeholder="$t('logPane.buscar')"
                :aria-label="kind === 'sip' ? $t('logPane.buscar_no_sip') : $t('logPane.buscar_no_log')"
            />
            <select
                v-if="kind === 'event'"
                v-model="minLevel"
                class="input level"
                :aria-label="$t('logPane.nivel_minimo')"
            >
                <option value="debug">{{ $t('logPane.debug') }}</option>
                <option value="info">{{ $t('logPane.info') }}</option>
                <option value="warn">{{ $t('logPane.aviso') }}</option>
                <option value="error">{{ $t('logPane.erro') }}</option>
            </select>
            <span class="count tabular">{{
                kind === 'sip'
                    ? $t('logPane.mensagens', { length: matching.length })
                    : $t('logPane.linhas', { length: matching.length })
            }}</span>
        </div>

        <div
            ref="listEl"
            class="list"
            :class="kind"
            :role="kind === 'event' ? 'log' : undefined"
            tabindex="0"
            :aria-label="kind === 'sip' ? $t('logPane.mensagens_sip') : $t('logPane.linhas_do_log')"
            @scroll="onScroll"
        >
            <p v-if="matching.length > VISIBLE_LIMIT" class="empty">
                {{ $t('logPane.mostrando_as_ultimas_de_linhas', { limit: VISIBLE_LIMIT, length: matching.length }) }}
            </p>

            <template v-if="kind === 'sip'">
                <div
                    v-for="e in visible"
                    :key="e.id"
                    class="line sip msg"
                    :data-entry="e.id"
                    :class="[headline(e).severity, { open: openId === e.id }]"
                >
                    <button
                        type="button"
                        class="msg-head"
                        :aria-expanded="openId === e.id"
                        :aria-controls="`sip-${e.id}`"
                        @click="toggle(e.id)"
                    >
                        <span class="meta">
                            <span class="t tabular" :title="formatTime(e.ts)"
                                >{{ hms(e.ts) }}<span class="ms">{{ ms(e.ts) }}</span></span
                            >
                            <span
                                v-if="showAccount && accountOf(e)"
                                class="chip"
                                :style="{ '--account': accountOf(e)?.color }"
                                :title="accountOf(e)?.name"
                                ><i aria-hidden="true"></i>{{ accountOf(e)?.extension }}</span
                            >
                        </span>
                        <span class="first mono">
                            <span class="arrow" aria-hidden="true">{{ headline(e).arrow }}</span>
                            <span class="sr-only">{{ headline(e).dirLabel }}:</span>
                            <span class="x">{{ headline(e).line }}</span>
                        </span>
                    </button>
                    <div v-if="openId === e.id" :id="`sip-${e.id}`" class="whole">
                        <pre class="mono" tabindex="0" :aria-label="$t('logPane.mensagem_inteira')">{{
                            e.text.trim()
                        }}</pre>
                        <button type="button" class="btn small ghost copy" @click="copyMessage(e)">
                            {{ $t('logPane.copiar_mensagem') }}
                        </button>
                    </div>
                </div>
            </template>

            <template v-else>
                <div v-for="e in visible" :key="e.id" class="line" :class="[e.level, e.kind]">
                    <span class="meta">
                        <span class="t tabular" :title="formatTime(e.ts)"
                            >{{ hms(e.ts) }}<span class="ms">{{ ms(e.ts) }}</span></span
                        >
                        <span
                            v-if="showAccount && accountOf(e)"
                            class="chip"
                            :style="{ '--account': accountOf(e)?.color }"
                            :title="accountOf(e)?.name"
                            ><i aria-hidden="true"></i>{{ accountOf(e)?.extension }}</span
                        >
                        <span v-if="e.level === 'warn' || e.level === 'error'" class="lvl">{{
                            e.level === 'error' ? $t('logPane.nivel_erro') : $t('logPane.nivel_aviso')
                        }}</span>
                    </span>
                    <span class="x">{{ e.text }}</span>
                </div>
            </template>

            <p v-if="matching.length === 0" class="empty">
                {{ kind === 'sip' ? $t('logPane.nenhuma_mensagem_sip') : $t('logPane.nada_no_log_com_estes') }}
            </p>
        </div>

        <div class="foot">
            <button type="button" class="btn small" @click="copy">{{ $t('logPane.copiar') }}</button>
            <button type="button" class="btn small" @click="save('txt')">{{ $t('logPane.salvar_txt') }}</button>
            <button type="button" class="btn small" @click="save('json')">{{ $t('logPane.salvar_json') }}</button>
            <button type="button" class="btn small ghost" @click="clear">
                <Icon name="erase" />{{ $t('logPane.limpar') }}
            </button>
            <span class="note" role="status">{{ note }}</span>
            <button v-if="!follow" type="button" class="btn small ghost end" @click="jumpToEnd">
                {{ $t('logPane.ir_para_o_fim') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
}
.tools {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
}
.search,
.level {
    height: 28px;
    padding-top: 0;
    padding-bottom: 0;
}
.search {
    flex: 1;
    min-width: 0;
}
.level {
    width: 80px;
    flex: none;
}
.count {
    flex: none;
    font-size: 11px;
    color: var(--muted);
}
.list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    font-size: 12px;
}
.list:focus-visible {
    outline-offset: -2px;
}

/* Cada linha: hora (e a conta, com "Todas") numa faixa curta; o texto embaixo, na largura toda. */
.line {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 10px 5px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
}
.meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 10.5px;
    line-height: 16px;
}
.t {
    font-family: var(--mono);
    color: var(--fg);
}
/* Os milissegundos ficam discretos: mesma linha, cor mais apagada. */
.ms {
    color: var(--muted);
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 15px;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--raise);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 10.5px;
}
.chip i {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    background: var(--account, var(--muted));
}
.lvl {
    font-weight: 600;
}
.x {
    min-width: 0;
    overflow-wrap: break-word;
    word-break: normal;
    line-height: 1.4;
}
.line.warn .x,
.line.warn .lvl {
    color: var(--warn-text);
}
.line.error .x,
.line.error .lvl {
    color: var(--bad-text);
}
.line.error {
    background: var(--bad-soft);
}
.line.debug .x {
    color: var(--muted);
}

/* SIP: só a primeira linha da mensagem; o clique abre a mensagem inteira, sem quebra. */
.line.msg {
    padding: 0;
    gap: 0;
}
.msg-head {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
    width: 100%;
    padding: 4px 10px 5px;
    border: 0;
    background: transparent;
    color: var(--fg);
    text-align: left;
    font: inherit;
    cursor: pointer;
}
.msg-head:hover {
    background: var(--panel-2);
}
.msg-head:focus-visible {
    outline-offset: -2px;
}
.line.msg.open .msg-head {
    background: var(--selected);
}
.first {
    display: flex;
    gap: 6px;
    min-width: 0;
    font-size: 11.5px;
}
.first .x {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.arrow {
    flex: none;
    width: 1em;
    font-weight: 700;
}
/* A cor diz o tipo: pedido, 1xx, 2xx, desafio (401/407) ou erro; a mesma da legenda do Fluxo. */
.msg.request .arrow,
.msg.request .first .x {
    color: var(--info-text);
}
.msg.provisional .first {
    color: var(--muted);
}
.msg.ok .first {
    color: var(--ok-text);
}
.msg.auth .first {
    color: var(--warn-text);
}
.msg.error .first {
    color: var(--bad-text);
}
.whole {
    position: relative;
    border-top: 1px solid var(--line);
    background: var(--panel);
}
.whole pre {
    margin: 0;
    padding: 8px 10px 30px;
    max-height: 340px;
    overflow: auto;
    white-space: pre;
    font-size: 11px;
    line-height: 1.45;
    color: var(--fg);
}
.copy {
    position: absolute;
    right: 6px;
    bottom: 4px;
}
.empty {
    color: var(--muted);
    margin: 0;
    padding: 10px;
    font-size: 12px;
}
.foot {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    flex-wrap: wrap;
}
.foot .btn :deep(.icon) {
    margin-right: 4px;
    font-size: 12px;
}
.note {
    color: var(--muted);
    font-size: 11.5px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
