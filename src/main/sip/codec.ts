// Codecs de áudio do motor próprio (RF-47): G.711, G.722 e Opus. O áudio dos cenários, da gravação e
// do medidor é sempre PCM de 16 bits a 8000 Hz, em blocos de 20 ms; o Opus aceita essa taxa e manda em
// banda estreita, o que basta para falar com um PBX que só oferece Opus. O G.722 é de banda larga:
// além dessa via de 8 kHz, tem a de 16 kHz, por onde passam o microfone e o alto-falante. O relógio do
// RTP é o do codec: 8000 no G.711 e no G.722, 48000 no Opus.

import OpusScript from 'opusscript'
import { decodeG711, encodeG711, type G711 } from './g711'
import { G722Decoder, G722Encoder } from './g722'
import { Downsampler, Upsampler } from './resample'

export type AudioCodec = G711 | 'G722' | 'opus'

export interface CodecInstance {
    readonly name: AudioCodec
    /** Quanto o relógio do RTP anda por amostra de 8000 Hz: 1 no G.711, 6 no Opus. */
    readonly clockScale: number
    encode(pcm: Int16Array): Buffer
    decode(data: Uint8Array): Int16Array
    /** Só nos codecs de banda larga: o mesmo, com PCM a 16000 Hz (320 amostras por bloco). */
    encodeWide?(pcm: Int16Array): Buffer
    decodeWide?(data: Uint8Array): Int16Array
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

class G722Codec implements CodecInstance {
    readonly name = 'G722' as const
    // O relógio do RTP do G.722 anda a 8000, mesmo com o áudio a 16000 (RFC 3551, seção 4.5.2).
    readonly clockScale = 1
    private encoder = new G722Encoder()
    private decoder = new G722Decoder()
    private up = new Upsampler()
    private down = new Downsampler()

    /** Áudio que já nasce a 8 kHz (tom e arquivo dos cenários): sobe para 16 kHz antes de codificar. */
    encode(pcm: Int16Array): Buffer {
        return this.encoder.encode(this.up.process(pcm))
    }

    decode(data: Uint8Array): Int16Array {
        return this.down.process(this.decoder.decode(data))
    }

    encodeWide(pcm: Int16Array): Buffer {
        return this.encoder.encode(pcm)
    }

    decodeWide(data: Uint8Array): Int16Array {
        return this.decoder.decode(data)
    }

    close(): void {}
}

export function createCodec(name: AudioCodec): CodecInstance {
    if (name === 'opus') return new OpusCodec()
    if (name === 'G722') return new G722Codec()
    return {
        name,
        clockScale: 1,
        encode: (pcm) => encodeG711(name, pcm),
        decode: (data) => decodeG711(name, data),
        close: () => undefined
    }
}
