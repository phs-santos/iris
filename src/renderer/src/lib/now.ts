import { ref } from 'vue'

/** Relógio compartilhado que avança a cada segundo, para cronômetros de chamada. */
export const now = ref(Date.now())
setInterval(() => (now.value = Date.now()), 1000)

export function duration(fromMs: number, toMs: number): string {
    const total = Math.max(0, Math.floor((toMs - fromMs) / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
