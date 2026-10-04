// G.711 (RFC 3551): o codec de áudio que todo PBX fala. Cada amostra de 16 bits vira 1 byte,
// em lei µ (PCMU, payload 0) ou lei A (PCMA, payload 8), a 8000 amostras por segundo.

const BIAS = 0x84
const CLIP = 32635

function linearToUlaw(sample: number): number {
    const sign = sample < 0 ? 0x80 : 0
    let value = Math.min(CLIP, Math.abs(sample)) + BIAS
    let exponent = 7
    for (let mask = 0x4000; (value & mask) === 0 && exponent > 0; mask >>= 1) exponent--
    const mantissa = (value >> (exponent + 3)) & 0x0f
    value = ~(sign | (exponent << 4) | mantissa)
    return value & 0xff
}

function ulawToLinear(byte: number): number {
    const value = ~byte & 0xff
    const exponent = (value >> 4) & 0x07
    const sample = (((value & 0x0f) << 3) + BIAS) << exponent
    return value & 0x80 ? BIAS - sample : sample - BIAS
}

function linearToAlaw(sample: number): number {
    const sign = sample >= 0 ? 0x80 : 0
    const value = Math.min(CLIP, Math.abs(sample))
    let exponent = 7
    for (let mask = 0x4000; (value & mask) === 0 && exponent > 0; mask >>= 1) exponent--
    const mantissa = exponent === 0 ? (value >> 4) & 0x0f : (value >> (exponent + 3)) & 0x0f
    return (sign | (exponent << 4) | mantissa) ^ 0x55
}

function alawToLinear(byte: number): number {
    const value = byte ^ 0x55
    const exponent = (value >> 4) & 0x07
    const mantissa = value & 0x0f
    const sample = exponent === 0 ? (mantissa << 4) + 8 : ((mantissa << 4) + 0x108) << (exponent - 1)
    return value & 0x80 ? sample : -sample
}

// Tabelas prontas: a conversão roda 8000 vezes por segundo em cada sentido.
const ULAW_DECODE = Int16Array.from({ length: 256 }, (_, i) => ulawToLinear(i))
const ALAW_DECODE = Int16Array.from({ length: 256 }, (_, i) => alawToLinear(i))

export type G711 = 'PCMU' | 'PCMA'

export function encodeG711(codec: G711, pcm: Int16Array): Buffer {
    const out = Buffer.allocUnsafe(pcm.length)
    const encode = codec === 'PCMU' ? linearToUlaw : linearToAlaw
    for (let i = 0; i < pcm.length; i++) out[i] = encode(pcm[i]!)
    return out
}

export function decodeG711(codec: G711, data: Uint8Array): Int16Array {
    const table = codec === 'PCMU' ? ULAW_DECODE : ALAW_DECODE
    const out = new Int16Array(data.length)
    for (let i = 0; i < data.length; i++) out[i] = table[data[i]!]!
    return out
}
