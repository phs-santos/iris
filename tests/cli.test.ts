import { describe, expect, it } from 'vitest'
import { extractScenarioList, parseCliArgs } from '@shared/cli'
import { pickScenarios, resolveAccount } from '@renderer/cli'
import { newAccount } from '@renderer/lib/accounts'
import { newScenario } from '@renderer/lib/scenarios'

describe('parseCliArgs (RF-31)', () => {
    it('sem opções da linha de comando abre a janela normal', () => {
        expect(parseCliArgs(['.', '--inspect=9229', '--no-sandbox'])).toBeNull()
    })

    it('lê nomes em português e em inglês, repetidos e com =', () => {
        const r = parseCliArgs([
            '.',
            '--cenario',
            'URA',
            '--scenario=Ocupado',
            '--vezes',
            '20',
            '--report=r.json',
            '--trust-host',
            'pbx',
            '--midia-falsa'
        ])
        expect(r).toEqual({
            options: {
                scenarios: ['URA', 'Ocupado'],
                all: false,
                runs: 20,
                report: 'r.json',
                trustHosts: ['pbx'],
                fakeMedia: true,
                help: false
            }
        })
    })

    it('recusa linha incompleta ou inválida', () => {
        expect(parseCliArgs(['--vezes', '3'])).toEqual({ error: expect.stringMatching(/Diga qual cenário/) })
        expect(parseCliArgs(['--cenario'])).toEqual({ error: '--cenario precisa de um valor' })
        expect(parseCliArgs(['--cenario', '--todos'])).toEqual({ error: '--cenario precisa de um valor' })
        expect(parseCliArgs(['--todos', '--vezes', '0'])).toEqual({ error: expect.stringMatching(/1 a 10000/) })
    })

    it('--ajuda dispensa o cenário', () => {
        expect(parseCliArgs(['--ajuda'])).toMatchObject({ options: { help: true } })
    })
})

describe('cenários e contas na linha de comando', () => {
    it('aceita scenarios.json, lista ou um cenário só', () => {
        const s = { name: 'x', steps: [] }
        expect(extractScenarioList({ schemaVersion: 1, scenarios: [s] })).toEqual([s])
        expect(extractScenarioList([s])).toEqual([s])
        expect(extractScenarioList(s)).toEqual([s])
        expect(extractScenarioList('lixo')).toEqual([])
    })

    it('acha a conta por id, nome ou ramal@domínio', () => {
        const a = newAccount({ id: 'id-1', name: 'PBX 1001', extension: '1001', domain: '127.0.0.1' })
        expect(resolveAccount('id-1', [a])).toBe(a)
        expect(resolveAccount('pbx 1001', [a])).toBe(a)
        expect(resolveAccount('1001@127.0.0.1', [a])).toBe(a)
        expect(resolveAccount('1002@127.0.0.1', [a])).toBeUndefined()
    })

    it('escolhe cenários por nome ou id e lista os disponíveis quando não acha', () => {
        const ura = newScenario('a', { id: 'u', name: 'URA 8000' })
        const busy = newScenario('a', { id: 'b', name: 'Ocupado' })
        expect(pickScenarios([ura, busy], ['ocupado', 'u'], false)).toEqual([busy, ura])
        expect(pickScenarios([ura, busy], [], true)).toEqual([ura, busy])
        expect(() => pickScenarios([ura], ['x'], false)).toThrow('cenário "x" não encontrado. Disponíveis: "URA 8000"')
    })
})
