import { describe, expect, it } from 'vitest'
import {
    canDeleteServer,
    defaultServerId,
    serversWithSimulated,
    simulatedServer,
    SIMULATED_SERVER_ID
} from '../src/shared/servers'
import type { SipServer } from '../src/shared/servers'
import type { Account } from '../src/shared/types'

const server = (id: string): SipServer => ({ ...simulatedServer(), id, name: id })
const account = (serverId: string): Account =>
    ({ id: Math.random().toString(), serverId, tagIds: [] }) as unknown as Account

describe('regras dos servidores', () => {
    it('conta nova vem com o último servidor usado, o primeiro cadastrado ou o simulado', () => {
        const saved = [server('s1'), server('s2')]
        expect(defaultServerId(saved, 's2')).toBe('s2')
        expect(defaultServerId(saved, SIMULATED_SERVER_ID)).toBe(SIMULATED_SERVER_ID)
        expect(defaultServerId(saved, 'apagado')).toBe('s1')
        expect(defaultServerId(saved, null)).toBe('s1')
        expect(defaultServerId([], 's1')).toBe(SIMULATED_SERVER_ID)
    })

    it('não apaga servidor em uso nem o simulado', () => {
        const accounts = [account('s1'), account('s1'), account('s2'), account('')]
        expect(canDeleteServer(server('s1'), accounts)).toEqual({ ok: false, reason: 'em-uso', count: 2 })
        expect(canDeleteServer(server('s3'), accounts)).toEqual({ ok: true })
        expect(canDeleteServer(simulatedServer(), [])).toEqual({ ok: false, reason: 'simulado' })
    })

    it('conta com serverId vazio não usa servidor nenhum', () => {
        expect(canDeleteServer(server('s1'), [account('')])).toEqual({ ok: true })
    })

    it('simulado sempre na lista e nunca gravado', () => {
        expect(serversWithSimulated([]).map((s) => s.id)).toEqual([SIMULATED_SERVER_ID])
        const list = serversWithSimulated([server('s1'), server(SIMULATED_SERVER_ID)])
        expect(list.map((s) => s.id)).toEqual([SIMULATED_SERVER_ID, 's1'])
    })
})
