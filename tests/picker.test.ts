import { describe, expect, it } from 'vitest'
import { filterAccounts, groupByServer, initials, stepIndex } from '@shared/picker'
import { simulatedServer, type SipServer } from '@shared/servers'
import type { Tag } from '@shared/tags'
import type { Account } from '@shared/types'

const account = (id: string, name: string, extension: string, serverId: string, tagIds: string[] = []): Account =>
    ({ id, name, extension, serverId, tagIds }) as unknown as Account
const server = (id: string, name: string): SipServer => ({ ...simulatedServer(), id, name })

const tags: Tag[] = [
    { id: 't1', name: 'Atendimento', color: '#123456' },
    { id: 't2', name: 'Laboratório', color: '#654321' }
]
const list = [
    account('a', 'Suporte 1001', '1001', 'simulado', ['t1']),
    account('b', 'Vendas 1002', '1002', 's1'),
    account('c', 'Lab 2001', '2001', '', ['t2']),
    account('d', 'Órfã', '3001', 'apagado')
]

describe('seletor de contas', () => {
    it('busca por nome, ramal ou etiqueta, sem diferenciar acento nem maiúscula', () => {
        const ids = (q: string, tag: string | null = null) => filterAccounts(list, q, tag, tags).map((a) => a.id)
        expect(ids('')).toEqual(['a', 'b', 'c', 'd'])
        expect(ids('vendas')).toEqual(['b'])
        expect(ids('200')).toEqual(['c'])
        expect(ids('laboratorio')).toEqual(['c'])
        expect(ids('orfa')).toEqual(['d'])
        expect(ids('suporte 1001')).toEqual(['a'])
        expect(ids('suporte 2001')).toEqual([])
    })

    it('filtra pela etiqueta escolhida, junto com a busca', () => {
        expect(filterAccounts(list, '', 't1', tags).map((a) => a.id)).toEqual(['a'])
        expect(filterAccounts(list, 'vendas', 't1', tags)).toEqual([])
    })

    it('agrupa por servidor na ordem da lista; sem servidor (ou servidor apagado) fica por último', () => {
        const servers = [simulatedServer(), server('s1', 'PBX'), server('s2', 'Vazio')]
        const groups = groupByServer(list, servers)
        expect(groups.map((g) => g.server?.id ?? null)).toEqual(['simulado', 's1', null])
        expect(groups[2].accounts.map((a) => a.id)).toEqual(['c', 'd'])
        expect(groupByServer([], servers)).toEqual([])
    })

    it('iniciais do avatar', () => {
        expect(initials('Suporte 1001')).toBe('SU')
        expect(initials('Ana Souza')).toBe('AS')
        expect(initials('x')).toBe('X')
        expect(initials('  ')).toBe('?')
        expect(initials('éder lima')).toBe('ÉL')
    })

    it('setas andam e dão a volta nas pontas', () => {
        expect(stepIndex(-1, 1, 3)).toBe(0)
        expect(stepIndex(-1, -1, 3)).toBe(2)
        expect(stepIndex(2, 1, 3)).toBe(0)
        expect(stepIndex(0, -1, 3)).toBe(2)
        expect(stepIndex(0, 1, 0)).toBe(-1)
    })
})
