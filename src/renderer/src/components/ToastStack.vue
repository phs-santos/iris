<script setup lang="ts">
import { useToastsStore } from '@renderer/stores/toasts'

/** Avisos rápidos no canto da janela; leitores de tela anunciam cada um. */
const toasts = useToastsStore()
</script>

<template>
    <div class="toasts" role="status" aria-live="polite">
        <div v-for="toast in toasts.toasts" :key="toast.id" class="toast" :class="toast.kind">
            <span>{{ toast.text }}</span>
            <button class="close" :aria-label="$t('toastStack.fechar')" @click="toasts.dismiss(toast.id)">✕</button>
        </div>
    </div>
</template>

<style scoped>
.toasts {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(420px, calc(100vw - 32px));
    pointer-events: none;
}
.toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    background: var(--panel-2);
    color: var(--fg);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.toast.ok {
    border-left-color: var(--ok);
}
.toast.bad {
    border-left-color: var(--bad);
}
.toast span {
    flex: 1;
    overflow-wrap: anywhere;
}
.close {
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
}
@media (prefers-reduced-motion: no-preference) {
    .toast {
        animation: toast-in 0.18s ease-out;
    }
}
@keyframes toast-in {
    from {
        opacity: 0;
        transform: translateY(6px);
    }
}
</style>
