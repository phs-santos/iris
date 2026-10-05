import { describe, expect, it } from 'vitest'
import { ptBR } from '@renderer/i18n/pt-BR'
import { en } from '@renderer/i18n/en'
import { GUIDE } from '@renderer/i18n/guide.pt-BR'
import { GUIDE_EN } from '@renderer/i18n/guide.en'
import { setLocale, t } from '@renderer/i18n'

const params = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
const groups = Object.keys(ptBR) as Array<keyof typeof ptBR>

describe('tradução da interface (RF-56)', () => {
    it('o inglês tem os mesmos grupos e nomes do português', () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort())
        for (const group of groups)
            expect(Object.keys(en[group]).sort(), group).toEqual(Object.keys(ptBR[group]).sort())
    })

    it('cada texto usa os mesmos parâmetros nos dois idiomas', () => {
        for (const group of groups) {
            const pt = ptBR[group] as Record<string, string>
            const other = en[group] as Record<string, string>
            for (const name of Object.keys(pt))
                expect(params(other[name]!), `${group}.${name}`).toEqual(params(pt[name]!))
        }
    })

    it('nenhum texto do inglês ficou vazio nem com acento do português', () => {
        // Nomes próprios e exemplos que valem nos dois idiomas.
        const allowed = /Íris|Português|Suporte 1001|→|·|…|×|↑|↓|›/g
        for (const group of groups)
            for (const [name, text] of Object.entries(en[group] as Record<string, string>)) {
                expect(text.length, `${group}.${name}`).toBeGreaterThan(0)
                expect(/[áàâãéêíóôõúç]/i.test(text.replace(allowed, '')), `${group}.${name}: ${text}`).toBe(false)
            }
    })

    it('t() troca de idioma na hora e volta', () => {
        setLocale('en')
        expect(t('app.configuracoes')).toBe('Settings')
        expect(t('commandPalette.ligar_para', { number: '8000' })).toBe('Call 8000')
        setLocale('pt-BR')
        expect(t('app.configuracoes')).toBe('Configurações')
    })

    it('o guia em inglês tem as mesmas seções, na mesma ordem, com os mesmos blocos e imagens', () => {
        expect(GUIDE_EN.map((s) => s.id)).toEqual(GUIDE.map((s) => s.id))
        for (const [i, section] of GUIDE.entries()) {
            const other = GUIDE_EN[i]!
            expect(
                other.blocks.map((b) => b.type),
                section.id
            ).toEqual(section.blocks.map((b) => b.type))
            const images = (blocks: typeof section.blocks): string[] =>
                blocks.flatMap((b) => (b.type === 'image' ? [b.name] : []))
            expect(images(other.blocks), section.id).toEqual(images(section.blocks))
        }
    })
})
