import { describe, expect, it } from 'vitest'
import { ptBR } from '@renderer/i18n/pt-BR'
import { t } from '@renderer/i18n'

describe('texto da interface (RNF-13)', () => {
    it('t() devolve o texto e troca os parâmetros', () => {
        expect(t('rail.ajustes')).toBe(ptBR.rail.ajustes)
        expect(t('app.versao_disponivel_abra_atualizacao_para', { version: '2.0.0' })).toContain('2.0.0')
    })

    it('nenhum texto ficou vazio', () => {
        for (const [group, texts] of Object.entries(ptBR))
            for (const [name, text] of Object.entries(texts as Record<string, string>))
                expect(text.length, `${group}.${name}`).toBeGreaterThan(0)
    })
})
