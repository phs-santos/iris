import { describe, expect, it } from 'vitest'
import { buildLoadReport, isLoadSpec, loadReportToText, type LoadCallResult } from '@shared/load'

const spec = { destination: '600', calls: 4, seconds: 5, rampMs: 100 }
const ok = (extra: Partial<LoadCallResult> = {}): LoadCallResult => ({
    established: true,
    setupMs: 100,
    packetsReceived: 250,
    packetsLost: 0,
    jitterMs: 4,
    levelDb: -12,
    ...extra
})
const failed = (code: number | undefined, reason: string | undefined): LoadCallResult => ({
    established: false,
    code,
    reason,
    packetsReceived: 0,
    packetsLost: 0,
    jitterMs: 0,
    levelDb: -96
})

describe('teste de carga por SIP puro (RF-42)', () => {
    it('resume as chamadas: atendidas, com áudio, tempos, perda e jitter', () => {
        const report = buildLoadReport(
            spec,
            [
                ok(),
                ok({ setupMs: 300, packetsReceived: 225, packetsLost: 25, jitterMs: 20 }),
                ok({ setupMs: 200, levelDb: -96 }),
                failed(486, 'Busy Here')
            ],
            6200,
            false,
            -50
        )
        expect(report).toMatchObject({
            requested: 4,
            established: 3,
            failed: 1,
            withAudio: 2,
            setupAvgMs: 200,
            setupP95Ms: 300,
            lossAvgPercent: 3.3,
            lossMaxPercent: 10,
            jitterAvgMs: 9,
            jitterMaxMs: 20,
            failures: [{ code: 486, reason: 'Busy Here', count: 1 }],
            stopped: false
        })
        const text = loadReportToText(report, 'Puro 2001')
        expect(text).toContain('conta Puro 2001 · destino 600')
        expect(text).toContain('atendidas: 3 · falharam: 1')
        expect(text).toContain('Com áudio chegando: 2 de 3')
        expect(text).toContain('1× 486 Busy Here')
    })

    it('junta as falhas iguais e aguenta um teste sem nenhuma chamada atendida', () => {
        const report = buildLoadReport(
            spec,
            [failed(503, 'Service Unavailable'), failed(503, 'Service Unavailable'), failed(undefined, undefined)],
            900,
            true,
            -50
        )
        expect(report.failures).toEqual([
            { code: 503, reason: 'Service Unavailable', count: 2 },
            { code: undefined, reason: 'sem resposta', count: 1 }
        ])
        expect(report).toMatchObject({
            established: 0,
            setupAvgMs: 0,
            setupP95Ms: 0,
            lossMaxPercent: 0,
            jitterMaxMs: 0
        })
        expect(loadReportToText(report, 'x')).toContain('interrompido')
    })

    it('confere o pedido que vem da interface', () => {
        expect(isLoadSpec(spec)).toBe(true)
        expect(isLoadSpec({ ...spec, calls: 0 })).toBe(false)
        expect(isLoadSpec({ ...spec, calls: 201 })).toBe(false)
        expect(isLoadSpec({ ...spec, seconds: 1.5 })).toBe(false)
        expect(isLoadSpec({ ...spec, destination: '600\r\nVia: x' })).toBe(false)
        expect(isLoadSpec({ ...spec, rampMs: -1 })).toBe(false)
        expect(isLoadSpec(null)).toBe(false)
    })
})
