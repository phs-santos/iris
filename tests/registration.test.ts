import { describe, expect, it } from 'vitest'
import { HEALTH_FRESH_MS, isFresh, RENEWAL_GRACE_MS, renewalState } from '../src/shared/registration'

describe('renovação do registro nos detalhes da conta', () => {
    it('sem hora marcada não há contagem', () => {
        expect(renewalState(undefined, 1000)).toBeNull()
    })

    it('conta o que falta e não fica negativo', () => {
        expect(renewalState(10_000, 4_000)).toEqual({ leftMs: 6_000, due: false })
        expect(renewalState(10_000, 11_000)).toEqual({ leftMs: 0, due: false })
    })

    it('passada a hora com folga, pede uma medida nova para achar o próximo ciclo', () => {
        expect(renewalState(10_000, 10_000 + RENEWAL_GRACE_MS)?.due).toBe(true)
    })

    it('medida recente é reaproveitada; antiga ou ausente, não', () => {
        expect(isFresh(new Date(5_000), 5_000 + HEALTH_FRESH_MS - 1)).toBe(true)
        expect(isFresh(5_000, 5_000 + HEALTH_FRESH_MS)).toBe(false)
        expect(isFresh(undefined, 5_000)).toBe(false)
    })
})
