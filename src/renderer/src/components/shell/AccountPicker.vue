<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Account } from '@shared/types'
import { SIMULATED_SERVER_ID } from '@shared/servers'
import { filterAccounts, groupByServer, stepIndex } from '@shared/picker'
import { t } from '@renderer/i18n'
import { describeStatus, explainRegError } from '@renderer/lib/accounts'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useServersStore } from '@renderer/stores/servers'
import { useTagsStore } from '@renderer/stores/tags'
import Icon from '../icons/Icon.vue'

/**
 * Seletor de contas, aberto pelo avatar da barra de ícones: busca, filtro por etiqueta, contas agrupadas
 * por servidor e as ações de cada conta. Teclado (RNF-12): ↑/↓ andam pelas contas, Enter escolhe, Esc fecha,
 * Shift+F10 abre o menu da conta.
 */
const emit = defineEmits<{
    close: []
    new: []
    edit: [account: Account]
    health: [id: string]
    contacts: [id: string]
}>()

const accounts = useAccountsStore()
const servers = useServersStore()
const tags = useTagsStore()

const root = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const query = ref('')
const tagFilter = ref<string | null>(null)
/** Conta com a explicação do erro aberta ("Por quê?"). */
const why = ref<string | null>(null)
const confirmDelete = ref<string | null>(null)
/** Menu da conta (clique direito, botão ⋯ ou Shift+F10), na posição dentro do seletor. */
const menu = ref<{ account: Account; x: number; y: number } | null>(null)

const visible = computed(() => filterAccounts(accounts.accounts, query.value, tagFilter.value, tags.tags))
const groups = computed(() => groupByServer(visible.value, servers.all))
/** Na ordem da tela, para as setas. */
const flat = computed(() => groups.value.flatMap((g) => g.accounts))
const active = ref<string | null>(null)

const state = (a: Account): string => accounts.statusOf(a.id).state
const canRegister = (a: Account): boolean => ['disconnected', 'error'].includes(state(a))
const tagsOf = (a: Account) => a.tagIds.map((id) => tags.byId(id)).filter((tag) => tag !== undefined)

function statusText(a: Account): string {
    const retry = accounts.retryOf(a.id)
    const base = describeStatus(accounts.statusOf(a.id))
    if (!retry) return base
    const max = retry.max ? t('picker.de_max', { max: retry.max }) : ''
    return `${base} ${t('picker.tentando', { attempt: retry.attempt, max })}`
}

function groupTitle(server: (typeof groups.value)[number]['server']): string {
    if (!server) return t('picker.sem_servidor')
    if (server.id === SIMULATED_SERVER_ID) return server.name
    return `${server.name} · ${server.transport.toUpperCase()}`
}

function choose(a: Account): void {
    accounts.setCurrent(a.id)
    emit('close')
}

function toggleRegister(a: Account): void {
    if (canRegister(a)) void accounts.register(a.id)
    else void accounts.unregister(a.id)
}

function rowButton(id: string): HTMLButtonElement | null {
    return root.value?.querySelector<HTMLButtonElement>(`[data-account="${CSS.escape(id)}"] .pick`) ?? null
}

/** ↑/↓ andam pelas contas visíveis, e o foco vai junto, para os leitores de tela anunciarem a linha. */
function move(delta: 1 | -1): void {
    const list = flat.value
    const index = list.findIndex((a) => a.id === active.value)
    const next = list[stepIndex(index, delta, list.length)]
    if (!next) return
    active.value = next.id
    rowButton(next.id)?.focus()
}

function onKey(event: KeyboardEvent): void {
    if (menu.value) return
    if (event.key === 'Escape') {
        event.stopPropagation()
        if (confirmDelete.value) confirmDelete.value = null
        else emit('close')
    } else if (event.key === 'ArrowDown') move(1)
    else if (event.key === 'ArrowUp') move(-1)
    else if (event.key === 'Enter' && event.target === search.value) {
        const target = flat.value.find((a) => a.id === active.value) ?? flat.value[0]
        if (target) choose(target)
    } else return
    event.preventDefault()
}

// ─── Menu da conta ─────────────────────────────────────────────────────
const menuItems = computed(() => {
    const a = menu.value?.account
    if (!a) return []
    return [
        { label: t('picker.duplicar'), run: () => void accounts.duplicate(a.id) },
        { label: t('picker.saude'), run: () => emit('health', a.id) },
        { label: t('picker.contatos'), run: () => emit('contacts', a.id) },
        { label: t('picker.excluir'), run: () => (confirmDelete.value = a.id), danger: true }
    ]
})

