// Histórico de chamadas (RF-40): o que fica de cada chamada depois que o cartão some da tela.

export interface HistoryEntry {
    id: string
    /** Quando a chamada começou, em milissegundos desde 1970. */
    startedAt: number
    accountId: string
    /** Nome da conta na hora da chamada: a conta pode ser renomeada ou apagada depois. */
    accountName: string
    direction: 'in' | 'out'
    remote: string
    remoteName?: string
    /** Tempo em conversa; 0 quando a chamada não chegou a ser atendida. */
    durationMs: number
    answered: boolean
    failed: boolean
    /** Como terminou, do jeito que apareceu no cartão: "Encerrada por você", "… · 486 Busy Here". */
    result: string
}

export interface HistoryFile {
    schemaVersion: 1
    entries: HistoryEntry[]
}

export const HISTORY_LIMIT = 500

/** Põe a chamada mais nova no começo e corta as mais antigas além do limite. */
export function addHistory(list: HistoryEntry[], entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryEntry[] {
    return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, limit)
}

/** "1:05" ou "1:02:03"; vazio para chamada que não foi atendida. */
export function formatDuration(ms: number): string {
    if (ms <= 0) return ''
    const total = Math.round(ms / 1000)
    const pad = (n: number): string => String(n).padStart(2, '0')
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`
}

const isText = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max

export function isHistoryEntry(v: unknown): v is HistoryEntry {
    if (!v || typeof v !== 'object') return false
    const e = v as Record<string, unknown>
    return (
        isText(e.id, 200) &&
        typeof e.startedAt === 'number' &&
        isText(e.accountId, 200) &&
        isText(e.accountName, 200) &&
        (e.direction === 'in' || e.direction === 'out') &&
        isText(e.remote, 300) &&
        (e.remoteName === undefined || isText(e.remoteName, 300)) &&
        typeof e.durationMs === 'number' &&
        typeof e.answered === 'boolean' &&
        typeof e.failed === 'boolean' &&
        isText(e.result, 500)
    )
}
