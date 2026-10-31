import { describe, expect, it } from 'vitest'
import { ptBR } from '@renderer/i18n/pt-BR'
import { GUIDE } from '@renderer/i18n/guide.pt-BR'
import { t } from '@renderer/i18n'

describe('texto da interface (RNF-13)', () => {
    it('t() devolve o texto e troca os parâmetros', () => {
        expect(t('app.configuracoes')).toBe(ptBR.app.configuracoes)
        expect(t('app.versao_disponivel_abra_atualizacao_para', { version: '2.0.0' })).toContain('2.0.0')
    })

    it('nenhum texto ficou vazio', () => {
        for (const [group, texts] of Object.entries(ptBR))
            for (const [name, text] of Object.entries(texts as Record<string, string>))
                expect(text.length, `${group}.${name}`).toBeGreaterThan(0)
    })

    it('o guia tem seções com id único e todas com conteúdo', () => {
        const ids = GUIDE.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of GUIDE) {
            expect(section.title.length, section.id).toBeGreaterThan(0)
            expect(section.blocks.length, section.id).toBeGreaterThan(0)
        }
    })
})
