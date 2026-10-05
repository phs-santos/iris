import { describe, expect, it } from 'vitest'
import { ringbackOf } from '../src/shared/ringback'

const out = (state: string) => ({ direction: 'out' as const, state })

describe('toque de chamada e early media (RF-20)', () => {
    const native = { earlyAudio: true, localRingback: true }
    const webrtc = { earlyAudio: false, localRingback: true }
    const simulated = { earlyAudio: false, localRingback: false }

    it('com 180, o toque é o do app', () => {
        expect(ringbackOf(out('ringing'), native)).toBe('local')
        expect(ringbackOf(out('ringing'), webrtc)).toBe('local')
    })

    it('com 183 e áudio, quem consegue ouve o PBX; quem não consegue fica com o toque do app', () => {
        expect(ringbackOf(out('early'), native)).toBe('pbx')
        expect(ringbackOf(out('early'), webrtc)).toBe('local')
    })

    it('antes da primeira resposta e depois de atender não toca nada', () => {
        expect(ringbackOf(out('dialing'), native)).toBeUndefined()
        expect(ringbackOf(out('established'), native)).toBeUndefined()
        expect(ringbackOf(out('ended'), native)).toBeUndefined()
    })

    it('chamada recebida e PBX simulado não têm toque de chamada', () => {
        expect(ringbackOf({ direction: 'in', state: 'ringing' }, native)).toBeUndefined()
        expect(ringbackOf(out('ringing'), simulated)).toBeUndefined()
        expect(ringbackOf(out('early'), simulated)).toBeUndefined()
    })
})
