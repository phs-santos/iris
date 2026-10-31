import { describe, expect, it } from 'vitest'
import { accountsWithTag, isTag, removeTag } from '../src/shared/tags'
import type { Account } from '../src/shared/types'

const account = (id: string, tagIds: string[]): Account => ({ id, tagIds }) as unknown as Account

describe('etiquetas', () => {
    it('valida nome e cor', () => {
        expect(isTag({ id: 't1', name: 'Vendas', color: '#12abEF' })).toBe(true)
        expect(isTag({ id: 't1', name: '', color: '#123456' })).toBe(false)
        expect(isTag({ id: 't1', name: 'x'.repeat(41), color: '#123456' })).toBe(false)
        expect(isTag({ id: 't1', name: 'x'.repeat(40), color: '#123456' })).toBe(true)
        expect(isTag({ id: 't1', name: 'a', color: '#123' })).toBe(false)
        expect(isTag({ id: 't1', name: 'a', color: 'red' })).toBe(false)
        expect(isTag({ id: 't1', name: 'a', color: '#12345g' })).toBe(false)
        expect(isTag({ name: 'a', color: '#123456' })).toBe(false)
        expect(isTag(null)).toBe(false)
    })

    it('apagar etiqueta tira de todas as contas', () => {
        const accounts = [account('a', ['t1', 't2']), account('b', ['t2']), account('c', [])]
        const result = removeTag(accounts, 't2')
        expect(result.map((a) => a.tagIds)).toEqual([['t1'], [], []])
        expect(result[2]).toBe(accounts[2])
        expect(accounts[0].tagIds).toEqual(['t1', 't2'])
        expect(accountsWithTag(accounts, 't2').map((a) => a.id)).toEqual(['a', 'b'])
    })

    it('renomear não mexe nas contas', () => {
        // A conta guarda só o id: trocar o nome da etiqueta não passa por ela.
        const accounts = [account('a', ['t1'])]
        const renamed = { id: 't1', name: 'Novo nome', color: '#000000' }
        expect(isTag(renamed)).toBe(true)
        expect(accountsWithTag(accounts, renamed.id)).toHaveLength(1)
        expect(accounts[0].tagIds).toEqual(['t1'])
    })
})
