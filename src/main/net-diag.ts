// Diagnóstico de rede (RF-46), no processo principal: DNS, TLS e STUN precisam de sockets que a
// interface não tem.

import { createSocket } from 'node:dgram'
import { resolveSrv } from 'node:dns/promises'
import { isIP } from 'node:net'
import { randomBytes } from 'node:crypto'
import { connect } from 'node:tls'
import {
    buildStunRequest,
    parseStunResponse,
    type NetDiagRequest,
    type NetDiagResult,
    type SrvRecord,
    type TlsCertificateInfo
} from '@shared/net-diag'

const TIMEOUT_MS = 4000
const SERVICES = ['_sip._udp', '_sip._tcp', '_sips._tcp']

const withTimeout = <T>(promise: Promise<T>, what: string): Promise<T> =>
    Promise.race([
        promise,
        new Promise<never>((_ok, fail) =>
            setTimeout(() => fail(new Error(`${what}: sem resposta em ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)
        )
    ])

/** Registros SRV do SIP (RFC 3263). Domínio sem registros devolve lista vazia, não erro. */
async function lookupSrv(domain: string): Promise<SrvRecord[]> {
    const found: SrvRecord[] = []
    for (const service of SERVICES) {
        const records = await withTimeout(resolveSrv(`${service}.${domain}`), 'DNS').catch(
            (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') return []
                throw error
            }
        )
        for (const r of records)
            found.push({ service, target: r.name, port: r.port, priority: r.priority, weight: r.weight })
    }
    return found.sort((a, b) => a.priority - b.priority || b.weight - a.weight)
}

/** Conecta por TLS só para ler o certificado; aceita qualquer um, porque o objetivo é mostrá-lo. */
export function readCertificate(host: string, port: number): Promise<TlsCertificateInfo> {
    return withTimeout(
        new Promise<TlsCertificateInfo>((ok, fail) => {
            const socket = connect(
                { host, port, servername: isIP(host) ? undefined : host, rejectUnauthorized: false },
                () => {
                    const cert = socket.getPeerCertificate()
                    const names = (cert.subjectaltname ?? '')
                        .split(',')
                        .map((name) => name.trim().replace(/^(DNS|IP Address):/, ''))
                        .filter(Boolean)
                    const describe = (who: typeof cert.subject | undefined): string => {
                        const cn = who?.CN
                        return [Array.isArray(cn) ? cn[0] : cn, who?.O].filter(Boolean).join(', ') || '?'
                    }
                    const info: TlsCertificateInfo = {
                        subject: describe(cert.subject),
                        issuer: describe(cert.issuer),
                        validFrom: cert.valid_from ?? '',
                        validTo: cert.valid_to ?? '',
                        names,
                        trusted: socket.authorized,
                        problem: socket.authorized ? undefined : String(socket.authorizationError ?? '')
                    }
                    socket.destroy()
                    ok(info)
                }
            )
            socket.once('error', fail)
        }),
        'TLS'
    )
}

/** Pergunta a um servidor STUN com que endereço esta máquina aparece do lado de fora. */
export function stunQuery(host: string, port: number): Promise<{ address: string; port: number }> {
    return withTimeout(
        new Promise((ok, fail) => {
            const socket = createSocket('udp4')
            const id = randomBytes(12)
            const done = (error?: Error, value?: { address: string; port: number }): void => {
                socket.close()
                if (value) ok(value)
                else fail(error ?? new Error('resposta STUN inválida'))
            }
            socket.once('error', (error) => done(error))
            socket.on('message', (data) => {
                const mapped = parseStunResponse(data, id)
                if (mapped) done(undefined, mapped)
            })
            socket.send(buildStunRequest(id), port, host, (error) => error && done(error))
            setTimeout(() => {
                try {
                    socket.close()
                } catch {
                    // já fechado pela resposta
                }
            }, TIMEOUT_MS + 100).unref()
        }),
        'STUN'
    )
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export async function diagnoseNetwork(request: NetDiagRequest): Promise<NetDiagResult> {
    const result: NetDiagResult = {}
    const domain = request.domain.trim()
    await Promise.all([
        domain && !isIP(domain)
            ? lookupSrv(domain).then(
                  (srv) => (result.srv = srv),
                  (error) => (result.srvError = message(error))
              )
            : undefined,
        request.tls
            ? readCertificate(request.tls.host, request.tls.port).then(
                  (tls) => (result.tls = tls),
                  (error) => (result.tlsError = message(error))
              )
            : undefined,
        request.stun
            ? stunQuery(request.stun.host, request.stun.port).then(
                  (stun) => (result.stun = stun),
                  (error) => (result.stunError = message(error))
              )
            : undefined
    ])
    return result
}
