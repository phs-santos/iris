// RTP (RFC 3550) do motor próprio: manda e recebe o áudio em pacotes de 20 ms e os dígitos como
// telephone-event (RFC 4733). Sem cifra; o SRTP entra com a terceira entrega do RF-39.

import { createSocket, type Socket } from 'node:dgram'
import { randomBytes } from 'node:crypto'
import { decodeG711, encodeG711, type G711 } from './g711'

export const FRAME_SAMPLES = 160
const DTMF_EVENTS = '0123456789*#ABCD'
/** Duração de cada dígito e da pausa depois dele, em amostras (8000 por segundo). */
const DTMF_SAMPLES = 1280
const DTMF_VOLUME = 10

export interface RtpPacket {
    payloadType: number
    marker: boolean
    sequence: number
    timestamp: number
    ssrc: number
    payload: Buffer
}

export function parseRtp(data: Buffer): RtpPacket | null {
    if (data.length < 12 || data[0]! >> 6 !== 2) return null
    const csrc = data[0]! & 0x0f
    let offset = 12 + csrc * 4
    // Extensão de cabeçalho: pula.
    if (data[0]! & 0x10) {
        if (data.length < offset + 4) return null
        offset += 4 + data.readUInt16BE(offset + 2) * 4
    }
    let end = data.length
    if (data[0]! & 0x20) end -= data[data.length - 1]!
    if (end < offset) return null
    return {
        payloadType: data[1]! & 0x7f,
        marker: Boolean(data[1]! & 0x80),
        sequence: data.readUInt16BE(2),
        timestamp: data.readUInt32BE(4),
        ssrc: data.readUInt32BE(8),
        payload: data.subarray(offset, end)
    }
}

export function buildRtp(packet: RtpPacket): Buffer {
    const header = Buffer.alloc(12)
    header[0] = 0x80
    header[1] = (packet.marker ? 0x80 : 0) | (packet.payloadType & 0x7f)
    header.writeUInt16BE(packet.sequence & 0xffff, 2)
    header.writeUInt32BE(packet.timestamp >>> 0, 4)
    header.writeUInt32BE(packet.ssrc >>> 0, 8)
    return Buffer.concat([header, packet.payload])
}

export interface RtpStats {
    packetsSent: number
    packetsReceived: number
    packetsLost: number
    /** Variação do atraso entre pacotes (RFC 3550, 6.4.1), em milissegundos. */
    jitterMs: number
}

export interface RtpRemote {
    address: string
    port: number
    codec: G711
    payload: number
    dtmfPayload?: number
}

export interface RtpEvents {
    /** 20 ms de áudio recebido, já em PCM de 16 bits. */
    audio(pcm: Int16Array): void
    dtmf(tone: string): void
}

export class RtpSession {
    private socket: Socket
    private remote?: RtpRemote
    private sequence = randomBytes(2).readUInt16BE(0)
    private timestamp = randomBytes(4).readUInt32BE(0)
    private readonly ssrc = randomBytes(4).readUInt32BE(0)
    private stats: RtpStats = { packetsSent: 0, packetsReceived: 0, packetsLost: 0, jitterMs: 0 }
    private highest?: number
    private transit?: number
    private jitter = 0
    private lastDtmf?: number
    private markNext = true
    /** Dígitos na fila: enquanto um dígito sai, o áudio do microfone não vai. */
    private dtmfQueue: Promise<void> = Promise.resolve()
    private sendingDtmf = false
    private closed = false
    /** Mudo ou espera: o microfone é descartado. */
    sendAudio = true
    receiveAudio = true

    constructor(private events: RtpEvents) {
        this.socket = createSocket('udp4')
        this.socket.on('message', (data, from) => this.receive(data, from.address, from.port))
        this.socket.on('error', () => this.close())
    }

    /** Abre a porta local (par, como pede a RFC 3550) e devolve o número. */
    async open(): Promise<number> {
        for (let attempt = 0; attempt < 20; attempt++) {
            const port = 16384 + 2 * Math.floor(Math.random() * 8000)
            const bound = await new Promise<boolean>((done) => {
                const failed = (): void => done(false)
                this.socket.once('error', failed)
                this.socket.bind(port, () => {
                    this.socket.off('error', failed)
                    done(true)
                })
            })
            if (bound) return port
        }
        throw new Error('Sem porta livre para o áudio')
    }

    setRemote(remote: RtpRemote): void {
        this.remote = { ...remote }
    }

