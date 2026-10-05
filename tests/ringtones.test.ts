import { describe, expect, it } from 'vitest'
import { isRingtoneId, isRingVolume, RINGTONE_IDS, RINGTONES, ringGain } from '../src/shared/ringtones'

describe('toques de chamada (RF-55)', () => {
    it('cada toque cabe no próprio ciclo e usa frequências audíveis', () => {
        for (const id of RINGTONE_IDS) {
            const tone = RINGTONES[id]
            for (const note of tone.notes) {
                expect(note.atMs + note.ms, id).toBeLessThanOrEqual(tone.periodMs)
                for (const freq of note.freqs) expect(freq > 200 && freq < 4000, id).toBe(true)
            }
        }
    })

    it('os toques são diferentes entre si, e "nenhum" não toca', () => {
        const shapes = RINGTONE_IDS.map((id) => JSON.stringify(RINGTONES[id]))
        expect(new Set(shapes).size).toBe(RINGTONE_IDS.length)
        expect(RINGTONES.nenhum.notes).toEqual([])
    })

    it('confere o que vem do arquivo de contas e das preferências', () => {
        expect(isRingtoneId('sino')).toBe(true)
        expect(isRingtoneId('buzina')).toBe(false)
        expect(isRingVolume(undefined)).toBe(true)
        expect(isRingVolume(0)).toBe(true)
        expect(isRingVolume(100)).toBe(true)
        expect(isRingVolume(101)).toBe(false)
        expect(isRingVolume(12.5)).toBe(false)
        expect(isRingVolume('50')).toBe(false)
    })

    it('o volume 50 mantém o som de antes, 0 cala e 100 não estoura', () => {
        expect(ringGain(undefined)).toBeCloseTo(0.08)
        expect(ringGain(50)).toBeCloseTo(0.08)
        expect(ringGain(0)).toBe(0)
        expect(ringGain(100)).toBeCloseTo(0.32)
        expect(ringGain(500)).toBeCloseTo(0.32)
        expect(ringGain(-3)).toBe(0)
    })
})
