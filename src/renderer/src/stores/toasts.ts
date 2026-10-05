import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
    id: number
    text: string
    kind: 'ok' | 'info' | 'bad'
}

const VISIBLE_MS = 4500
let nextId = 1

/** Avisos rápidos na tela, que somem sozinhos: o retorno de uma ação que antes só aparecia no log. */
export const useToastsStore = defineStore('toasts', () => {
    const toasts = ref<Toast[]>([])

    function show(text: string, kind: Toast['kind'] = 'ok'): void {
        const toast = { id: nextId++, text, kind }
        // No máximo três na tela: o mais antigo sai.
        toasts.value = [...toasts.value.slice(-2), toast]
        setTimeout(() => dismiss(toast.id), VISIBLE_MS)
    }

    function dismiss(id: number): void {
        toasts.value = toasts.value.filter((t) => t.id !== id)
    }

    return { toasts, show, dismiss }
})
