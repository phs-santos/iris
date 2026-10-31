import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { levelDb, SILENCE_DB } from '../src/shared/audio'
import { WavRecorder } from '../src/main/sip/recorder'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const tempFile = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'iris-wav-'))
    dirs.push(dir)
    return join(dir, 'gravacao.wav')
}

/** Tom puro de teste, a 8000 Hz. */
function toneSamples(hz: number, ms: number, amplitude = 0.5): Int16Array {
    const out = new Int16Array(Math.round((8000 * ms) / 1000))
    for (let i = 0; i < out.length; i++)
        out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / 8000) * amplitude * 0x7fff)
    return out
}

describe('medida de volume (RF-41)', () => {
    it('mede silêncio, áudio fraco e áudio cheio', () => {
        expect(levelDb(new Int16Array(160))).toBe(SILENCE_DB)
        expect(levelDb(new Int16Array(0))).toBe(SILENCE_DB)
        expect(levelDb(new Int16Array(160).fill(32767))).toBe(0)
        expect(levelDb(new Int16Array(160).fill(328))).toBe(-40)
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