async function openMenu(account: Account, x: number, y: number): Promise<void> {
    const box = root.value?.getBoundingClientRect()
    if (!box) return
    // Dentro do seletor, sem passar da borda direita nem de baixo.
    menu.value = {
        account,
        x: Math.min(x - box.left, box.width - 170),
        y: Math.min(y - box.top, box.height - 150)
    }
    await nextTick()
    root.value?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
}

function openMenuAt(account: Account, el: HTMLElement): void {
    const r = el.getBoundingClientRect()
    void openMenu(account, r.left, r.bottom + 2)
}

function closeMenu(): void {
    const id = menu.value?.account.id
    menu.value = null
    if (id) rowButton(id)?.focus()
}

function runItem(item: (typeof menuItems.value)[number]): void {
    const id = menu.value?.account.id
    menu.value = null
    item.run()
    // Excluir pede confirmação na própria linha: o foco vai para o botão de confirmar.
    if (confirmDelete.value === id)
        void nextTick(() => root.value?.querySelector<HTMLElement>('.confirm .btn.stop')?.focus())
}

function onMenuKey(event: KeyboardEvent): void {
    const items = [...(root.value?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
        event.stopPropagation()
        closeMenu()
    } else if (event.key === 'ArrowDown') items[stepIndex(index, 1, items.length)]?.focus()
    else if (event.key === 'ArrowUp') items[stepIndex(index, -1, items.length)]?.focus()
    else if (event.key === 'Home') items[0]?.focus()
    else if (event.key === 'End') items.at(-1)?.focus()
    else return
    event.preventDefault()
}

function onRowKey(event: KeyboardEvent, account: Account): void {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault()
        openMenuAt(account, event.currentTarget as HTMLElement)
    }
}

function onPointer(event: MouseEvent): void {
    if (menu.value && !(event.target as HTMLElement).closest('[role=menu]')) menu.value = null
}

async function remove(id: string): Promise<void> {
    confirmDelete.value = null
    await accounts.remove(id)
    search.value?.focus()
}

onMounted(() => {
    active.value = accounts.current?.id ?? null
    search.value?.focus()
})
onUnmounted(() => (menu.value = null))
</script>

