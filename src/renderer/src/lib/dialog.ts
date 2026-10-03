import { nextTick, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Comportamento comum das janelas modais (RNF-12): ao abrir, o foco vai para o primeiro campo;
 * Esc fecha mesmo com o foco fora da janela; ao fechar, o foco volta para onde estava.
 */
export function useDialog(root: Ref<HTMLElement | null>, close: () => void): void {
    let previous: HTMLElement | null = null
    const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        close()
    }
    onMounted(async () => {
        previous = document.activeElement as HTMLElement | null
        window.addEventListener('keydown', onKey)
        await nextTick()
        const first = root.value?.querySelector<HTMLElement>(
            'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea, .body button:not([disabled]), footer button:not([disabled])'
        )
        ;(first ?? root.value)?.focus()
    })
    onUnmounted(() => {
        window.removeEventListener('keydown', onKey)
        previous?.focus?.()
    })
}
