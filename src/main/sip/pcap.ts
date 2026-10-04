// Captura para o Wireshark (RF-44): guarda as mensagens SIP e os pacotes RTP de uma conta de SIP puro
// e escreve um arquivo PCAP. Cada mensagem vira um pacote IPv4 + UDP montado aqui, com os endereços e
// as portas de verdade. Em TCP e TLS o conteúdo também sai como UDP: o Wireshark mostra o SIP do mesmo
// jeito, e no TLS o que aparece é o texto já decifrado, que é o que interessa para diagnosticar.

import { isIPv4 } from 'node:net'

export interface Endpoint {
    address: string
    port: number
}

interface Packet {
    at: number
    rtp: boolean
    data: Buffer
}

/** Limite da captura na memória: ao passar, os pacotes mais antigos saem. */
export const CAPTURE_LIMIT_BYTES = 30 * 1024 * 1024
const LINKTYPE_RAW = 101

const ipv4 = (address: string): number[] => (isIPv4(address) ? address.split('.').map(Number) : [127, 0, 0, 1])

/** Monta o pacote IPv4 + UDP em volta do conteúdo. */
export function udpPacket(from: Endpoint, to: Endpoint, payload: Buffer): Buffer {
    const total = 20 + 8 + payload.length
    const header = Buffer.alloc(28)
    header[0] = 0x45
    header.writeUInt16BE(Math.min(total, 0xffff), 2)
    header[8] = 64
    header[9] = 17
    header.set(ipv4(from.address), 12)
    header.set(ipv4(to.address), 16)
    // Soma de verificação do cabeçalho IP; a do UDP fica em zero, que o IPv4 permite.
    let sum = 0
    for (let i = 0; i < 20; i += 2) sum += header.readUInt16BE(i)
    while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16)
    header.writeUInt16BE(~sum & 0xffff, 10)
    header.writeUInt16BE(from.port & 0xffff, 20)
    header.writeUInt16BE(to.port & 0xffff, 22)
    header.writeUInt16BE(Math.min(8 + payload.length, 0xffff), 24)
    return Buffer.concat([header, payload])
}

export class PacketCapture {
    private packets: Packet[] = []
    private bytes = 0

    constructor(private limit = CAPTURE_LIMIT_BYTES) {}

    add(from: Endpoint, to: Endpoint, payload: Buffer | string, rtp = false, at = Date.now()): void {
        const data = udpPacket(from, to, typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload)
        this.packets.push({ at, rtp, data })
        this.bytes += data.length
        while (this.bytes > this.limit && this.packets.length > 1) this.bytes -= this.packets.shift()!.data.length
    }

    get count(): number {
        return this.packets.length
    }

    /** Arquivo PCAP clássico, em ordem de tempo. Sem `withRtp`, só a sinalização. */
    toPcap(withRtp: boolean): Buffer {
        const chosen = this.packets.filter((p) => withRtp || !p.rtp).sort((a, b) => a.at - b.at)
        const header = Buffer.alloc(24)
        header.writeUInt32LE(0xa1b2c3d4, 0)
        header.writeUInt16LE(2, 4)
        header.writeUInt16LE(4, 6)
        header.writeUInt32LE(65535, 16)
        header.writeUInt32LE(LINKTYPE_RAW, 20)
        const parts: Buffer[] = [header]
        for (const packet of chosen) {
            const record = Buffer.alloc(16)
            record.writeUInt32LE(Math.floor(packet.at / 1000), 0)
            record.writeUInt32LE((packet.at % 1000) * 1000, 4)
            record.writeUInt32LE(packet.data.length, 8)
            record.writeUInt32LE(packet.data.length, 12)
            parts.push(record, packet.data)
        }
        return Buffer.concat(parts)
    }
}
