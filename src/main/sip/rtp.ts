// RTP (RFC 3550) do motor próprio: manda e recebe o áudio em pacotes de 20 ms e os dígitos como
// telephone-event (RFC 4733), com ou sem cifra (SRTP). O RTCP, na porta seguinte, mede o tempo de ida
// e volta; com SRTP ele não é usado, porque o RTCP cifrado (SRTCP) não foi implementado.

import { createSocket, type Socket } from 'node:dgram'
import { randomBytes } from 'node:crypto'
import { createCodec, type AudioCodec, type CodecInstance } from './codec'
import { SrtpContext } from './srtp'

export const FRAME_SAMPLES = 160
const DTMF_EVENTS = '0123456789*#ABCD'
/** Duração de cada dígito e da pausa depois dele, em amostras (8000 por segundo). */
const DTMF_SAMPLES = 1280
const DTMF_VOLUME = 10
const RTCP_INTERVAL_MS = 5000
/** Segundos entre 1900 (relógio do NTP) e 1970. */
const NTP_OFFSET = 2208988800

/** Os 32 bits do meio do relógio NTP: segundos (16 bits) e fração (16 bits), como o RTCP usa. */
const ntpMiddle = (ms: number): number => {
    const seconds = ms / 1000 + NTP_OFFSET
    return ((Math.floor(seconds) & 0xffff) * 0x10000 + Math.floor((seconds % 1) * 0x10000)) >>> 0
}

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
    /** Tempo de ida e volta medido pelo RTCP; undefined enquanto o outro lado não respondeu. */
    rttMs?: number
}

export interface RtpRemote {
    address: string
    port: number
    codec: AudioCodec
    payload: number
    dtmfPayload?: number
    /** Relógio do telephone-event: 48000 quando acompanha o Opus. */
    dtmfRate?: 8000 | 48000
}

export interface RtpEvents {
    /** 20 ms de áudio recebido, já em PCM de 16 bits. */
    audio(pcm: Int16Array): void
    dtmf(tone: string): void
}

export class RtpSession {
    private socket!: Socket
    private rtcp!: Socket
    private remote?: RtpRemote
    private codec?: CodecInstance
    private rtcpRemote?: { address: string; port: number }
    private srtpOut?: SrtpContext
    private srtpIn?: SrtpContext
    private rtcpTimer?: ReturnType<typeof setInterval>
    private octetsSent = 0
    private remoteSsrc = 0
    private lastSr?: { middle: number; at: number }
    private reported = { received: 0, lost: 0 }
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
    /** Cópia de cada pacote como passou pela rede, para a captura (RF-44). */
    wire?: (direction: 'out' | 'in', data: Buffer, address: string, port: number) => void
    /** Mudo ou espera: o microfone é descartado. */
    sendAudio = true
    receiveAudio = true

    constructor(private events: RtpEvents) {}

    private bind(port: number): Promise<Socket | null> {
        return new Promise((done) => {
            const socket = createSocket('udp4')
            socket.once('error', () => {
                socket.close()
                done(null)
            })
            socket.bind(port, () => {
                socket.removeAllListeners('error')
                done(socket)
            })
        })
    }

    /** Abre a porta do áudio (par, como pede a RFC 3550) e a do RTCP (a seguinte); devolve a do áudio. */
    async open(): Promise<number> {
        for (let attempt = 0; attempt < 20; attempt++) {
            const port = 16384 + 2 * Math.floor(Math.random() * 8000)
            const socket = await this.bind(port)
            const rtcp = socket && (await this.bind(port + 1))
            if (!socket || !rtcp) {
                socket?.close()
                continue
            }
            this.socket = socket
            this.rtcp = rtcp
            socket.on('message', (data, from) => this.receive(data, from.address, from.port))
            socket.on('error', () => this.close())
            rtcp.on('message', (data, from) => this.receiveRtcp(data, from.address, from.port))
            rtcp.on('error', () => undefined)
            if (this.closed) this.closeSockets()
            else this.rtcpTimer = setInterval(() => this.sendRtcp(), RTCP_INTERVAL_MS)
            return port
        }
        throw new Error('Sem porta livre para o áudio')
    }

    setRemote(remote: RtpRemote): void {
        // O codec guarda estado (no Opus): só é trocado quando muda de fato.
        if (this.codec?.name !== remote.codec) {
            this.codec?.close()
            this.codec = createCodec(remote.codec)
        }
        this.remote = { ...remote }
        this.rtcpRemote = { address: remote.address, port: remote.port + 1 }
    }