<template>
    <div
        ref="root"
        class="picker"
        role="dialog"
        :aria-label="$t('picker.contas')"
        @keydown="onKey"
        @mousedown="onPointer"
    >
        <div class="search">
            <Icon name="search" class="search-icon" />
            <input
                ref="search"
                v-model="query"
                type="search"
                :placeholder="$t('picker.procurar_dica')"
                :aria-label="$t('picker.procurar')"
                autocomplete="off"
                spellcheck="false"
            />
        </div>

        <div v-if="tags.tags.length" class="chips" role="group" :aria-label="$t('picker.etiquetas')">
            <button type="button" class="chip" :aria-pressed="tagFilter === null" @click="tagFilter = null">
                {{ $t('picker.todas') }}
            </button>
            <button
                v-for="tag in tags.tags"
                :key="tag.id"
                type="button"
                class="chip"
                :aria-pressed="tagFilter === tag.id"
                :style="{ '--tag': tag.color }"
                @click="tagFilter = tagFilter === tag.id ? null : tag.id"
            >
                <i class="swatch" aria-hidden="true"></i>{{ tag.name }}
            </button>
        </div>

        <div class="list">
            <section v-for="group in groups" :key="group.server?.id ?? ''" class="group">
                <h3 class="group-head">
                    <span class="group-name">{{ groupTitle(group.server) }}</span>
                    <span class="count tabular">{{
                        group.accounts.length === 1
                            ? $t('picker.conta_1')
                            : $t('picker.n_contas', { n: group.accounts.length })
                    }}</span>
                </h3>
                <ul>
                    <li
                        v-for="a in group.accounts"
                        :key="a.id"
                        class="row"
                        :class="{ current: accounts.current?.id === a.id, failed: state(a) === 'error' }"
                        :data-account="a.id"
                        @contextmenu.prevent="openMenu(a, $event.clientX, $event.clientY)"
                    >
                        <button
                            type="button"
                            class="pick"
                            :aria-current="accounts.current?.id === a.id ? 'true' : undefined"
                            @click="choose(a)"
                            @focus="active = a.id"
                            @keydown="onRowKey($event, a)"
                        >
                            <span class="dot" :class="state(a)" aria-hidden="true"></span>
                            <span class="who">
                                <span class="line">
                                    <span class="name">{{ a.name }}</span>
                                    <span
                                        v-for="tag in tagsOf(a)"
                                        :key="tag.id"
                                        class="tag"
                                        :style="{ '--tag': tag.color }"
                                        ><i class="swatch" aria-hidden="true"></i>{{ tag.name }}</span
                                    >
                                </span>
                                <span class="meta">
                                    <span class="mono">{{ a.extension }}</span> · {{ statusText(a) }}
                                </span>
                            </span>
                            <Icon v-if="accounts.current?.id === a.id" name="check" class="mark" />
                            <span v-if="accounts.current?.id === a.id" class="sr">{{ $t('picker.atual') }}</span>
                        </button>
                        <!-- Aparecem ao passar o mouse e também com o foco do teclado na linha (RNF-12). -->
                        <span class="acts">
                            <button
                                v-if="explainRegError(accounts.statusOf(a.id))"
                                type="button"
                                class="act why"
                                :aria-expanded="why === a.id"
                                :aria-label="$t('picker.por_que_nome', { name: a.name })"
                                @click="why = why === a.id ? null : a.id"
                            >
                                {{ $t('picker.por_que') }}
                            </button>
                            <button
                                type="button"
                                class="act"
                                :aria-label="
                                    canRegister(a)
                                        ? $t('picker.registrar_nome', { name: a.name })
                                        : $t('picker.desregistrar_nome', { name: a.name })
                                "
                                @click="toggleRegister(a)"
                            >
                                {{ canRegister(a) ? $t('picker.registrar') : $t('picker.desregistrar') }}
                            </button>
                            <button
                                type="button"
                                class="act"
                                :aria-label="$t('picker.editar_nome', { name: a.name })"
                                @click="emit('edit', a)"
                            >
                                {{ $t('picker.editar') }}
                            </button>
                            <button
                                type="button"
                                class="act more"
                                aria-haspopup="menu"
                                :aria-expanded="menu?.account.id === a.id"
                                :aria-label="$t('picker.mais_acoes_de', { name: a.name })"
                                :title="$t('picker.mais_acoes_de', { name: a.name })"
                                @click="openMenuAt(a, $event.currentTarget as HTMLElement)"
                            >
                                <Icon name="more" />
                            </button>
                        </span>
                        <div
                            v-if="why === a.id && explainRegError(accounts.statusOf(a.id))"
                            class="why-box"
                            role="status"
                        >
                            <b>{{ explainRegError(accounts.statusOf(a.id))?.title }}</b>
                            <span>{{ explainRegError(accounts.statusOf(a.id))?.hint }}</span>
                        </div>
                        <div v-if="confirmDelete === a.id" class="confirm" role="group">
                            <span>{{ $t('picker.excluir_mesmo', { name: a.name }) }}</span>
                            <button type="button" class="btn small stop" @click="remove(a.id)">
                                {{ $t('picker.excluir') }}
                            </button>
                            <button type="button" class="btn small" @click="confirmDelete = null">
                                {{ $t('picker.cancelar') }}
                            </button>
                        </div>
                    </li>
                </ul>
            </section>
            <p v-if="accounts.loaded && accounts.accounts.length === 0" class="empty">{{ $t('picker.vazio') }}</p>
            <p v-else-if="flat.length === 0" class="empty">{{ $t('picker.nada') }}</p>
        </div>

        <footer class="foot">
            <button type="button" class="link strong" @click="emit('new')">
                <Icon name="plus" />{{ $t('picker.nova') }}
            </button>
            <span class="spacer"></span>
            <button type="button" class="link" @click="accounts.registerAll()">
                {{ $t('picker.registrar_todas') }}
            </button>
            <button type="button" class="link" @click="accounts.unregisterAll()">
                {{ $t('picker.desregistrar_todas') }}
            </button>
        </footer>

        <ul
            v-if="menu"
            class="menu"
            role="menu"
            :aria-label="$t('picker.mais_acoes_de', { name: menu.account.name })"
            :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
            @keydown="onMenuKey"
        >
            <li v-for="item in menuItems" :key="item.label" role="none">
                <button type="button" role="menuitem" :class="{ danger: item.danger }" @click="runItem(item)">
                    {{ item.label }}
                </button>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.picker {
    position: absolute;
    left: 66px;
    top: 8px;
    width: 372px;
    max-height: min(560px, calc(100% - 16px));
    z-index: 30;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
    transform-origin: 0 24px;
}
@media (prefers-reduced-motion: no-preference) {
    .picker {
        animation: pop-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
}
@keyframes pop-in {
    from {
        opacity: 0;
        transform: translateX(-6px) scale(0.98);
    }
}

/* Busca */
.search {
    position: relative;
    margin: 8px 8px 6px;
}
.search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 14px;
    pointer-events: none;
}
.search input {
    width: 100%;
    height: 32px;
    padding: 0 10px 0 30px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-2);
    outline: none;
    transition:
        border-color 120ms,
        box-shadow 120ms,
        background 120ms;
}
.search input:focus {
    border-color: var(--accent);
    background: var(--panel);
    box-shadow: 0 0 0 3px var(--focus-ring);
}

