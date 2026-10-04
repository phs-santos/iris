import { describe, expect, it } from 'vitest'
import { isReconnect, reconnectDelay, shouldReconnect } from '@shared/reconnect'

const middle = (): number => 0.5

describe('reconexão (RNF-06)', () => {
    it('a espera cresce de 2 s até 1 minuto', () => {
        const delays = [1, 2, 3, 4, 5, 6, 7].map((n) => reconnectDelay(n, { maxAttempts: 0 }, middle))
        expect(delays).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000])
    })

    it('para quando o limite de tentativas acaba', () => {
        expect(reconnectDelay(3, { maxAttempts: 3 }, middle)).toBe(8000)
        expect(reconnectDelay(4, { maxAttempts: 3 }, middle)).toBeNull()
    })

    it('com limite 0 nunca desiste', () => {
        expect(reconnectDelay(5000, { maxAttempts: 0 }, middle)).toBe(60000)
    })

    it('espalha as contas em até 15% para cada lado', () => {
        expect(reconnectDelay(1, { maxAttempts: 0 }, () => 0)).toBe(1700)
        expect(reconnectDelay(1, { maxAttempts: 0 }, () => 1)).toBe(2300)
    })

    it('não insiste em senha errada, ramal inexistente ou login recusado', () => {
        for (const code of [401, 403, 404, 407]) expect(shouldReconnect(code)).toBe(false)
        for (const code of [undefined, 408, 480, 503, 1006]) expect(shouldReconnect(code)).toBe(true)
    })

    it('confere o valor salvo nas preferências', () => {
        expect(isReconnect(undefined)).toBe(true)
        expect(isReconnect({ maxAttempts: 0 })).toBe(true)
        expect(isReconnect({ maxAttempts: 10 })).toBe(true)
        expect(isReconnect({ maxAttempts: -1 })).toBe(false)
        expect(isReconnect({ maxAttempts: 1.5 })).toBe(false)
        expect(isReconnect({ maxAttempts: 100000 })).toBe(false)
        expect(isReconnect({})).toBe(false)
    })
})
