import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAccountsStore } from './accounts'
import { useCallsStore, type CallView } from './calls'
import { formatEntry, useLogStore, type LogEntry } from './log'

/** Pedido de explicação aberto na tela (RF-38): a pergunta e as linhas do log, ainda sem máscara. */
export interface AiAsk {
    title: string
    question: string
    lines: string[]
}

/** Quantas linhas da conta entram em "Por que não registrou?". */
const ACCOUNT_LINES = 150
/** Folga antes e depois da chamada, para pegar o INVITE e o BYE. */
const CALL_MARGIN_MS = 2000

export const useAiStore = defineStore('ai', () => {
    const accounts = useAccountsStore()
    const calls = useCallsStore()
    const log = useLogStore()
    const ask = ref<AiAsk | null>(null)

    const format = (entries: LogEntry[]): string[] => entries.map((e) => formatEntry(e, accounts.nameOf))
    const relevant = (e: LogEntry): boolean => e.level !== 'debug'

    function explainLog(entries: LogEntry[]): void {
        ask.value = {
            title: 'Explicar o log',
            question: 'Explique o que este trecho do log mostra e aponte qualquer problema.',
            lines: format(entries)
        }
    }

    function explainCall(call: CallView): void {
        const from = call.startedAt - CALL_MARGIN_MS
        const to = (call.endedAt ?? Date.now()) + CALL_MARGIN_MS
        const entries = log.entries.filter(
            (e) => e.accountId === call.accountId && e.ts >= from && e.ts <= to && relevant(e)
        )
        const direction = call.direction === 'out' ? `feita para ${call.remote}` : `recebida de ${call.remote}`
        ask.value = {
            title: 'Explicar a chamada',
            question: `Explique o que aconteceu nesta chamada ${direction}, passo a passo${call.failed ? ', e por que ela falhou' : ''}.`,
            lines: format(entries)
        }
    }

    function explainAccount(accountId: string): void {
        const entries = log.entries.filter((e) => e.accountId === accountId && relevant(e)).slice(-ACCOUNT_LINES)
        ask.value = {
            title: 'Por que não registrou?',
            question: 'Esta conta não conseguiu se registrar no PBX. Explique o motivo mais provável e como resolver.',
            lines: format(entries)
        }
    }

    /** O que o app sabe que identifica o ambiente; a máscara troca tudo isto por marcadores. */
    function known(): { numbers: string[]; hosts: string[]; names: string[] } {
        const numbers: string[] = []
        const hosts: string[] = []
        const names: string[] = []
        for (const a of accounts.accounts) {
            numbers.push(a.extension, a.authUsername ?? '', ...a.quickDials.map((q) => q.number))
            names.push(a.name, a.displayName ?? '')
            hosts.push(a.domain)
            try {
                hosts.push(new URL(a.wssUrl).hostname)
            } catch {
                // endereço incompleto: não há host para mascarar
            }
        }
        for (const c of calls.calls) {
            numbers.push(c.remote)
            names.push(c.remoteName ?? '')
        }
        return { numbers, hosts, names }
    }

    return { ask, explainLog, explainCall, explainAccount, known }
})
