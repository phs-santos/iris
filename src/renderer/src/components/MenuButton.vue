<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'

/**
 * Botão que abre um menu de ações (padrão "menu button" da WAI-ARIA, RNF-12): setas andam pelos itens,
 * Esc fecha e devolve o foco ao botão, clicar fora fecha.
 */
interface MenuItem {
    label: string
    action: () => void
    danger?: boolean
}

defineProps<{ label: string; items: MenuItem[]; text?: string }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)

const itemsEl = (): HTMLElement[] => [...(root.value?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]

function onOutside(event: MouseEvent): void {
    if (!root.value?.contains(event.target as Node)) close(false)
}

async function show(focus: 'first' | 'last' = 'first'): Promise<void> {
    open.value = true
    document.addEventListener('mousedown', onOutside)
    await nextTick()
    const items = itemsEl()
    ;(focus === 'first' ? items[0] : items.at(-1))?.focus()
}

function close(returnFocus = true): void {
    open.value = false
    document.removeEventListener('mousedown', onOutside)
    if (returnFocus) trigger.value?.focus()
}

function run(item: MenuItem): void {
    close()
    item.action()
}

function onMenuKey(event: KeyboardEvent): void {
    const items = itemsEl()
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
        // Não deixa o Esc fechar também uma janela que esteja por baixo.
        event.stopPropagation()
        close()
    } else if (event.key === 'ArrowDown') items[(index + 1) % items.length]?.focus()
    else if (event.key === 'ArrowUp') items[(index - 1 + items.length) % items.length]?.focus()
    else if (event.key === 'Home') items[0]?.focus()
    else if (event.key === 'End') items.at(-1)?.focus()
    else if (event.key === 'Tab') close(false)
    else return
    if (event.key !== 'Tab') event.preventDefault()
}

function onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        void show(event.key === 'ArrowDown' ? 'first' : 'last')
    }
}

onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>

<template>
    <span ref="root" class="menu-wrap">
        <button
            ref="trigger"
            class="btn small"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="open"
            :aria-label="text ? undefined : label"
            :title="label"
            @click="open ? close() : show()"
            @keydown="onTriggerKey"
        >
            {{ text ?? '⋯' }}
        </button>
        <div v-if="open" class="menu" role="menu" :aria-label="label" @keydown="onMenuKey">
            <button
                v-for="item in items"
                :key="item.label"
                type="button"
                role="menuitem"
                tabindex="-1"
                class="item"
                :class="{ danger: item.danger }"
                @click="run(item)"
            >
                {{ item.label }}
            </button>
        </div>
    </span>
</template>

<style scoped>
.menu-wrap {
    position: relative;
    display: inline-flex;
}
.menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 40;
    min-width: 170px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--raise);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}
.item {
    text-align: left;
    border: 0;
    background: transparent;
    border-radius: 5px;
    padding: 6px 10px;
    cursor: pointer;
    white-space: nowrap;
}
.item:hover,
.item:focus-visible {
    background: var(--panel-2);
    outline: none;
}
.item:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
}
.item.danger {
    color: var(--bad-text);
}
</style>
