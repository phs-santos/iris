import { describe, expect, it } from 'vitest'
import { addHistory, formatDuration, isHistoryEntry, type HistoryEntry } from '@shared/history'

const entry = (id: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
    id,
    startedAt: 1_700_000_000_000,
    accountId: 'a1',
    accountName: 'Suporte 1001',
    direction: 'out',
    remote: '1002',
    durationMs: 65_000,
    answered: true,
    failed: false,
    result: 'Encerrada por você',
    ...extra
})

describe('histórico de chamadas (RF-40)', () => {
    it('a chamada mais nova vai para o começo e o limite corta as mais antigas', () => {
        let list: HistoryEntry[] = []
        for (const id of ['a', 'b', 'c', 'd']) list = addHistory(list, entry(id), 3)
        expect(list.map((e) => e.id)).toEqual(['d', 'c', 'b'])
    })

    it('a mesma chamada não entra duas vezes', () => {
        const list = addHistory([entry('a'), entry('b')], entry('b', { result: 'Falhou' }))
        expect(list.map((e) => `${e.id}:${e.result}`)).toEqual(['b:Falhou', 'a:Encerrada por você'])
    })

    it('mostra a duração em minutos e segundos, com horas quando passa de uma', () => {
        expect(formatDuration(0)).toBe('')
        expect(formatDuration(5_400)).toBe('0:05')
        expect(formatDuration(65_000)).toBe('1:05')
        expect(formatDuration(3_723_000)).toBe('1:02:03')
    })

    it('confere o formato do que vem do arquivo e da interface', () => {
        expect(isHistoryEntry(entry('a'))).toBe(true)
        expect(isHistoryEntry(entry('a', { remoteName: 'Ana' }))).toBe(true)
        expect(isHistoryEntry({ ...entry('a'), direction: 'lado' })).toBe(false)
        expect(isHistoryEntry({ ...entry('a'), durationMs: '1' })).toBe(false)
        expect(isHistoryEntry({ ...entry('a'), result: 'x'.repeat(501) })).toBe(false)
        expect(isHistoryEntry(null)).toBe(false)
    })
})
