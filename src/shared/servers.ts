// Cadastro de servidores (RF-51): os dados de conexão de um PBX, reaproveitados pelas contas.

import type { Account, DtmfMode, Preset } from './types'
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
    /** Não aparece no formulário; servidor novo vale `'asterisk'`. O `easysip-engine` ainda usa. */
    preset: Preset
    srtp?: boolean
    dtmfMode?: DtmfMode
}

export interface ServersFile {
    schemaVersion: 2
    servers: SipServer[]
}

/** Servidor fixo do PBX simulado (RF-32): não fica em servers.json, não se edita nem se apaga. */
export const SIMULATED_SERVER_ID = 'simulado'

export function simulatedServer(): SipServer {
    return {
        id: SIMULATED_SERVER_ID,
        name: 'PBX simulado',
        domain: 'demo.local',
        transport: 'udp',
        wssUrl: '',
        sipServer: '',
        iceServers: '',
        preset: 'asterisk'
    }
}

export const isSimulated = (account: Pick<Account, 'serverId'>): boolean => account.serverId === SIMULATED_SERVER_ID

/** O simulado sempre primeiro; ele nunca é gravado em servers.json, então um igual vindo do arquivo é ignorado. */
export function serversWithSimulated(saved: SipServer[]): SipServer[] {
    return [simulatedServer(), ...saved.filter((s) => s.id !== SIMULATED_SERVER_ID)]
}

/**
 * Servidor que já vem escolhido numa conta nova: o da última conta salva, se ainda existe; senão o primeiro
 * cadastrado; sem nenhum cadastrado, o simulado.
 */
export function defaultServerId(saved: SipServer[], lastUsed: string | null | undefined): string {
    if (lastUsed && (lastUsed === SIMULATED_SERVER_ID || saved.some((s) => s.id === lastUsed))) return lastUsed
    return saved.find((s) => s.id !== SIMULATED_SERVER_ID)?.id ?? SIMULATED_SERVER_ID
}

export type DeleteServerCheck = { ok: true } | { ok: false; reason: 'simulado' | 'em-uso'; count?: number }

/** Não se apaga o simulado nem um servidor que alguma conta usa. Conta com serverId vazio não usa nenhum. */
export function canDeleteServer(server: SipServer, accounts: Account[]): DeleteServerCheck {
    if (server.id === SIMULATED_SERVER_ID) return { ok: false, reason: 'simulado' }
    const count = accounts.filter((a) => a.serverId === server.id).length
    return count > 0 ? { ok: false, reason: 'em-uso', count } : { ok: true }
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
        (s.srtp === undefined || typeof s.srtp === 'boolean') &&
        (s.dtmfMode === undefined || ['auto', 'sip-info', 'rtp-event'].includes(s.dtmfMode as string))
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

/**
 * Leva a edição de um servidor para uma conta ligada a ele, sem apagar o que a conta mudou no Avançado: cada campo
 * de conexão só acompanha o servidor novo se, antes, a conta tinha o mesmo valor que o servidor antigo dava.
 */
export function updateFromServer(account: Account, before: SipServer, after: SipServer): Account {
    const old = applyServer(account, before)
    const next = applyServer(account, after)
    const result: Account = { ...account, serverId: after.id }
    for (const field of SERVER_FIELDS) {
        const same = JSON.stringify(old[field] ?? '') === JSON.stringify(account[field] ?? '')
        if (same) Object.assign(result, { [field]: next[field] })
    }
    return result
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
