// Teste de carga por SIP puro (RF-42): várias chamadas ao mesmo tempo pela mesma conta, cada uma
// tocando um tom, sem passar pela interface. Aqui ficam o pedido, o resultado de cada chamada e o
// resumo; quem faz as chamadas é o processo principal.

export interface LoadSpec {
    destination: string
    /** Quantas chamadas ao mesmo tempo. */
    calls: number
    /** Quanto tempo cada chamada fica em conversa, em segundos. */
    seconds: number
    /** Intervalo entre o começo de uma chamada e o da próxima, em milissegundos. */
    rampMs: number
}

export const LOAD_LIMITS = { calls: 200, seconds: 600, rampMs: 5000 }

export const isLoadSpec = (v: unknown): v is LoadSpec => {
    if (!v || typeof v !== 'object') return false
    const s = v as Record<string, unknown>
    const int = (x: unknown, min: number, max: number): boolean =>
        Number.isInteger(x) && (x as number) >= min && (x as number) <= max
    return (
        typeof s.destination === 'string' &&
        /^[A-Za-z0-9_.!~*'()&=+$,;?/%-]{1,100}$/.test(s.destination) &&
        int(s.calls, 1, LOAD_LIMITS.calls) &&
        int(s.seconds, 1, LOAD_LIMITS.seconds) &&
        int(s.rampMs, 0, LOAD_LIMITS.rampMs)
    )
}

export interface LoadCallResult {
    established: boolean
    /** Do INVITE ao atendimento. */
    setupMs?: number
    code?: number
    reason?: string
    packetsReceived: number
    packetsLost: number
    jitterMs: number
    /** Volume do que chegou perto do fim da chamada, em dBFS. */
    levelDb: number
}

export interface LoadProgress {
    started: number
    established: number
    finished: number
    total: number
}

export interface LoadReport {
    destination: string
    requested: number
    established: number
    failed: number
    /** Chamadas atendidas em que chegou áudio. */
    withAudio: number
    setupAvgMs: number
    setupP95Ms: number
    lossAvgPercent: number
    lossMaxPercent: number
    jitterAvgMs: number
    jitterMaxMs: number
    /** Falhas agrupadas pelo código e pela frase. */
    failures: Array<{ code?: number; reason: string; count: number }>
    durationMs: number
    stopped: boolean
}

const avg = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
const round1 = (value: number): number => Math.round(value * 10) / 10

export function buildLoadReport(
    spec: LoadSpec,
    results: LoadCallResult[],
    durationMs: number,
    stopped: boolean,
    audioThresholdDb: number
): LoadReport {
    const ok = results.filter((r) => r.established)
    const setups = ok.map((r) => r.setupMs ?? 0).sort((a, b) => a - b)
    const loss = ok.map((r) => {
        const expected = r.packetsReceived + r.packetsLost
        return expected ? (r.packetsLost / expected) * 100 : 0
    })
    const failures = new Map<string, { code?: number; reason: string; count: number }>()
    for (const r of results) {
        if (r.established) continue
        const reason = r.reason || 'sem resposta'
        const key = `${r.code ?? ''}|${reason}`
        const entry = failures.get(key) ?? { code: r.code, reason, count: 0 }
        entry.count++
        failures.set(key, entry)
    }
    return {
        destination: spec.destination,
        requested: spec.calls,
        established: ok.length,
        failed: results.length - ok.length,
        withAudio: ok.filter((r) => r.levelDb >= audioThresholdDb).length,
        setupAvgMs: Math.round(avg(setups)),
        setupP95Ms: setups[Math.min(setups.length - 1, Math.floor(setups.length * 0.95))] ?? 0,
        lossAvgPercent: round1(avg(loss)),
        lossMaxPercent: round1(Math.max(0, ...loss)),
        jitterAvgMs: Math.round(avg(ok.map((r) => r.jitterMs))),
        jitterMaxMs: Math.max(0, ...ok.map((r) => r.jitterMs)),
        failures: [...failures.values()].sort((a, b) => b.count - a.count),
        durationMs,
        stopped
    }
}

export function loadReportToText(report: LoadReport, account: string): string {
    const lines = [
        `Teste de carga por SIP puro · conta ${account} · destino ${report.destination}`,
        `Chamadas pedidas: ${report.requested} · atendidas: ${report.established} · falharam: ${report.failed}${report.stopped ? ' · interrompido' : ''}`,
        `Com áudio chegando: ${report.withAudio} de ${report.established}`,
        `Tempo até atender: média ${report.setupAvgMs} ms · p95 ${report.setupP95Ms} ms`,
        `Perda de pacotes: média ${report.lossAvgPercent}% · pior ${report.lossMaxPercent}%`,
        `Jitter: média ${report.jitterAvgMs} ms · pior ${report.jitterMaxMs} ms`,
        `Duração total: ${(report.durationMs / 1000).toFixed(1)} s`
    ]
    if (report.failures.length) {
        lines.push('', 'Falhas:')
        for (const f of report.failures) lines.push(`  ${f.count}× ${[f.code, f.reason].filter(Boolean).join(' ')}`)
    }
    return lines.join('\n')
}
