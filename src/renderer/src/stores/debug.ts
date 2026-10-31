import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useLogStore } from './log'

export type DebugTab = 'sip' | 'flow' | 'log' | 'health'

const OPEN_KEY = 'iris.depuracao-aberta'
const WIDTH_KEY = 'iris.depuracao-tamanho'
/** Larguras da gaveta aberta: começa larga o bastante para o SIP bruto, e dá para arrastar. */
export const DEBUG_WIDTH = { min: 300, initial: 420, max: 900 }

function read(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}
function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // sem armazenamento local, a gaveta só não lembra o estado
    }
}

/** Barra de ícones, discar e o mínimo da coluna de chamadas: o que a gaveta nunca cobre. */
const RESERVED = 60 + 260 + 320

export function clampWidth(width: number, windowWidth = Infinity): number {
    const max = Math.min(DEBUG_WIDTH.max, Math.max(DEBUG_WIDTH.min, windowWidth - RESERVED))
    return Math.round(Math.min(max, Math.max(DEBUG_WIDTH.min, width)))
}

/** Estado da gaveta de depuração: aberta ou na tira, a aba, a largura e a mensagem SIP a mostrar. */
export const useDebugStore = defineStore('debug', () => {
    const open = ref(read(OPEN_KEY) === '1')
    const tab = ref<DebugTab>('sip')
    const width = ref(clampWidth(Number(read(WIDTH_KEY)) || DEBUG_WIDTH.initial))
    /** Linha do SIP pedida de fora (ex.: a atividade recente da conta): a aba SIP abre nela. */
    const focusEntryId = ref<number | null>(null)

    watch(open, (value) => write(OPEN_KEY, value ? '1' : '0'))
    watch(width, (value) => write(WIDTH_KEY, String(value)))

    /** Abre numa aba; com conta, filtra por ela; com linha, mostra aquela mensagem. */
    function show(target: DebugTab, accountId?: string | null, entryId?: number): void {
        if (accountId !== undefined) useLogStore().accountFilter = accountId
        tab.value = target
        focusEntryId.value = entryId ?? null
        open.value = true
    }

    return { open, tab, width, focusEntryId, show }
})
