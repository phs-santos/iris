<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { useScenariosStore } from '@renderer/stores/scenarios'
import { searchContacts, digits } from '@shared/contacts'
import { t } from '@renderer/i18n'

/**
 * Paleta de comandos (Ctrl/Cmd+K): digite um número, um contato, uma conta, um cenário ou uma ação e
 * tecle Enter. As ações da janela (abrir telas, trocar de aba) vêm do App.
 */
export interface PaletteAction {
    label: string
    hint?: string
    run: () => void
}
const props = defineProps<{ actions: PaletteAction[] }>()
const emit = defineEmits<{ close: []; tab: [tab: 'phone' | 'scenarios'] }>()
const dialogEl = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const calls = useCallsStore()
const contacts = useContactsStore()
const scenarios = useScenariosStore()
const query = ref('')
const active = ref(0)

const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A conta de onde ligar: a escolhida no discador, se registrada; senão, a primeira registrada. */
function dialFrom(): string | undefined {
    const ok = (id: string | null | undefined): boolean => Boolean(id) && accounts.statusOf(id!).state === 'registered'
    if (ok(accounts.selectedId)) return accounts.selectedId!
    return accounts.accounts.find((a) => ok(a.id))?.id
}

function dial(number: string, accountId?: string): void {
    const from = accountId && accounts.statusOf(accountId).state === 'registered' ? accountId : dialFrom()
    if (!from) return
    accounts.selectedId = from
    emit('tab', 'phone')
    void calls.dial(from, number).catch(() => undefined)
}

const results = computed<PaletteAction[]>(() => {
    const q = plain(query.value.trim())
    const list: PaletteAction[] = []
    // Um número digitado vira "Ligar para".
    if (digits(query.value).length >= 2 && /^[\d\s()+*#-]+$/.test(query.value.trim()))
        list.push({
            label: t('commandPalette.ligar_para', { number: query.value.trim() }),
            run: () => dial(query.value.trim())
        })
    for (const c of searchContacts(contacts.contacts, query.value).slice(0, q ? 6 : 3))
        list.push({
            label: t('commandPalette.ligar_para', { number: c.name }),
            hint: c.number,
            run: () => dial(c.number, c.accountId)
        })
    for (const a of accounts.accounts) {
        if (q && !plain(`${a.name} ${a.extension} ${a.domain}`).includes(q)) continue
        const registered = accounts.statusOf(a.id).state === 'registered'
        list.push({
            label: registered
                ? t('commandPalette.desregistrar', { name: a.name })
                : t('commandPalette.registrar', { name: a.name }),
            hint: `${a.extension}@${a.domain}`,
            run: () => void (registered ? accounts.unregister(a.id) : accounts.register(a.id))
        })
    }
    for (const s of scenarios.scenarios) {
        if (q && !plain(s.name).includes(q)) continue
        list.push({
            label: t('commandPalette.rodar_cenario', { name: s.name }),
            run: () => {
                emit('tab', 'scenarios')
                scenarios.selectedId = s.id
                void scenarios.run(s.id)
            }
        })
    }
    for (const action of props.actions)
        if (!q || plain(`${action.label} ${action.hint ?? ''}`).includes(q)) list.push(action)
    return list.slice(0, 40)
})

function run(index = active.value): void {
    const item = results.value[index]
    if (!item) return
    emit('close')
    item.run()
}

function onKey(event: KeyboardEvent): void {
    const n = results.value.length
    if (event.key === 'ArrowDown') active.value = n ? (active.value + 1) % n : 0
    else if (event.key === 'ArrowUp') active.value = n ? (active.value + n - 1) % n : 0
    else if (event.key === 'Enter') run()
    else return
    event.preventDefault()
    void nextTick(() => dialogEl.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}

onMounted(() => input.value?.focus())
</script>

<template>
    <div class="overlay top" @click.self="emit('close')">
        <div
            ref="dialogEl"
            class="dialog palette"
            role="dialog"
            aria-modal="true"
            :aria-label="$t('commandPalette.titulo')"
            tabindex="-1"
        >
            <input
                ref="input"
                v-model="query"
                class="input search"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                :aria-activedescendant="results.length ? `palette-${active}` : undefined"
                :aria-label="$t('commandPalette.titulo')"
                :placeholder="$t('commandPalette.placeholder')"
                @input="active = 0"
                @keydown="onKey"
            />
            <ul id="palette-list" class="list" role="listbox">
                <li
                    v-for="(item, i) in results"
                    :id="`palette-${i}`"
                    :key="`${item.label}-${i}`"
                    role="option"
                    :aria-selected="i === active"
                    :class="{ on: i === active }"
                    @mousemove="active = i"
                    @click="run(i)"
                >
                    <span>{{ item.label }}</span>
                    <small v-if="item.hint" class="mono">{{ item.hint }}</small>
                </li>
                <li v-if="!results.length" class="empty">{{ $t('commandPalette.nada') }}</li>
            </ul>
            <p class="keys">{{ $t('commandPalette.teclas') }}</p>
        </div>
    </div>
</template>

<style scoped>
.overlay.top {
    align-items: flex-start;
    padding-top: 12vh;
}
.palette {
    width: min(560px, 100%);
    padding: 10px;
    gap: 8px;
}
.search {
    width: 100%;
    font-size: 15px;
    padding: 10px 12px;
}
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 50vh;
    overflow: auto;
}
.list li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
}
.list li.on {
    background: color-mix(in srgb, var(--accent) 22%, var(--panel));
}
.list small {
    color: var(--muted);
}
/* Na linha escolhida o fundo fica mais forte; a dica acompanha o texto para manter o contraste. */
.list li.on small {
    color: var(--fg);
}
.empty {
    color: var(--muted);
    cursor: default;
}
.keys {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
}
</style>
