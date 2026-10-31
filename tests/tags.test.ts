import { describe, expect, it } from 'vitest'
import { accountsWithTag, isTag, isTagList, nextTagColor, removeTag, TAG_COLORS } from '../src/shared/tags'
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

    it('etiqueta nova pega a primeira cor livre', () => {
        expect(nextTagColor([])).toBe(TAG_COLORS[0])
        expect(nextTagColor([{ id: 'a', name: 'a', color: TAG_COLORS[0]!.toUpperCase() }])).toBe(TAG_COLORS[1])
        const all = TAG_COLORS.map((color, i) => ({ id: String(i), name: 'x', color }))
        expect(TAG_COLORS).toContain(nextTagColor(all))
    })

    it('lista para gravar recusa id repetido', () => {
        const a = { id: 't1', name: 'A', color: '#111111' }
        const b = { id: 't2', name: 'B', color: '#222222' }
        expect(isTagList([a, b])).toBe(true)
        expect(isTagList([])).toBe(true)
        expect(isTagList([a, { ...b, id: 't1' }])).toBe(false)
        expect(isTagList([a, { id: 't3' }])).toBe(false)
        expect(isTagList('x')).toBe(false)
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
