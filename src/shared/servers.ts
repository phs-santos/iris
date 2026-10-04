// Cadastro de servidores (RF-51): os dados de conexão de um PBX, reaproveitados pelas contas.

import type { Account, Preset } from './types'
import type { AccountTransport } from './sip-target'

export interface SipServer {
    id: string
    name: string
    domain: string
    transport: AccountTransport
    /** Com transporte ws: o endereço do WebSocket. */
    wssUrl: string
    /** Com SIP puro: host e porta, se diferentes do domínio. */
    sipServer: string
    iceServers: string
    preset: Preset
    srtp?: boolean
}

export interface ServersFile {
    schemaVersion: 1
    servers: SipServer[]
}

/** Campos da conta que vêm do servidor: os outros (ramal, senha, nome) são de cada conta. */
export const SERVER_FIELDS = ['domain', 'transport', 'wssUrl', 'sipServer', 'iceServers', 'preset', 'srtp'] as const

const text = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max

export function isSipServer(v: unknown): v is SipServer {
    if (!v || typeof v !== 'object') return false
    const s = v as Record<string, unknown>
    return (
        text(s.id, 200) &&
        text(s.name, 200) &&
        text(s.domain, 255) &&
        ['ws', 'udp', 'tcp', 'tls'].includes(s.transport as string) &&
        text(s.wssUrl, 500) &&
        text(s.sipServer, 300) &&
        text(s.iceServers, 2000) &&
        ['asterisk', 'kamailio', 'generic'].includes(s.preset as string) &&
        (s.srtp === undefined || typeof s.srtp === 'boolean')
    )
}

/** Copia os dados de conexão do servidor para a conta e liga os dois. */
export function applyServer(account: Account, server: SipServer): Account {
    return {
        ...account,
        serverId: server.id,
        domain: server.domain,
        transport: server.transport,
        wssUrl: server.transport === 'ws' ? server.wssUrl : '',
        sipServer: server.transport === 'ws' ? '' : server.sipServer,
        iceServers: server.iceServers,
        preset: server.preset,
        srtp: server.transport !== 'ws' && server.srtp ? true : undefined
    }
}

/** Monta um servidor com os dados de conexão de uma conta, para cadastrar a partir dela. */
export function serverFromAccount(account: Account, id: string, name?: string): SipServer {
    const transport = account.transport ?? 'ws'
    return {
        id,
        name: name || account.domain || 'Servidor',
        domain: account.domain,
        transport,
        wssUrl: transport === 'ws' ? account.wssUrl : '',
        sipServer: transport === 'ws' ? '' : (account.sipServer ?? ''),
        iceServers: account.iceServers,
        preset: account.preset,
        srtp: transport !== 'ws' && account.srtp ? true : undefined
    }
}

/** A conta ainda bate com o servidor? Se alguém mexeu na conexão dela à mão, ela se soltou. */
export function matchesServer(account: Account, server: SipServer): boolean {
    const linked = applyServer(account, server)
    return SERVER_FIELDS.every((field) => (linked[field] ?? '') === (account[field] ?? ''))
}
