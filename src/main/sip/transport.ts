// Transporte do motor próprio (RF-39): leva o texto das mensagens SIP por UDP, TCP ou TLS.
// Não entende SIP; quem monta, repete e casa pedidos com respostas é o user-agent.

import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { lookup } from 'node:dns/promises'
import { connect as tcpConnect, isIP, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { SipTransportKind } from '@shared/sip-target'
import { StreamFramer } from './message'

export interface TransportOptions {
    kind: SipTransportKind
    host: string
    port: number
    /** TLS: aceita certificado inválido deste host, que o usuário já marcou como confiável (RF-37). */
    trusted?: boolean
}

export interface SipTransport {
    readonly kind: SipTransportKind
    /** TCP e TLS entregam ou avisam; em UDP quem repete o pedido é a transação. */
    readonly reliable: boolean
    /** Endereço local, para o Via e o Contact. Só vale depois de `open`. */
    local: { address: string; port: number }
    onMessage: (text: string) => void
    /** Fechou sem ninguém pedir. */
    onClose: (error?: Error) => void
    open(): Promise<void>
    send(text: string): void
    close(): void
}

export type TransportFactory = (options: TransportOptions) => SipTransport

/** Certificado TLS recusado: a tela oferece "Confiar neste host". */
export class TlsCertificateError extends Error {
    constructor(
        readonly host: string,
        readonly code: string
    ) {
        super(`Certificado TLS de ${host} recusado (${code})`)
    }
}

const CERT_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/
const CONNECT_TIMEOUT_MS = 8000

class UdpTransport implements SipTransport {
    readonly kind = 'udp' as const
    readonly reliable = false
    local = { address: '0.0.0.0', port: 0 }
    onMessage: (text: string) => void = () => {}
    onClose: (error?: Error) => void = () => {}
    private socket?: UdpSocket
    private closed = false

    constructor(private options: TransportOptions) {}

    async open(): Promise<void> {
        const { address, family } = isIP(this.options.host)
            ? { address: this.options.host, family: isIP(this.options.host) }
            : await lookup(this.options.host)
        const socket = createSocket(family === 6 ? 'udp6' : 'udp4')
        this.socket = socket
        await new Promise<void>((ok, fail) => {
            socket.once('error', fail)
            // Socket "conectado": só aceita datagramas do PBX e descobre o endereço local da rota.
            socket.connect(this.options.port, address, () => {
                socket.off('error', fail)
                ok()
            })
        })
        const { address: local, port } = socket.address()
        this.local = { address: local, port }
        socket.on('message', (data) => {
            const text = data.toString('utf8')
            // CRLF soltos são keep-alive.
            if (text.trim()) this.onMessage(text)
        })
        // Porta fechada no PBX chega aqui como ECONNREFUSED (ICMP) no envio seguinte.
        socket.on('error', (error) => this.fail(error))
        socket.on('close', () => this.fail())
    }

    private fail(error?: Error): void {
        if (this.closed) return
        this.close()
        this.onClose(error)
    }

    send(text: string): void {
        if (this.closed) return
        this.socket?.send(text, (error) => {
            if (error) this.fail(error)
        })
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        try {
            this.socket?.close()
        } catch {
            // já fechado
        }
    }
}

class StreamTransport implements SipTransport {
    readonly reliable = true
    local = { address: '0.0.0.0', port: 0 }
    onMessage: (text: string) => void = () => {}
    onClose: (error?: Error) => void = () => {}
    private socket?: Socket
    private framer = new StreamFramer()
    private closed = false

    constructor(private options: TransportOptions) {}

    get kind(): SipTransportKind {
        return this.options.kind
    }

    open(): Promise<void> {
        const { host, port, trusted } = this.options
        return new Promise<void>((ok, fail) => {
            const ready = (): void => {
                socket.setTimeout(0)
                socket.off('error', failed)
                this.local = { address: socket.localAddress ?? '0.0.0.0', port: socket.localPort ?? 0 }
                socket.on('error', (error) => this.fail(error))
                socket.on('close', () => this.fail())
                ok()
            }
            const failed = (error: Error & { code?: string }): void => {
                socket.destroy()
                fail(CERT_CODES.test(error.code ?? '') ? new TlsCertificateError(host, error.code ?? '') : error)
            }
            const socket =
                this.options.kind === 'tls'
                    ? tlsConnect(
                          { host, port, servername: isIP(host) ? undefined : host, rejectUnauthorized: !trusted },
                          ready
                      )
                    : tcpConnect({ host, port }, ready)
            this.socket = socket
            socket.setKeepAlive(true, 30_000)
            socket.setTimeout(CONNECT_TIMEOUT_MS, () => failed(new Error(`Sem resposta de ${host}:${port}`)))
            socket.once('error', failed)
            socket.on('data', (chunk: Buffer) => {
                for (const text of this.framer.push(chunk)) this.onMessage(text)
            })
        })
    }

    private fail(error?: Error): void {
        if (this.closed) return
        this.close()
        this.onClose(error)
    }

    send(text: string): void {
        if (!this.closed) this.socket?.write(text)
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        this.socket?.destroy()
    }
}

export const createTransport: TransportFactory = (options) =>
    options.kind === 'udp' ? new UdpTransport(options) : new StreamTransport(options)
