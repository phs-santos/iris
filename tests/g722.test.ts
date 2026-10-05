import { describe, expect, it } from 'vitest'
import { G722Decoder, G722Encoder } from '../src/main/sip/g722'
import { Downsampler, Upsampler } from '../src/main/sip/resample'
import { createCodec } from '../src/main/sip/codec'

const tone = (hz: number, rate: number, samples: number, amplitude = 8000): Int16Array =>
    Int16Array.from({ length: samples }, (_, n) => Math.round(amplitude * Math.sin((2 * Math.PI * hz * n) / rate)))

/** Potência do sinal numa frequência (Goertzel), em amplitude: quanto daquele tom há ali. */
function amplitudeAt(pcm: Int16Array, hz: number, rate: number): number {
    const w = (2 * Math.PI * hz) / rate
    let re = 0
    let im = 0
    for (let n = 0; n < pcm.length; n++) {
        re += pcm[n]! * Math.cos(w * n)
        im += pcm[n]! * Math.sin(w * n)
    }
    return (2 * Math.hypot(re, im)) / pcm.length
}
const db = (ratio: number): number => 20 * Math.log10(ratio)

/** Passa o sinal em blocos de 20 ms, como numa chamada, e devolve tudo emendado, sem o começo (o filtro enchendo). */
function inFrames(pcm: Int16Array, frame: number, each: (block: Int16Array) => Int16Array, skip: number): Int16Array {
    const parts: number[] = []
    for (let i = 0; i + frame <= pcm.length; i += frame) parts.push(...each(pcm.subarray(i, i + frame)))
    return Int16Array.from(parts.slice(skip))
}

describe('G.722', () => {
    it('20 ms de áudio a 16 kHz viram 160 bytes, e voltam 320 amostras', () => {
        const encoded = new G722Encoder().encode(tone(1000, 16000, 320))
        expect(encoded.length).toBe(160)
        expect(new G722Decoder().decode(encoded).length).toBe(320)
    })

    it('um tom de 1 kHz volta com o mesmo volume e sem outros tons junto', () => {
        const encoder = new G722Encoder()
        const decoder = new G722Decoder()
        const out = inFrames(tone(1000, 16000, 16000), 320, (b) => decoder.decode(encoder.encode(b)), 1600)
        expect(Math.abs(db(amplitudeAt(out, 1000, 16000) / 8000))).toBeLessThan(1)
        // O resto do espectro fica bem abaixo: o ruído do codec, não outro tom.
        for (const hz of [500, 2000, 3000, 5000, 7000])
            expect(db(amplitudeAt(out, hz, 16000) / 8000), `${hz} Hz`).toBeLessThan(-30)
    })

    it('é banda larga de verdade: um tom de 6 kHz, que o G.711 não leva, passa', () => {
        const encoder = new G722Encoder()
        const decoder = new G722Decoder()
        const out = inFrames(tone(6000, 16000, 16000), 320, (b) => decoder.decode(encoder.encode(b)), 1600)
        expect(Math.abs(db(amplitudeAt(out, 6000, 16000) / 8000))).toBeLessThan(3)
    })

    it('silêncio vira silêncio, e o estado segue de um bloco para o outro', () => {
        const decoder = new G722Decoder()
        const encoder = new G722Encoder()
        const quiet = decoder.decode(encoder.encode(new Int16Array(320)))
        expect(Math.max(...quiet.map(Math.abs))).toBeLessThan(40)
        // Um codificador novo no meio do som não dá o mesmo resultado: prova que há estado.
        const first = tone(700, 16000, 640)
        const continued = encoder.encode(first.subarray(320))
        const fresh = new G722Encoder().encode(first.subarray(320))
        expect(continued.equals(fresh)).toBe(false)
    })
})

describe('troca de taxa entre 16 kHz e 8 kHz', () => {
    it('16 para 8 kHz: mantém a voz e corta o que passaria de 4 kHz', () => {
        const down = new Downsampler()
        const voice = inFrames(tone(1000, 16000, 16000), 320, (b) => down.process(b), 400)
        expect(Math.abs(db(amplitudeAt(voice, 1000, 8000) / 8000))).toBeLessThan(0.5)
        // 6 kHz a 16 kHz apareceria como 2 kHz a 8 kHz se não fosse filtrado antes.
        const down2 = new Downsampler()
        const high = inFrames(tone(6000, 16000, 16000), 320, (b) => down2.process(b), 400)
        expect(db(amplitudeAt(high, 2000, 8000) / 8000)).toBeLessThan(-35)
    })

    it('8 para 16 kHz: mantém o tom e não cria a imagem dele nos agudos', () => {
        const up = new Upsampler()
        const out = inFrames(tone(1000, 8000, 8000), 160, (b) => up.process(b), 800)
        expect(out.length).toBe(16000 - 800)
        expect(Math.abs(db(amplitudeAt(out, 1000, 16000) / 8000))).toBeLessThan(0.5)
        expect(db(amplitudeAt(out, 7000, 16000) / 8000)).toBeLessThan(-35)
    })

    it('a emenda entre blocos não estala: o resultado em blocos é igual ao de uma vez só', () => {
        const signal = tone(440, 16000, 3200)
        const whole = new Downsampler().process(signal)
        const down = new Downsampler()
        const pieces = inFrames(signal, 320, (b) => down.process(b), 0)
        expect([...pieces]).toEqual([...whole])
    })
})

describe('G.722 como codec de uma chamada', () => {
    it('aceita áudio a 8 kHz (tom de cenário) e a 16 kHz (microfone), com o relógio do RTP a 8000', () => {
        const codec = createCodec('G722')
        expect(codec.clockScale).toBe(1)
        expect(codec.encode(tone(1000, 8000, 160)).length).toBe(160)
        expect(codec.encodeWide!(tone(1000, 16000, 320)).length).toBe(160)
        const other = createCodec('G722')
        const packet = other.encodeWide!(tone(1000, 16000, 320))
        expect(codec.decodeWide!(packet).length).toBe(320)
        expect(codec.decode(packet).length).toBe(160)
        codec.close()
        other.close()
    })
})
