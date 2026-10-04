<script setup lang="ts">
/** Ícones de traço do modo Telefone, desenhados aqui para não depender de fonte nem de emoji do sistema. */
defineProps<{ name: 'phone' | 'hangup' | 'mic' | 'pause' | 'grid' | 'transfer' | 'plus' | 'log' | 'x' | 'erase' }>()
</script>

<template>
    <svg
        class="phone-icon"
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
        <template v-else-if="name === 'mic'">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
        </template>
        <template v-else-if="name === 'pause'">
            <path d="M9 5v14M15 5v14" />
        </template>
        <template v-else-if="name === 'grid'">
            <circle cx="6" cy="6" r="1" />
            <circle cx="12" cy="6" r="1" />
            <circle cx="18" cy="6" r="1" />
            <circle cx="6" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="18" cy="12" r="1" />
            <circle cx="6" cy="18" r="1" />
            <circle cx="12" cy="18" r="1" />
            <circle cx="18" cy="18" r="1" />
        </template>
        <template v-else-if="name === 'transfer'">
            <path d="M4 8h14l-4-4M20 16H6l4 4" />
        </template>
        <template v-else-if="name === 'plus'">
            <path d="M12 5v14M5 12h14" />
        </template>
        <template v-else-if="name === 'log'">
            <path d="M4 6h16M4 12h16M4 18h10" />
        </template>
        <template v-else-if="name === 'x'">
            <path d="M6 6l12 12M18 6L6 18" />
        </template>
        <template v-else-if="name === 'erase'">
            <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM12 9l6 6M18 9l-6 6" />
        </template>
    </svg>
</template>

<style scoped>
.phone-icon {
    width: 1em;
    height: 1em;
    display: block;
}
</style>
