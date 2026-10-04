// SRTP (RFC 3711) do motor próprio: cifra o áudio com AES em modo contador e assina cada pacote com
// HMAC-SHA1 de 80 bits (AES_CM_128_HMAC_SHA1_80). As chaves são trocadas no SDP (SDES, RFC 4568),
// por isso só protegem de verdade quando a sinalização vai por TLS.

import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SRTP_SUITE = 'AES_CM_128_HMAC_SHA1_80'
const KEY_BYTES = 16
const SALT_BYTES = 14
const TAG_BYTES = 10

/** Chave mestra e sal, como vão no SDP: 30 bytes em base64 depois de `inline:`. */
export function newSrtpKey(): string {
    return randomBytes(KEY_BYTES + SALT_BYTES).toString('base64')
}

export const isSrtpKey = (text: string): boolean => Buffer.from(text, 'base64').length === KEY_BYTES + SALT_BYTES

/** AES em modo contador: o fluxo de bytes que será somado (XOR) ao texto. */
function keystream(key: Buffer, iv: Buffer, length: number): Buffer {
    return createCipheriv('aes-128-ctr', key, iv).update(Buffer.alloc(length))
}

/** Deriva uma chave de sessão da chave mestra (RFC 3711, 4.3.1), com taxa de derivação zero. */
export function deriveKey(masterKey: Buffer, masterSalt: Buffer, label: number, length: number): Buffer {
    const iv = Buffer.alloc(16)
    masterSalt.copy(iv)
    iv[7] = iv[7]! ^ label
    return keystream(masterKey, iv, length)
}

export class SrtpContext {
    private encKey: Buffer
    private authKey: Buffer
    private salt: Buffer
    /** Quantas vezes o número de sequência (16 bits) já deu a volta. */
    private roc = 0
    private lastSeq?: number

    constructor(inlineKey: string) {
        const material = Buffer.from(inlineKey, 'base64')
        if (material.length !== KEY_BYTES + SALT_BYTES) throw new Error('Chave SRTP com tamanho errado')
        const key = material.subarray(0, KEY_BYTES)
        const salt = material.subarray(KEY_BYTES)
        this.encKey = deriveKey(key, salt, 0x00, KEY_BYTES)
        this.authKey = deriveKey(key, salt, 0x01, 20)
        this.salt = deriveKey(key, salt, 0x02, SALT_BYTES)
    }

    private headerLength(packet: Buffer): number {
        let length = 12 + (packet[0]! & 0x0f) * 4
        if (packet[0]! & 0x10) length += 4 + packet.readUInt16BE(length + 2) * 4
        return length
    }

    private crypt(packet: Buffer, roc: number): Buffer {
        const header = this.headerLength(packet)
        const iv = Buffer.alloc(16)
        this.salt.copy(iv)
        // IV = sal XOR (SSRC nos bytes 4 a 7) XOR (ROC e sequência nos bytes 8 a 13).
        for (let i = 0; i < 4; i++) iv[4 + i] = iv[4 + i]! ^ packet[8 + i]!
        const index = Buffer.alloc(6)
        index.writeUInt32BE(roc >>> 0, 0)
        index.writeUInt16BE(packet.readUInt16BE(2), 4)
        for (let i = 0; i < 6; i++) iv[8 + i] = iv[8 + i]! ^ index[i]!
        const stream = keystream(this.encKey, iv, packet.length - header)
        const out = Buffer.from(packet)
        for (let i = header; i < packet.length; i++) out[i] = out[i]! ^ stream[i - header]!
        return out
    }

    private tag(packet: Buffer, roc: number): Buffer {
        const rocBytes = Buffer.alloc(4)
        rocBytes.writeUInt32BE(roc >>> 0)
        return createHmac('sha1', this.authKey).update(packet).update(rocBytes).digest().subarray(0, TAG_BYTES)
    }

    /** Pacote RTP pronto → pacote SRTP (carga cifrada e assinatura no fim). */
    protect(packet: Buffer): Buffer {
        const seq = packet.readUInt16BE(2)
        if (this.lastSeq !== undefined && seq < this.lastSeq && this.lastSeq - seq > 0x8000) this.roc++
        this.lastSeq = seq
        const encrypted = this.crypt(packet, this.roc)
        return Buffer.concat([encrypted, this.tag(encrypted, this.roc)])
    }

    /** Pacote SRTP → pacote RTP, ou null se a assinatura não confere. */
    unprotect(packet: Buffer): Buffer | null {
        if (packet.length < 12 + TAG_BYTES) return null
        const body = packet.subarray(0, packet.length - TAG_BYTES)
        const received = packet.subarray(packet.length - TAG_BYTES)
        const seq = body.readUInt16BE(2)
        // Estima em que volta o pacote está (RFC 3711, 3.3.1): perto da virada pode ser a anterior ou a próxima.
        let roc = this.roc
        if (this.lastSeq !== undefined) {
            if (this.lastSeq < 0x8000) {
                if (seq - this.lastSeq > 0x8000) roc = Math.max(0, this.roc - 1)
            } else if (this.lastSeq - 0x8000 > seq) roc = this.roc + 1
        }
        if (!timingSafeEqual(this.tag(body, roc), received)) return null
        if (roc > this.roc || (roc === this.roc && (this.lastSeq === undefined || seq > this.lastSeq))) {
            this.roc = roc
            this.lastSeq = seq
        }
        return this.crypt(body, roc)
    }
}
