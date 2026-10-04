// Monitor (RF-43): roda um cenário de tempos em tempos e avisa quando o resultado muda.

export interface MonitorSettings {
    enabled: boolean
    /** Intervalo entre o fim de uma execução e o começo da próxima. */
    everyMinutes: number
    /** Endereço que recebe um POST com JSON quando o cenário passa a falhar ou volta a passar. */
    webhook?: string
}

export const DEFAULT_MONITOR: MonitorSettings = { enabled: false, everyMinutes: 5 }
export const MAX_MONITOR_MINUTES = 24 * 60

export const isWebhookUrl = (text: string): boolean => {
    try {
        const url = new URL(text)
        return (url.protocol === 'https:' || url.protocol === 'http:') && text.length <= 2000
    } catch {
        return false
    }
}

/** Lê o monitor de um cenário salvo; o que não fizer sentido volta ao padrão. */
export function normalizeMonitor(raw: unknown): MonitorSettings | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const m = raw as Record<string, unknown>
    const minutes = Number(m.everyMinutes)
    const webhook = typeof m.webhook === 'string' && isWebhookUrl(m.webhook.trim()) ? m.webhook.trim() : undefined
    return {
        enabled: m.enabled === true,
        everyMinutes: minutes > 0 && minutes <= MAX_MONITOR_MINUTES ? minutes : DEFAULT_MONITOR.everyMinutes,
        webhook
    }
}

export type MonitorEvent = 'failed' | 'recovered'

/**
 * O que avisar depois de uma execução: só a mudança. A primeira falha avisa; a primeira execução que
 * passa não avisa nada, porque não há novidade.
 */
export function monitorTransition(previous: boolean | undefined, passed: boolean): MonitorEvent | null {
    if (passed) return previous === false ? 'recovered' : null
    return previous === false ? null : 'failed'
}

export interface WebhookPayload {
    app: 'Iris'
    event: MonitorEvent
    scenario: string
    /** Passo que falhou (a partir de 1) e a mensagem; ausentes quando o cenário voltou a passar. */
    failedStep?: number
    message?: string
    durationMs: number
    at: string
}

export function isWebhookPayload(v: unknown): v is WebhookPayload {
    if (!v || typeof v !== 'object') return false
    const p = v as Record<string, unknown>
    return (
        p.app === 'Iris' &&
        (p.event === 'failed' || p.event === 'recovered') &&
        typeof p.scenario === 'string' &&
        p.scenario.length <= 300 &&
        (p.failedStep === undefined || typeof p.failedStep === 'number') &&
        (p.message === undefined || (typeof p.message === 'string' && p.message.length <= 2000)) &&
        typeof p.durationMs === 'number' &&
        typeof p.at === 'string' &&
        p.at.length <= 40
    )
}
