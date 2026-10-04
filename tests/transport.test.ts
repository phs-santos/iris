import { createSocket } from 'node:dgram'
import { createServer, type AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createTransport } from '../src/main/sip/transport'

const OPTIONS = 'OPTIONS sip:pbx SIP/2.0\r\nCall-ID: a\r\nCSeq: 1 OPTIONS\r\nContent-Length: 0\r\n\r\n'
const OK = 'SIP/2.0 200 OK\r\nCall-ID: a\r\nCSeq: 1 OPTIONS\r\nContent-Length: 0\r\n\r\n'
const closers: (() => void)[] = []
afterEach(() => closers.splice(0).forEach((close) => close()))

const next = <T>(register: (resolve: (value: T) => void) => void): Promise<T> => new Promise(register)

describe('transporte do motor próprio (RF-39)', () => {
    it('UDP: manda, recebe e ignora o keep-alive', async () => {
        const server = createSocket('udp4')
        closers.push(() => server.close())
        await next<void>((ok) => server.bind(0, '127.0.0.1', ok))
        server.on('message', (data, from) => {
            server.send('\r\n\r\n', from.port, from.address)
            if (data.toString().startsWith('OPTIONS')) server.send(OK, from.port, from.address)
        })

        const transport = createTransport({ kind: 'udp', host: '127.0.0.1', port: server.address().port })
        closers.push(() => transport.close())
        const received: string[] = []
        const got = next<void>((ok) => {
            transport.onMessage = (text) => {
                received.push(text)
                ok()
            }
        })
        await transport.open()
        expect(transport.reliable).toBe(false)
        expect(transport.local.address).toBe('127.0.0.1')
        expect(transport.local.port).toBeGreaterThan(0)
        transport.send(OPTIONS)
        await got
        expect(received).toEqual([OK])
    })

    it('TCP: separa duas mensagens que chegam juntas e uma que chega em pedaços', async () => {
        const server = createServer((socket) => {
            socket.once('data', () => {
                socket.write(OK + OK.slice(0, 20))
                setTimeout(() => socket.write(OK.slice(20)), 20)
            })
        })
        closers.push(() => server.close())
        await next<void>((ok) => server.listen(0, '127.0.0.1', ok))

        const transport = createTransport({
            kind: 'tcp',
            host: '127.0.0.1',
            port: (server.address() as AddressInfo).port
        })
        closers.push(() => transport.close())
        const received: string[] = []
        const got = next<void>((ok) => {
            transport.onMessage = (text) => {
                received.push(text)
                if (received.length === 2) ok()
            }
        })
        await transport.open()
        expect(transport.reliable).toBe(true)
        transport.send(OPTIONS)
        await got
        expect(received).toEqual([OK, OK])
    })

    it('TCP: avisa quando o PBX fecha a conexão', async () => {
        const server = createServer((socket) => socket.destroy())
        closers.push(() => server.close())
        await next<void>((ok) => server.listen(0, '127.0.0.1', ok))
        const transport = createTransport({
            kind: 'tcp',
            host: '127.0.0.1',
            port: (server.address() as AddressInfo).port
        })
        const closed = next<void>((ok) => (transport.onClose = () => ok()))
        await transport.open()
        await closed
        // Depois de fechado, mandar não quebra.
        transport.send(OPTIONS)
    })

    it('TCP: porta fechada vira erro ao abrir', async () => {
        const server = createServer()
        await next<void>((ok) => server.listen(0, '127.0.0.1', ok))
        const port = (server.address() as AddressInfo).port
        await next<void>((ok) => server.close(() => ok()))
        await expect(createTransport({ kind: 'tcp', host: '127.0.0.1', port }).open()).rejects.toThrow()
    })
})