    /** Liga a cifra (SRTP): a nossa chave para o que sai, a do outro lado para o que chega. */
    setCrypto(keys?: { local: string; remote: string }): void {
        this.srtpOut = keys ? new SrtpContext(keys.local) : undefined
        this.srtpIn = keys ? new SrtpContext(keys.remote) : undefined
    }

    private receive(raw: Buffer, address: string, port: number): void {
        this.wire?.('in', raw, address, port)
        // Com cifra, um pacote que não confere a assinatura é descartado antes de qualquer outra coisa.
        const data = this.srtpIn ? this.srtpIn.unprotect(raw) : raw
        const packet = data && parseRtp(data)
        const remote = this.remote
        if (!packet || !remote) return
        this.remoteSsrc = packet.ssrc
        // RTP simétrico: atrás de NAT, o endereço de onde o áudio chega vale mais que o do SDP.
        if (remote.address !== address || remote.port !== port) {
            remote.address = address
            remote.port = port
        }
        this.count(packet)
        if (packet.payloadType === remote.dtmfPayload) return this.receiveDtmf(packet)
        if (packet.payloadType !== remote.payload || !this.receiveAudio) return
        try {
            this.events.audio(this.codec!.decode(packet.payload))
        } catch {
            // Pacote que o codec não entende (corrompido): fica um buraco de 20 ms.
        }
    }

    private count(packet: RtpPacket): void {
        this.stats.packetsReceived++
        if (this.highest !== undefined) {
            const gap = (packet.sequence - this.highest + 0x10000) & 0xffff
            // Um salto pequeno para a frente é perda; para trás (ou enorme) é pacote fora de ordem.
            if (gap > 1 && gap < 3000) this.stats.packetsLost += gap - 1
            if (gap > 0 && gap < 3000) this.highest = packet.sequence
        } else this.highest = packet.sequence
        // Em unidades do relógio do codec: 8 por milissegundo no G.711, 48 no Opus.
        const perMs = 8 * (this.codec?.clockScale ?? 1)
        const transit = Date.now() * perMs - packet.timestamp
        if (this.transit !== undefined && packet.payloadType === this.remote?.payload) {
            const delta = Math.abs(transit - this.transit)
            this.jitter += (delta - this.jitter) / 16
        }
        this.transit = transit
        this.stats.jitterMs = Math.round(this.jitter / perMs)
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
        const plain = buildRtp({ payloadType, marker, sequence: this.sequence, timestamp, ssrc: this.ssrc, payload })
        const data = this.srtpOut ? this.srtpOut.protect(plain) : plain
        this.sequence = (this.sequence + 1) & 0xffff
        this.stats.packetsSent++
        this.octetsSent += payload.length
        this.wire?.('out', data, remote.address, remote.port)
        this.socket.send(data, remote.port, remote.address, () => undefined)
    }