    private receive(data: Buffer, address: string, port: number): void {
        const packet = parseRtp(data)
        const remote = this.remote
        if (!packet || !remote) return
        // RTP simétrico: atrás de NAT, o endereço de onde o áudio chega vale mais que o do SDP.
        if (remote.address !== address || remote.port !== port) {
            remote.address = address
            remote.port = port
        }
        this.count(packet)
        if (packet.payloadType === remote.dtmfPayload) return this.receiveDtmf(packet)
        if (packet.payloadType !== remote.payload || !this.receiveAudio) return
        this.events.audio(decodeG711(remote.codec, packet.payload))
    }

    private count(packet: RtpPacket): void {
        this.stats.packetsReceived++
        if (this.highest !== undefined) {
            const gap = (packet.sequence - this.highest + 0x10000) & 0xffff
            // Um salto pequeno para a frente é perda; para trás (ou enorme) é pacote fora de ordem.
            if (gap > 1 && gap < 3000) this.stats.packetsLost += gap - 1
            if (gap > 0 && gap < 3000) this.highest = packet.sequence
        } else this.highest = packet.sequence
        const transit = Date.now() * 8 - packet.timestamp
        if (this.transit !== undefined && packet.payloadType === this.remote?.payload) {
            const delta = Math.abs(transit - this.transit)
            this.jitter += (delta - this.jitter) / 16
        }
        this.transit = transit
        this.stats.jitterMs = Math.round(this.jitter / 8)
    }

    /** O mesmo dígito chega em vários pacotes; o que marca o fim (bit E) vale uma vez por timestamp. */
    private receiveDtmf(packet: RtpPacket): void {
        if (packet.payload.length < 4 || !(packet.payload[1]! & 0x80)) return
        if (this.lastDtmf === packet.timestamp) return
        this.lastDtmf = packet.timestamp
        const tone = DTMF_EVENTS[packet.payload[0]!]
        if (tone) this.events.dtmf(tone)
    }

    private send(payloadType: number, payload: Buffer, marker: boolean, timestamp = this.timestamp): void {
        const remote = this.remote
        if (!remote || this.closed) return
        const data = buildRtp({ payloadType, marker, sequence: this.sequence, timestamp, ssrc: this.ssrc, payload })
        this.sequence = (this.sequence + 1) & 0xffff
        this.stats.packetsSent++
        this.socket.send(data, remote.port, remote.address, () => undefined)
    }

    /** 20 ms do microfone. O relógio do RTP anda mesmo quando nada é mandado. */
    sendPcm(pcm: Int16Array): void {
        const remote = this.remote
        if (remote && this.sendAudio && !this.sendingDtmf) {
            this.send(remote.payload, encodeG711(remote.codec, pcm), this.markNext)
            this.markNext = false
        } else this.markNext = true
        this.timestamp = (this.timestamp + pcm.length) >>> 0
    }

    /** Dígito por RTP (RFC 4733): pacotes a cada 20 ms com a duração crescendo e três de fim. */
    sendDtmf(tone: string): Promise<void> {
        const event = DTMF_EVENTS.indexOf(tone.toUpperCase())
        const payloadType = this.remote?.dtmfPayload
        if (event < 0) return Promise.reject(new Error(`Dígito inválido: ${tone}`))
        if (payloadType === undefined) return Promise.reject(new Error('O outro lado não aceita DTMF por RTP'))
        const run = this.dtmfQueue.then(async () => {
            this.sendingDtmf = true
            const start = this.timestamp
            const wait = (): Promise<void> => new Promise((done) => setTimeout(done, 20))
            const packet = (duration: number, end: boolean): Buffer => {
                const body = Buffer.alloc(4)
                body[0] = event
                body[1] = (end ? 0x80 : 0) | DTMF_VOLUME
                body.writeUInt16BE(duration, 2)
                return body
            }
            for (let duration = FRAME_SAMPLES; duration <= DTMF_SAMPLES; duration += FRAME_SAMPLES) {
                this.send(payloadType, packet(duration, false), duration === FRAME_SAMPLES, start)
                await wait()
            }
            for (let i = 0; i < 3; i++) this.send(payloadType, packet(DTMF_SAMPLES, true), false, start)
            // Pausa entre dígitos, para o PBX separar dois iguais seguidos.
            for (let i = 0; i < 4; i++) await wait()
            // Sem microfone (ou em mudo total) o relógio não andou: o próximo dígito precisa de outro
            // timestamp, senão o outro lado o toma por repetição deste.
            if (this.timestamp === start) this.timestamp = (start + DTMF_SAMPLES + 4 * FRAME_SAMPLES) >>> 0
            this.sendingDtmf = false
        })
        this.dtmfQueue = run.catch(() => {
            this.sendingDtmf = false
        })
        return run
    }

    getStats(): RtpStats {
        return { ...this.stats }
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        try {
            this.socket.close()
        } catch {
            // já fechado
        }
    }
}
