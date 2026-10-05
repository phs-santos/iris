import { describe, expect, it } from 'vitest'
import { findCallLink, isLinkSettings, parseCallLink } from '../src/shared/links'

describe('links de telefone (RF-53)', () => {
    it('tira o número de tel: e callto:, sem a pontuação', () => {
        expect(parseCallLink('tel:+55 (11) 3000-0000')).toBe('+551130000000')
        expect(parseCallLink('tel:+55%2011%203000.0000')).toBe('+551130000000')
        expect(parseCallLink('TEL:1002')).toBe('1002')
        expect(parseCallLink('callto://8000')).toBe('8000')
        expect(parseCallLink('tel:*72#')).toBe('*72#')
    })

    it('ignora parâmetros e cabeçalhos do link', () => {
        expect(parseCallLink('tel:+551130000000;ext=12')).toBe('+551130000000')
        expect(parseCallLink('sip:1002@pbx.empresa.com;transport=tcp?subject=oi')).toBe('1002')
    })

    it('de sip: e sips: fica só o usuário', () => {
        expect(parseCallLink('sip:suporte.n1@pbx.empresa.com')).toBe('suporte.n1')
        expect(parseCallLink('sips:1002@pbx.empresa.com:5061')).toBe('1002')
    })

    it('recusa o que não é número nem usuário', () => {
        expect(parseCallLink('tel:')).toBeNull()
        expect(parseCallLink('tel:abc')).toBeNull()
        expect(parseCallLink('tel:1002\n--cenario x')).toBeNull()
        expect(parseCallLink('sip:pbx.empresa.com')).toBeNull()
        expect(parseCallLink('sip:a b@pbx')).toBeNull()
        expect(parseCallLink('tel:%E0%A4%A')).toBeNull()
        expect(parseCallLink(`tel:${'1'.repeat(65)}`)).toBeNull()
        expect(parseCallLink('https://exemplo.com/tel:123')).toBeNull()
        expect(parseCallLink('--tel:123')).toBeNull()
    })

    it('acha o link entre os argumentos do app', () => {
        expect(findCallLink(['.', '--no-sandbox', 'tel:1002'])).toBe('1002')
        expect(findCallLink(['.', '--cenario', 'x'])).toBeNull()
    })

    it('confere as preferências antes de gravar', () => {
        expect(isLinkSettings(undefined)).toBe(true)
        expect(isLinkSettings({})).toBe(true)
        expect(isLinkSettings({ autoDial: true })).toBe(true)
        expect(isLinkSettings({ autoDial: 'sim' })).toBe(false)
        expect(isLinkSettings({ outro: 1 })).toBe(false)
        expect(isLinkSettings([])).toBe(false)
    })
})
