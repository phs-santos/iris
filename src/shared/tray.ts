// Estado geral do app para o ícone da bandeja (RF-33). A interface conta, o processo principal desenha.

export interface TrayCounts {
    accounts: number
    registered: number
    errors: number
    ringing: number
    calls: number
}

/** Um ícone para cada estado, em `resources/tray-<estado>.png`. */
export type TrayState = 'idle' | 'ok' | 'ringing' | 'call' | 'error'

export const isTrayCounts = (v: unknown): v is TrayCounts => {
    if (!v || typeof v !== 'object') return false
    const c = v as Record<string, unknown>
    return ['accounts', 'registered', 'errors', 'ringing', 'calls'].every(
        (k) => Number.isInteger(c[k]) && (c[k] as number) >= 0 && (c[k] as number) <= 100_000
    )
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** O que mais pede atenção vem primeiro: tocando, em chamada, conta em erro, registrada. */
export function traySummary(counts: TrayCounts): { state: TrayState; tooltip: string } {
    const state: TrayState =
        counts.ringing > 0
            ? 'ringing'
            : counts.calls > 0
              ? 'call'
              : counts.errors > 0
                ? 'error'
                : counts.registered > 0
                  ? 'ok'
                  : 'idle'
    const parts = [
        `${counts.registered} de ${plural(counts.accounts, 'conta registrada', 'contas registradas')}`,
        counts.errors ? `${counts.errors} em erro` : '',
        counts.ringing ? plural(counts.ringing, 'chamada tocando', 'chamadas tocando') : '',
        counts.calls ? plural(counts.calls, 'chamada em andamento', 'chamadas em andamento') : ''
    ]
    return { state, tooltip: `Íris · ${parts.filter(Boolean).join(' · ')}` }
}
