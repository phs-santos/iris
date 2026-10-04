import { describe, expect, it } from 'vitest'
import { isWebhookPayload, isWebhookUrl, monitorTransition, normalizeMonitor } from '@shared/monitor'
import { normalizeScenarios } from '@renderer/lib/scenarios'

describe('monitor (RF-43)', () => {
    it('avisa só quando o resultado muda', () => {
        // Primeira execução: passar não é novidade; falhar é.
        expect(monitorTransition(undefined, true)).toBeNull()
        expect(monitorTransition(undefined, false)).toBe('failed')
        expect(monitorTransition(true, false)).toBe('failed')
        expect(monitorTransition(false, false)).toBeNull()
        expect(monitorTransition(false, true)).toBe('recovered')
        expect(monitorTransition(true, true)).toBeNull()
    })

    it('aceita só endereços http e https no webhook', () => {
        expect(isWebhookUrl('https://hooks.exemplo.com/abc?x=1')).toBe(true)
        expect(isWebhookUrl('http://10.0.0.5:8080/alerta')).toBe(true)
        for (const bad of ['ftp://x', 'file:///etc/passwd', 'javascript:alert(1)', 'hooks.exemplo.com', '']) {
            expect(isWebhookUrl(bad)).toBe(false)
        }
        expect(isWebhookUrl(`https://x/${'a'.repeat(2000)}`)).toBe(false)
    })

    it('lê o monitor salvo no cenário e descarta o que não faz sentido', () => {
        expect(normalizeMonitor(undefined)).toBeUndefined()
        expect(normalizeMonitor({ enabled: true, everyMinutes: 10, webhook: ' https://x/y ' })).toEqual({
            enabled: true,
            everyMinutes: 10,
            webhook: 'https://x/y'
        })
        expect(normalizeMonitor({ enabled: 'sim', everyMinutes: -1, webhook: 'ftp://x' })).toEqual({
            enabled: false,
            everyMinutes: 5,
            webhook: undefined
        })
        const [scenario] = normalizeScenarios([{ name: 'x', steps: [], monitor: { enabled: true, everyMinutes: 2 } }])
        expect(scenario!.monitor).toEqual({ enabled: true, everyMinutes: 2, webhook: undefined })
        expect(normalizeScenarios([{ name: 'x', steps: [] }])[0]).not.toHaveProperty('monitor')
    })

    it('confere o corpo do webhook antes de mandar', () => {
        const payload = {
            app: 'Iris',
            event: 'failed',
            scenario: 'URA',
            failedStep: 3,
            message: '486',
            durationMs: 900,
            at: '2026-10-04T12:00:00.000Z'
        }
        expect(isWebhookPayload(payload)).toBe(true)
        expect(isWebhookPayload({ ...payload, event: 'recovered', failedStep: undefined, message: undefined })).toBe(
            true
        )
        expect(isWebhookPayload({ ...payload, app: 'Outro' })).toBe(false)
        expect(isWebhookPayload({ ...payload, event: 'apagar' })).toBe(false)
        expect(isWebhookPayload({ ...payload, message: 'x'.repeat(2001) })).toBe(false)
        expect(isWebhookPayload(null)).toBe(false)
    })
})
