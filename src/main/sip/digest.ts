// Autenticação digest do SIP (RFC 3261, 22.4; RFC 2617 e RFC 8760), sem biblioteca.
// Responde aos desafios 401 (WWW-Authenticate) e 407 (Proxy-Authenticate) com MD5 ou SHA-256.

import { createHash, randomBytes } from 'node:crypto'

export interface DigestChallenge {
    realm: string
    nonce: string
    algorithm: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess'
    qop?: 'auth'
    opaque?: string
    stale: boolean
}

export class DigestError extends Error {}

/** Lê `Digest realm="x", nonce="y", qop="auth,auth-int", algorithm=MD5`. */
export function parseChallenge(value: string): DigestChallenge {
    if (!/^\s*digest\s/i.test(value)) throw new DigestError(`Desafio sem Digest: ${value.slice(0, 60)}`)
    const params: Record<string, string> = {}
    const re = /([a-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/gi
    for (let m = re.exec(value); m; m = re.exec(value)) params[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? ''
    if (!params['realm'] || params['nonce'] === undefined) throw new DigestError('Desafio sem realm ou nonce')
    const algorithm = (params['algorithm'] ?? 'MD5')
        .toUpperCase()
        .replace('SHA-256-SESS', 'SHA-256-sess')
        .replace('MD5-SESS', 'MD5-sess')
    if (!['MD5', 'MD5-sess', 'SHA-256', 'SHA-256-sess'].includes(algorithm))
        throw new DigestError(`Algoritmo de autenticação não suportado: ${params['algorithm']}`)
    const qops = (params['qop'] ?? '').split(',').map((q) => q.trim().toLowerCase())
    // auth-int (que assina o corpo) não é suportado; sem "auth" na lista, responde no modo antigo.
    return {
        realm: params['realm'],
        nonce: params['nonce'],
        algorithm: algorithm as DigestChallenge['algorithm'],
        qop: qops.includes('auth') ? 'auth' : undefined,
        opaque: params['opaque'],
        stale: (params['stale'] ?? '').toLowerCase() === 'true'
    }
}

export interface DigestInput {
    challenge: DigestChallenge
    method: string
    uri: string
    username: string
    password: string
    /** Contador do nonce: cresce a cada uso do mesmo nonce com qop. */
    nc?: number
    /** Só para testes; normalmente aleatório. */
    cnonce?: string
}

const hash = (algorithm: string, text: string): string =>
    createHash(algorithm.startsWith('SHA-256') ? 'sha256' : 'md5')
        .update(text, 'utf8')
        .digest('hex')

/** Monta o valor do cabeçalho Authorization (ou Proxy-Authorization). */
export function digestAuthorization(input: DigestInput): string {
    const { challenge: c, method, uri, username, password } = input
    const nc = (input.nc ?? 1).toString(16).padStart(8, '0')
    const cnonce = input.cnonce ?? randomBytes(8).toString('hex')
    let ha1 = hash(c.algorithm, `${username}:${c.realm}:${password}`)
    if (c.algorithm.endsWith('-sess')) ha1 = hash(c.algorithm, `${ha1}:${c.nonce}:${cnonce}`)
    const ha2 = hash(c.algorithm, `${method}:${uri}`)
    const response = c.qop
        ? hash(c.algorithm, `${ha1}:${c.nonce}:${nc}:${cnonce}:${c.qop}:${ha2}`)
        : hash(c.algorithm, `${ha1}:${c.nonce}:${ha2}`)

    const quote = (v: string): string => `"${v.replace(/(["\\])/g, '\\$1')}"`
    const parts = [
        `username=${quote(username)}`,
        `realm=${quote(c.realm)}`,
        `nonce=${quote(c.nonce)}`,
        `uri=${quote(uri)}`,
        `response=${quote(response)}`,
        `algorithm=${c.algorithm}`
    ]
    if (c.opaque !== undefined) parts.push(`opaque=${quote(c.opaque)}`)
    if (c.qop) parts.push(`qop=${c.qop}`, `nc=${nc}`, `cnonce=${quote(cnonce)}`)
    return `Digest ${parts.join(', ')}`
}
