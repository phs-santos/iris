import { describe, expect, it } from 'vitest'
import { accentTokens, contrast, DEFAULT_ACCENT, isAppearance, isProfile, PALETTES } from '@shared/appearance'

describe('cor de destaque', () => {
    it('sem cor salva, usa o azul da Íris', () => {
        expect(accentTokens(undefined).accent).toBe(DEFAULT_ACCENT)
        expect(accentTokens('azul').accent).toBe(DEFAULT_ACCENT)
    })

    it('o botão principal sempre tem texto branco legível (AA)', () => {
        for (const color of [...PALETTES.map((p) => p.accent), '#ffffff', '#ffff00', '#000000', '#7fdbff']) {
            const { strong } = accentTokens(color)
            expect(contrast('#ffffff', strong)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('uma cor que já tem contraste fica como está', () => {
        expect(accentTokens('#1d4ed8').strong).toBe('#1d4ed8')
    })

    it('nenhuma paleta pronta some contra o fundo', () => {
        for (const p of PALETTES) expect(accentTokens(p.accent).faint).toBe(false)
    })

    it('avisa quando a cor escolhida some contra o fundo escuro', () => {
        expect(accentTokens('#1a2230').faint).toBe(true)
    })
})

describe('preferências que chegam pelo IPC', () => {
    it('aceita campos ausentes, de um settings.json antigo', () => {
        expect(isProfile(undefined)).toBe(true)
        expect(isAppearance(undefined)).toBe(true)
        expect(isAppearance({})).toBe(true)
    })

    it('aceita valores válidos', () => {
        expect(isProfile({ name: 'Ana', mainAccountId: 'abc' })).toBe(true)
        expect(isAppearance({ accent: '#A0B1C2', size: 'large' })).toBe(true)
    })

    it('recusa valores fora do formato', () => {
        expect(isProfile({ name: 'x'.repeat(121) })).toBe(false)
        expect(isProfile([])).toBe(false)
        expect(isAppearance({ accent: 'red' })).toBe(false)
        expect(isAppearance({ accent: '#fff; background: url(x)' })).toBe(false)
        expect(isAppearance({ size: 'huge' })).toBe(false)
    })
})
