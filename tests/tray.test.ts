import { describe, expect, it } from 'vitest'
import { isTrayCounts, traySummary } from '@shared/tray'

const counts = { accounts: 3, registered: 0, errors: 0, ringing: 0, calls: 0 }

describe('ícone da bandeja (RF-33)', () => {
    it('sem conta registrada fica parado', () => {
        expect(traySummary(counts)).toEqual({ state: 'idle', tooltip: 'Íris · 0 de 3 contas registradas' })
    })

    it('mostra o que mais pede atenção: tocando, em chamada, erro, registrada', () => {
        expect(traySummary({ ...counts, registered: 2 }).state).toBe('ok')
        expect(traySummary({ ...counts, registered: 2, errors: 1 }).state).toBe('error')
        expect(traySummary({ ...counts, registered: 2, errors: 1, calls: 1 }).state).toBe('call')
        expect(traySummary({ ...counts, registered: 2, errors: 1, calls: 1, ringing: 1 }).state).toBe('ringing')
    })

    it('a dica resume as contas e as chamadas, no singular e no plural', () => {
        expect(traySummary({ accounts: 1, registered: 1, errors: 0, ringing: 1, calls: 2 }).tooltip).toBe(
            'Íris · 1 de 1 conta registrada · 1 chamada tocando · 2 chamadas em andamento'
        )
        expect(traySummary({ ...counts, registered: 2, errors: 1 }).tooltip).toBe(
            'Íris · 2 de 3 contas registradas · 1 em erro'
        )
    })

    it('recusa contagens que não são números inteiros', () => {
        expect(isTrayCounts(counts)).toBe(true)
        expect(isTrayCounts({ ...counts, calls: -1 })).toBe(false)
        expect(isTrayCounts({ ...counts, calls: '1' })).toBe(false)
        expect(isTrayCounts({ accounts: 1 })).toBe(false)
        expect(isTrayCounts(null)).toBe(false)
    })
})
