// Codecs de áudio do motor próprio (RF-47): G.711 e Opus. Por dentro o áudio é sempre PCM de 16 bits
// a 8000 Hz, em blocos de 20 ms; o Opus aceita essa taxa e manda em banda estreita, o que basta para
// falar com um PBX que só oferece Opus. O relógio do RTP é o do codec: 8000 no G.711, 48000 no Opus.

import OpusScript from 'opusscript'
import { decodeG711, encodeG711, type G711 } from './g711'

export type AudioCodec = G711 | 'opus'

export interface CodecInstance {
    readonly name: AudioCodec
    /** Quanto o relógio do RTP anda por amostra de 8000 Hz: 1 no G.711, 6 no Opus. */
    readonly clockScale: number
    encode(pcm: Int16Array): Buffer
    decode(data: Uint8Array): Int16Array
    close(): void
}

const RATE = 8000

class OpusCodec implements CodecInstance {
    readonly name = 'opus' as const
    readonly clockScale = 6
    // Um codificador e um decodificador por chamada: os dois guardam o estado do áudio anterior.
    private encoder = new OpusScript(RATE, 1, OpusScript.Application.VOIP)
    private decoder = new OpusScript(RATE, 1, OpusScript.Application.VOIP)

    encode(pcm: Int16Array): Buffer {
        const bytes = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
        return Buffer.from(this.encoder.encode(bytes, pcm.length))
    }

    decode(data: Uint8Array): Int16Array {
        const out = this.decoder.decode(Buffer.from(data))
        return new Int16Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 2)).slice()
    }

    close(): void {
        this.encoder.delete()
        this.decoder.delete()
    }
}

export function createCodec(name: AudioCodec): CodecInstance {
    if (name === 'opus') return new OpusCodec()
    return {
        name,
        clockScale: 1,
        encode: (pcm) => encodeG711(name, pcm),
        decode: (data) => decodeG711(name, data),
        close: () => undefined
    }
}
