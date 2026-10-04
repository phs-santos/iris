// Áudio em PCM de 16 bits a 8000 Hz, a forma em que ele passa pelo motor próprio: gerar um tom,
// ler um arquivo WAV e medir o volume (RF-36, RF-41).

export const SAMPLE_RATE = 8000
/** Volume de quem não está recebendo nada. */
export const SILENCE_DB = -96
/** Acima disto há áudio; abaixo, silêncio. Um tom ou voz normal fica entre -30 e -10 dBFS. */
export const AUDIO_THRESHOLD_DB = -50

/** Tom puro, com entrada e saída suaves para não estalar. */
export function toneSamples(hz: number, ms: number, amplitude = 0.5): Int16Array {
    const length = Math.round((SAMPLE_RATE * ms) / 1000)
    const out = new Int16Array(length)
    const fade = Math.min(80, Math.floor(length / 2))
    for (let i = 0; i < length; i++) {
        const edge = Math.min(1, i / fade, (length - 1 - i) / fade)
        out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE) * amplitude * edge * 0x7fff)
    }
    return out
}

/** Volume médio (RMS) em dBFS: 0 é o máximo, SILENCE_DB é nada. */
export function levelDb(pcm: Int16Array): number {
    if (pcm.length === 0) return SILENCE_DB
    let sum = 0
    for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!
    const rms = Math.sqrt(sum / pcm.length) / 0x8000
    // `|| 0` troca o -0 do arredondamento por 0.
    return rms > 0 ? Math.max(SILENCE_DB, Math.round(20 * Math.log10(rms)) || 0) : SILENCE_DB
}

export class WavError extends Error {}

/**
 * Lê um WAV de PCM de 16 bits (mono ou estéreo, qualquer taxa) e devolve mono a 8000 Hz. Estéreo vira
 * a média dos canais; outra taxa é convertida por interpolação, que basta para tons e voz de teste.
 */
export function parseWav(data: Uint8Array): Int16Array {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const tag = (offset: number): string => String.fromCharCode(...data.subarray(offset, offset + 4))
    if (data.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new WavError('O arquivo não é um WAV')
    let channels = 0
    let rate = 0
    let samples: Int16Array | undefined
    for (let offset = 12; offset + 8 <= data.length;) {
        const size = view.getUint32(offset + 4, true)
        const body = offset + 8
        if (tag(offset) === 'fmt ') {
            const format = view.getUint16(body, true)
            channels = view.getUint16(body + 2, true)
            rate = view.getUint32(body + 4, true)
            const bits = view.getUint16(body + 14, true)
            if (format !== 1 || bits !== 16) throw new WavError('Só WAV em PCM de 16 bits é aceito')
        } else if (tag(offset) === 'data') {
            const count = Math.floor(Math.min(size, data.length - body) / 2)
            samples = new Int16Array(count)
            for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true)
        }
        offset = body + size + (size % 2)
    }
    if (!samples?.length || !channels || !rate) throw new WavError('WAV sem formato ou sem áudio')
    const frames = Math.floor(samples.length / channels)
    const mono = new Float32Array(frames)
    for (let i = 0; i < frames; i++) {
        let sum = 0
        for (let c = 0; c < channels; c++) sum += samples[i * channels + c]!
        mono[i] = sum / channels
    }
    if (rate === SAMPLE_RATE) return Int16Array.from(mono)
    const length = Math.floor((frames * SAMPLE_RATE) / rate)
    const out = new Int16Array(length)
    for (let i = 0; i < length; i++) {
        const position = (i * rate) / SAMPLE_RATE
        const left = Math.floor(position)
        const right = Math.min(frames - 1, left + 1)
        out[i] = Math.round(mono[left]! + (mono[right]! - mono[left]!) * (position - left))
    }
    return out
}

/** Cabeçalho de um WAV de PCM de 16 bits. */
export function wavHeader(dataBytes: number, channels: number, rate = SAMPLE_RATE): Uint8Array {
    const header = new Uint8Array(44)
    const view = new DataView(header.buffer)
    const text = (offset: number, value: string): void =>
        [...value].forEach((c, i) => (header[offset + i] = c.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, 36 + dataBytes, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * channels * 2, true)
    view.setUint16(32, channels * 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, dataBytes, true)
    return header
}
