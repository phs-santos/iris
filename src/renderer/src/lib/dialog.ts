import { nextTick, onMounted, onUnmounted, type Ref } from 'vue'

/** Janelas abertas, da mais antiga à de cima: o Esc fecha só a de cima (ex.: servidor aberto do cadastro de conta). */
const stack: symbol[] = []

/**
 * Comportamento comum das janelas modais (RNF-12): ao abrir, o foco vai para o primeiro campo;
 * Esc fecha mesmo com o foco fora da janela; ao fechar, o foco volta para onde estava.
 */
export function useDialog(root: Ref<HTMLElement | null>, close: () => void): void {
    let previous: HTMLElement | null = null
    const id = Symbol('janela')
    const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || stack[stack.length - 1] !== id) return
        event.preventDefault()
        close()
    }
    onMounted(async () => {
        stack.push(id)
        previous = document.activeElement as HTMLElement | null
        window.addEventListener('keydown', onKey)
        await nextTick()
        const first = root.value?.querySelector<HTMLElement>(
            'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea, .body button:not([disabled]), footer button:not([disabled])'
        )
        ;(first ?? root.value)?.focus()
    })
    onUnmounted(() => {
        stack.splice(stack.indexOf(id), 1)
        window.removeEventListener('keydown', onKey)
        previous?.focus?.()
    })
}