/* Etiquetas */
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 8px 8px;
    border-bottom: 1px solid var(--line);
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 9px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    font-size: 11.5px;
    cursor: pointer;
    transition:
        background 120ms,
        border-color 120ms;
}
.chip:hover {
    background: var(--panel-2);
}
/* Escolhida: fundo tingido e borda cheia, não só a cor (RNF-12). */
.chip[aria-pressed='true'] {
    background: var(--selected);
    border-color: var(--accent);
    font-weight: 600;
}
.swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--tag, var(--muted));
    flex: none;
}

/* Lista */
.list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding-bottom: 4px;
}
.group-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 6px 12px 4px;
    background: var(--panel);
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
}
.group-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.count {
    font-weight: 500;
}
ul {
    list-style: none;
    margin: 0;
    padding: 0 4px;
}
/* Linha em flex: a conta à esquerda e as ações à direita, que só ocupam espaço quando aparecem. */
.row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    border-radius: var(--radius);
    transition: background 100ms;
}
.row + .row {
    margin-top: 1px;
}
.pick {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 5px 8px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 100ms;
}
.row:hover,
.row:focus-within {
    background: var(--panel-2);
}
.pick:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}
/* Conta atual: fundo de seleção, barra à esquerda e o ✓ (cor e forma). */
.row.current {
    background: var(--selected);
    box-shadow: inset 3px 0 0 var(--accent);
}
.who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
}
.name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.meta {
    font-size: 11.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.row.failed .meta {
    color: var(--bad-text);
}
/* Nome e etiquetas na mesma linha: o lado direito fica livre para as ações. */
.line {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}
/* Sem espaço, a etiqueta encolhe antes do nome. */
.name {
    flex: 0 0 auto;
    max-width: 100%;
}
.tag {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    padding: 0 6px;
    height: 18px;
    border-radius: 999px;
    background: var(--raise);
    white-space: nowrap;
}
.tag .swatch {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}
.mark {
    color: var(--accent);
    font-size: 15px;
}
.sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

/* Ações da linha: aparecem com o mouse ou com o foco do teclado na linha (RNF-12). Escondidas, ficam com
   largura zero mas continuam na ordem do Tab, para o Shift+Tab também chegar nelas. "Por quê?" fica
   sempre à vista numa conta com erro: é o estado dela, não uma ação escondida. */
.acts {
    display: flex;
    align-items: center;
    padding-right: 6px;
}
.row:not(:hover, :focus-within) .act:not(.why) {
    width: 0;
    padding: 0;
    margin: 0;
    border-width: 0;
    opacity: 0;
    overflow: hidden;
}
.act {
    display: inline-flex;
    align-items: center;
    margin-left: 3px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel);
    font-size: 11.5px;
    cursor: pointer;
    transition:
        background 100ms,
        border-color 100ms;
}
.act:hover {
    border-color: var(--line-strong);
    background: var(--panel-2);
}
.act.more {
    padding: 0 6px;
    font-size: 14px;
}
.act.why {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--line));
    color: var(--bad-text);
}
.why-box,
.confirm {
    flex-basis: calc(100% - 36px);
    margin: 2px 8px 6px 28px;
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    font-size: 12px;
}
.why-box {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--bad-soft);
    border: 1px solid color-mix(in srgb, var(--bad) 30%, transparent);
}
.why-box b {
    color: var(--bad-text);
}
.confirm {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--panel-2);
    border: 1px solid var(--line);
}
.confirm span {
    flex: 1;
}
.empty {
    margin: 12px;
    color: var(--muted);
}

/* Rodapé */
.foot {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px;
    border-top: 1px solid var(--line);
    background: var(--panel-2);
}
.spacer {
    flex: 1;
}
.link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
}
.link:hover {
    background: var(--raise);
    color: var(--fg);
}
.link.strong {
    color: var(--accent-text);
    font-weight: 600;
}

/* Menu da conta */
.menu {
    position: absolute;
    z-index: 2;
    min-width: 160px;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
}
.menu button {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
}
.menu button:hover,
.menu button:focus-visible {
    background: var(--panel-2);
    outline: none;
}
.menu button:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
}
.menu .danger {
    color: var(--bad-text);
}
</style>
