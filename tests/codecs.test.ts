import { describe, expect, it } from 'vitest'
import { DEFAULT_CODECS, isCodecPrefs, offerOrder, type CodecPrefs } from '../src/shared/codecs'

describe('ordem dos codecs', () => {
    it('padrão quando não há preferência', () => {
        expect(offerOrder(undefined)).toEqual(DEFAULT_CODECS)
    })

    it('respeita a ordem e tira os desligados', () => {
        expect(offerOrder({ order: ['PCMA', 'PCMU', 'G722', 'opus'], disabled: ['G722', 'opus'] })).toEqual([
            'PCMA',
            'PCMU'
        ])
    })

    it('lista vazia ou inválida volta ao padrão', () => {
        expect(offerOrder({ order: [], disabled: ['G722', 'PCMU', 'PCMA', 'opus'] })).toEqual(DEFAULT_CODECS)
        const prefs = { order: ['xyz', 'PCMA', 'PCMA', 'PCMU'], disabled: [] } as unknown as CodecPrefs
        expect(offerOrder(prefs)).toEqual(['PCMA', 'PCMU', 'G722', 'opus'])
    })

    it('codec que falta na ordem vai para o fim', () => {
        expect(offerOrder({ order: ['opus'], disabled: [] })).toEqual(['opus', 'G722', 'PCMU', 'PCMA'])
    })

    it('confere o formato vindo da interface', () => {
        expect(isCodecPrefs(undefined)).toBe(true)
        expect(isCodecPrefs({ order: ['PCMA'], disabled: [] })).toBe(true)
        expect(isCodecPrefs({ order: ['MP3'], disabled: [] })).toBe(false)
        expect(isCodecPrefs({ order: [] })).toBe(false)
        expect(isCodecPrefs('x')).toBe(false)
    })
})
