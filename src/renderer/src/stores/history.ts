import { defineStore } from 'pinia'
import { ref } from 'vue'
import { addHistory, type HistoryEntry } from '@shared/history'

/** Histórico de chamadas (RF-40), guardado em history.json entre uma abertura e outra. */
export const useHistoryStore = defineStore('history', () => {
    const entries = ref<HistoryEntry[]>([])

    async function load(): Promise<void> {
        entries.value = await window.iris.history.load()
    }

    function persist(): void {
        // Nos testes de unidade das chamadas não há processo principal para gravar.
        void window.iris.history?.save(JSON.parse(JSON.stringify(entries.value))).catch(() => undefined)
    }

    function add(entry: HistoryEntry): void {
        entries.value = addHistory(entries.value, entry)
        persist()
    }

    function clear(): void {
        entries.value = []
        persist()
    }

    return { entries, load, add, clear }
})
