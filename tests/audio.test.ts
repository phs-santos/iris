import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { levelDb, parseWav, SILENCE_DB, toneSamples, wavHeader, WavError } from '../src/shared/audio'
import { WavRecorder } from '../src/main/sip/recorder'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const tempFile = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'iris-wav-'))
    dirs.push(dir)
    return join(dir, 'gravacao.wav')
}

/** WAV de teste em qualquer taxa e número de canais. */
function wav(samples: Int16Array, channels = 1, rate = 8000): Uint8Array {
    const body = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
    const out = new Uint8Array(44 + body.length)
    out.set(wavHeader(body.length, channels, rate))
    out.set(body, 44)
    return out
}

describe('ferramentas de áudio (RF-36, RF-41)', () => {
    it('gera um tom com a duração pedida e volume audível', () => {
        const tone = toneSamples(440, 500)
        expect(tone).toHaveLength(4000)
        expect(levelDb(tone)).toBeGreaterThan(-12)
        expect(levelDb(tone)).toBeLessThan(-6)
        // Começa e termina em silêncio, para não estalar.
        expect(Math.abs(tone[0]!)).toBeLessThan(50)
        expect(Math.abs(tone.at(-1)!)).toBeLessThan(50)
    })

    it('mede silêncio, áudio fraco e áudio cheio', () => {
        expect(levelDb(new Int16Array(160))).toBe(SILENCE_DB)
        expect(levelDb(new Int16Array(0))).toBe(SILENCE_DB)
        expect(levelDb(new Int16Array(160).fill(32767))).toBe(0)
        expect(levelDb(new Int16Array(160).fill(328))).toBe(-40)
    })

    it('lê um WAV mono de 8000 Hz como está', () => {
        const tone = toneSamples(600, 100)
        expect(parseWav(wav(tone))).toEqual(tone)
    })

    it('junta os canais de um WAV estéreo e converte outra taxa', () => {
        const stereo = Int16Array.from([1000, 3000, -2000, -4000])
        expect([...parseWav(wav(stereo, 2))]).toEqual([2000, -3000])
        const fast = toneSamples(440, 100)
        // O mesmo som declarado a 16000 Hz tem metade da duração a 8000 Hz.
        const half = parseWav(wav(fast, 1, 16000))
        expect(half).toHaveLength(fast.length / 2)
        expect(levelDb(half)).toBeGreaterThan(-12)
    })

    it('recusa o que não é WAV de PCM de 16 bits', () => {
        expect(() => parseWav(new Uint8Array(100))).toThrow(WavError)
        const eightBit = wav(new Int16Array(10))
        eightBit[34] = 8
        expect(() => parseWav(eightBit)).toThrow(/16 bits/)
        expect(() => parseWav(wavHeader(0, 1))).toThrow(/sem formato ou sem áudio/)
    })
})

describe('gravação da chamada (RF-36)', () => {
    const channels = (path: string): { left: Int16Array; right: Int16Array } => {
        const data = readFileSync(path)
        expect(data.readUInt16LE(22)).toBe(2)
        expect(data.readUInt32LE(40)).toBe(data.length - 44)
        const frames = (data.length - 44) / 4
        const left = new Int16Array(frames)
        const right = new Int16Array(frames)
        for (let i = 0; i < frames; i++) {
            left[i] = data.readInt16LE(44 + i * 4)
            right[i] = data.readInt16LE(46 + i * 4)
        }
        return { left, right }
    }

    it('põe o que foi mandado no canal esquerdo e o que chegou no direito', () => {
        const path = tempFile()
        const recorder = new WavRecorder(path)
        const sent = toneSamples(440, 60)
        const received = toneSamples(880, 60, 0.25)
        for (let i = 0; i < 3; i++) {
            recorder.push('sent', sent.subarray(i * 160, (i + 1) * 160))
            recorder.push('received', received.subarray(i * 160, (i + 1) * 160))
        }
        expect(recorder.finish()).toBe(60)
        const { left, right } = channels(path)
        expect(left).toEqual(sent)
        expect(right).toEqual(received)
    })

    it('completa com silêncio o lado que parou de chegar', () => {
        const path = tempFile()
        const recorder = new WavRecorder(path)
        const block = new Int16Array(160).fill(1000)
        // Só o microfone, por 1 segundo: o outro lado fica mudo e a gravação não espera por ele.
        for (let i = 0; i < 50; i++) recorder.push('sent', block)
        expect(recorder.finish()).toBe(1000)
        const { left, right } = channels(path)
        expect(left).toHaveLength(8000)
        expect(levelDb(left)).toBeGreaterThan(-40)
        expect(levelDb(right)).toBe(SILENCE_DB)
        // Depois de fechada, não grava mais nada.
        recorder.push('sent', block)
        expect(recorder.finish()).toBe(0)
    })
})