    /** 20 ms do microfone. O relógio do RTP anda mesmo quando nada é mandado. */
    sendPcm(pcm: Int16Array): void {
        const remote = this.remote
        const codec = this.codec
        if (remote && codec && this.sendAudio && !this.sendingDtmf) {
            this.send(remote.payload, codec.encode(pcm), this.markNext)
            this.markNext = false
        } else this.markNext = true
        this.timestamp = (this.timestamp + pcm.length * (codec?.clockScale ?? 1)) >>> 0
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
            // A duração vai no relógio do telephone-event negociado.
            const scale = this.remote?.dtmfRate === 48000 ? 6 : 1
            const wait = (): Promise<void> => new Promise((done) => setTimeout(done, 20))
            const packet = (duration: number, end: boolean): Buffer => {
                const body = Buffer.alloc(4)
                body[0] = event
                body[1] = (end ? 0x80 : 0) | DTMF_VOLUME
                body.writeUInt16BE(duration * scale, 2)
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
            if (this.timestamp === start)
                this.timestamp = (start + (DTMF_SAMPLES + 4 * FRAME_SAMPLES) * (this.codec?.clockScale ?? 1)) >>> 0
            this.sendingDtmf = false
        })
        this.dtmfQueue = run.catch(() => {
            this.sendingDtmf = false
        })
        return run
    }

    // ─── RTCP ──────────────────────────────────────────────────────────────

    /** Relatório de quem envia (SR), com um bloco sobre o que recebemos, mais o SDES obrigatório. */
    private sendRtcp(): void {
        const to = this.rtcpRemote
        if (!to || this.closed || this.srtpOut) return
        const now = Date.now()
        const seconds = now / 1000 + NTP_OFFSET
        const hasBlock = this.highest !== undefined
        const sr = Buffer.alloc(28 + (hasBlock ? 24 : 0))
        sr[0] = 0x80 | (hasBlock ? 1 : 0)
        sr[1] = 200
        sr.writeUInt16BE(sr.length / 4 - 1, 2)
        sr.writeUInt32BE(this.ssrc, 4)
        sr.writeUInt32BE(Math.floor(seconds) >>> 0, 8)
        sr.writeUInt32BE(Math.floor((seconds % 1) * 0x100000000) >>> 0, 12)
        sr.writeUInt32BE(this.timestamp, 16)
        sr.writeUInt32BE(this.stats.packetsSent >>> 0, 20)
        sr.writeUInt32BE(this.octetsSent >>> 0, 24)
        if (hasBlock) {
            // Fração perdida desde o último relatório, em 1/256.
            const received = this.stats.packetsReceived - this.reported.received
            const lost = this.stats.packetsLost - this.reported.lost
            this.reported = { received: this.stats.packetsReceived, lost: this.stats.packetsLost }
            const fraction = received + lost > 0 ? Math.min(255, Math.floor((lost * 256) / (received + lost))) : 0
            sr.writeUInt32BE(this.remoteSsrc, 28)
            sr[32] = fraction
            sr.writeUIntBE(Math.min(0x7fffff, this.stats.packetsLost), 33, 3)
            sr.writeUInt32BE(this.highest!, 36)
            sr.writeUInt32BE(Math.round(this.jitter) >>> 0, 40)
            sr.writeUInt32BE(this.lastSr?.middle ?? 0, 44)
            sr.writeUInt32BE(this.lastSr ? Math.round(((now - this.lastSr.at) / 1000) * 0x10000) >>> 0 : 0, 48)
        }
        const cname = Buffer.from('iris')
        const sdes = Buffer.alloc(16)
        sdes[0] = 0x81
        sdes[1] = 202
        sdes.writeUInt16BE(3, 2)
        sdes.writeUInt32BE(this.ssrc, 4)
        sdes[8] = 1
        sdes[9] = cname.length
        cname.copy(sdes, 10)
        this.rtcp.send(Buffer.concat([sr, sdes]), to.port, to.address, () => undefined)
    }

    private receiveRtcp(data: Buffer, address: string, port: number): void {
        if (this.srtpIn || !this.rtcpRemote) return
        this.rtcpRemote = { address, port }
        const now = Date.now()
        // Vários relatórios vêm colados num datagrama só.
        for (let offset = 0; offset + 8 <= data.length;) {
            const count = data[offset]! & 0x1f
            const type = data[offset + 1]!
            const length = (data.readUInt16BE(offset + 2) + 1) * 4
            if (data[offset]! >> 6 !== 2 || offset + length > data.length) return
            let block = -1
            if (type === 200 && length >= 28) {
                this.lastSr = { middle: data.readUInt32BE(offset + 10), at: now }
                block = offset + 28
            } else if (type === 201) block = offset + 8
            for (let i = 0; block >= 0 && i < count && block + 24 <= offset + length; i++, block += 24) {
                if (data.readUInt32BE(block) !== this.ssrc) continue
                const lsr = data.readUInt32BE(block + 16)
                const dlsr = data.readUInt32BE(block + 20)
                if (!lsr) continue
                // Ida e volta = agora − quando mandamos o relatório − quanto o outro lado segurou (RFC 3550, 6.4.1).
                const units = (ntpMiddle(now) - lsr - dlsr) >>> 0
                const ms = Math.round((units / 0x10000) * 1000)
                if (ms < 10_000) this.stats.rttMs = ms
            }
            offset += length
        }
    }

    getStats(): RtpStats {
        return { ...this.stats }
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        clearInterval(this.rtcpTimer)
        this.codec?.close()
        this.closeSockets()
    }

    private closeSockets(): void {
        for (const socket of [this.socket, this.rtcp]) {
            try {
                socket?.close()
            } catch {
                // já fechado
            }
        }
    }
}
