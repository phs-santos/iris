<script setup lang="ts">
/**
 * Ícones de traço da Íris (SVG, sem fonte nem emoji do sistema). Sempre decorativos: o nome da ação
 * fica no texto ou no `aria-label` do botão (RNF-12).
 */
defineProps<{ name: IconName }>()
</script>

<template>
    <svg
        class="icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        <g
            v-if="name === 'phone' || name === 'hangup'"
            :transform="name === 'hangup' ? 'rotate(135 12 12)' : undefined"
        >
            <path
                d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"
            />
        </g>
        <template v-else-if="name === 'record'">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
        </template>
        <template v-else-if="name === 'gear'">
            <circle cx="12" cy="12" r="3" />
            <path
                d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            />
        </template>
        <template v-else-if="name === 'book'">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
        </template>
        <template v-else-if="name === 'search'">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
        </template>
        <template v-else-if="name === 'mic'">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
        </template>
        <path v-else-if="name === 'pause'" d="M9 5v14M15 5v14" />
        <template v-else-if="name === 'grid'">
            <circle v-for="(c, i) in GRID" :key="i" :cx="c[0]" :cy="c[1]" r="1" />
        </template>
        <path v-else-if="name === 'transfer'" d="M4 8h14l-4-4M20 16H6l4 4" />
        <path v-else-if="name === 'flow'" d="M4 4h6v6H4zM14 14h6v6h-6zM7 10v4a2 2 0 0 0 2 2h5" />
        <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
        <path v-else-if="name === 'chevron'" d="M9 6l6 6-6 6" />
        <path v-else-if="name === 'close'" d="M6 6l12 12M18 6L6 18" />
        <path v-else-if="name === 'check'" d="M5 12.5l4.5 4.5L19 7.5" />
        <template v-else-if="name === 'more'">
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
        </template>
        <path
            v-else-if="name === 'folder'"
            d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        />
        <path
            v-else-if="name === 'user-plus'"
            d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6"
        />
        <path
            v-else-if="name === 'refresh'"
            d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"
        />
        <path v-else-if="name === 'erase'" d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM12 9l6 6M18 9l-6 6" />
    </svg>
</template>

<script lang="ts">
export type IconName =
    | 'phone'
    | 'hangup'
    | 'mic'
    | 'pause'
    | 'grid'
    | 'transfer'
    | 'record'
    | 'gear'
    | 'search'
    | 'flow'
    | 'plus'
    | 'chevron'
    | 'close'
    | 'erase'
    | 'book'
    | 'more'
    | 'check'
    | 'folder'
    | 'user-plus'
    | 'refresh'

/** Os nove pontos do teclado de DTMF. */
const GRID = [6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => [x, y]))
</script>

<style scoped>
.icon {
    width: 1em;
    height: 1em;
    display: block;
    flex: none;
}
</style>
