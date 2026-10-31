import { describe, expect, it } from 'vitest'
import {
    accentTokens,
    contrast,
    DEFAULT_ACCENT,
    DEFAULT_THEME,
    isAppearance,
    WINDOW_BACKGROUND,
    windowBackground
} from '@shared/appearance'

describe('cor de destaque', () => {
    it('sem cor salva, usa o azul da Íris', () => {
        expect(accentTokens(undefined).accent).toBe(DEFAULT_ACCENT)
        expect(accentTokens('azul').accent).toBe(DEFAULT_ACCENT)
    })

    it('o botão principal sempre tem texto branco legível (AA)', () => {
        for (const color of [DEFAULT_ACCENT, '#ffffff', '#ffff00', '#000000', '#7fdbff']) {
            const { strong } = accentTokens(color)
            expect(contrast('#ffffff', strong)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('uma cor que já tem contraste fica como está', () => {
        expect(accentTokens('#1d4ed8').strong).toBe('#1d4ed8')
    })

    it('a cor padrão não some contra o fundo, no claro nem no escuro', () => {
        expect(accentTokens(DEFAULT_ACCENT, 'light').faint).toBe(false)
        expect(accentTokens(DEFAULT_ACCENT, 'dark').faint).toBe(false)
    })

    it('avisa quando a cor escolhida some contra o fundo do tema', () => {
        expect(accentTokens('#1a2230', 'dark').faint).toBe(true)
        expect(accentTokens('#f5f5f5', 'light').faint).toBe(true)
    })
})

describe('aparência que chega pelo IPC', () => {
    it('o tema padrão é o claro', () => {
        expect(DEFAULT_THEME).toBe('light')
    })

    it('aceita campos ausentes, de um settings.json antigo', () => {
        expect(isAppearance(undefined)).toBe(true)
        expect(isAppearance({})).toBe(true)
    })

    it('aparência aceita só tema e cor de destaque', () => {
        expect(isAppearance({ theme: 'light', accent: '#2563eb' })).toBe(true)
        expect(isAppearance({ theme: 'system' })).toBe(true)
        expect(isAppearance({ accent: '#A0B1C2' })).toBe(true)
        expect(isAppearance({ theme: 'light', accent: '#2563eb', palette: 'azul' })).toBe(false)
        expect(isAppearance({ size: 'large' })).toBe(false)
        expect(isAppearance({ compact: true })).toBe(false)
        expect(isAppearance({ language: 'en' })).toBe(false)
    })

    it('recusa valores fora do formato', () => {
        expect(isAppearance([])).toBe(false)
        expect(isAppearance({ theme: 'roxo' })).toBe(false)
        expect(isAppearance({ accent: 'red' })).toBe(false)
        expect(isAppearance({ accent: '#fff; background: url(x)' })).toBe(false)
    })
})

describe('fundo da janela', () => {
    it('segue o tema salvo, e o sistema quando o tema é "sistema"', () => {
        expect(windowBackground(undefined, true)).toBe(WINDOW_BACKGROUND.light)
        expect(windowBackground('light', true)).toBe(WINDOW_BACKGROUND.light)
        expect(windowBackground('dark', false)).toBe(WINDOW_BACKGROUND.dark)
        expect(windowBackground('system', true)).toBe(WINDOW_BACKGROUND.dark)
        expect(windowBackground('system', false)).toBe(WINDOW_BACKGROUND.light)
    })
})
