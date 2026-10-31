<script lang="ts">
import type { Contact } from '@shared/contacts'

/** Uma opção da lista: um contato da conta atual, ou "+ Salvar como contato" no fim. */
export type Suggestion = { kind: 'contact'; contact: Contact } | { kind: 'save'; text: string }
</script>

<script setup lang="ts">
import { plain } from '@shared/contacts'
import Icon from '../icons/Icon.vue'

/** Lista de sugestões do discador (`role="listbox"`); o foco fica no campo, que aponta a opção marcada. */
const props = defineProps<{ options: Suggestion[]; active: number; query: string; label: string }>()
const emit = defineEmits<{ choose: [option: Suggestion]; hover: [index: number] }>()

/** Separa o trecho que casa com o que foi digitado, para destacar sem montar HTML. */
function parts(text: string): [string, string, string] {
    const q = plain(props.query.trim())
    const at = q ? plain(text).indexOf(q) : -1
    if (at < 0) return [text, '', '']
    return [text.slice(0, at), text.slice(at, at + q.length), text.slice(at + q.length)]
}

const initials = (name: string): string =>
    name
        .split(/\s+/)
        .filter((w) => /\p{L}/u.test(w))
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('') || '#'
</script>

<template>
    <ul class="suggestions" role="listbox" :aria-label="label">
        <li
            v-for="(option, i) in options"
            :id="`dial-opt-${i}`"
            :key="option.kind === 'contact' ? option.contact.id : 'save'"
            class="option"
            :class="[option.kind, { active: i === active }]"
            role="option"
            :aria-selected="i === active"
            @pointerdown.prevent
            @pointerenter="emit('hover', i)"
            @click="emit('choose', option)"
        >
            <template v-if="option.kind === 'contact'">
                <span class="badge" aria-hidden="true">{{ initials(option.contact.name) }}</span>
                <span class="name">
                    <template v-for="(part, n) in parts(option.contact.name)" :key="n">
                        <mark v-if="n === 1">{{ part }}</mark>
                        <template v-else>{{ part }}</template>
                    </template>
                </span>
                <span class="num mono">
                    <template v-for="(part, n) in parts(option.contact.number)" :key="n">
                        <mark v-if="n === 1">{{ part }}</mark>
                        <template v-else>{{ part }}</template>
                    </template>
                </span>
                <Icon name="phone" class="go" />
            </template>
            <template v-else>
                <span class="badge add" aria-hidden="true"><Icon name="user-plus" /></span>
                <span class="name">{{ $t('dialPanel.salvar_como', { text: option.text }) }}</span>
            </template>
        </li>
    </ul>
</template>

<style scoped>
.suggestions {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    z-index: 15;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    max-height: 280px;
    overflow: auto;
}
@media (prefers-reduced-motion: no-preference) {
    .suggestions {
        animation: drop 110ms ease-out;
    }
}
@keyframes drop {
    from {
        opacity: 0;
        transform: translateY(-3px);
    }
}
.option {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
}
/* Marcada: fundo de seleção e barra à esquerda (cor e forma, RNF-12). */
.option.active {
    background: var(--selected);
    box-shadow: inset 2px 0 0 var(--accent);
}
.badge {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--raise);
    color: var(--muted);
    font-size: 10px;
    font-weight: 700;
    flex: none;
}
.badge.add {
    background: transparent;
    border: 1px dashed var(--line-strong);
}
.badge :deep(.icon) {
    width: 12px;
    height: 12px;
}
.name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.save .name {
    color: var(--accent-text);
    font-weight: 500;
}
.num {
    font-size: 11.5px;
    color: var(--muted);
}
mark {
    background: none;
    color: inherit;
    font-weight: 700;
}
.name mark {
    color: var(--fg);
}
.go {
    width: 13px;
    height: 13px;
    color: var(--ok);
    opacity: 0;
    flex: none;
}
.option.active .go {
    opacity: 1;
}
</style>
