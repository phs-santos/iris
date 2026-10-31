// Áudio em PCM de 16 bits a 8000 Hz, a forma em que ele passa pelo motor próprio: medir o volume
// e escrever o cabeçalho da gravação em WAV (RF-36, RF-41).

export const SAMPLE_RATE = 8000
/** Volume de quem não está recebendo nada. */
export const SILENCE_DB = -96

/** Volume médio (RMS) em dBFS: 0 é o máximo, SILENCE_DB é nada. */
export function levelDb(pcm: Int16Array): number {
    if (pcm.length === 0) return SILENCE_DB
    let sum = 0
    for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!
    const rms = Math.sqrt(sum / pcm.length) / 0x8000
    // `|| 0` troca o -0 do arredondamento por 0.
    return rms > 0 ? Math.max(SILENCE_DB, Math.round(20 * Math.log10(rms)) || 0) : SILENCE_DB
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
