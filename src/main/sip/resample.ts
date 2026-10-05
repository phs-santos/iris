// Troca de taxa entre 8000 e 16000 Hz, para o áudio do motor próprio: o microfone e o alto-falante
// trabalham a 16 kHz (o que o G.722 pede) e o G.711 e o Opus em banda estreita, a 8 kHz. Um filtro de
// meia banda corta o que passa de 4 kHz antes de jogar fora uma amostra em cada duas (senão os agudos
// "dobram" e viram ruído) e preenche a amostra que falta ao dobrar a taxa. Cada objeto guarda as
// últimas amostras, para não estalar na emenda entre um bloco de 20 ms e o seguinte.

/**
 * Filtro de meia banda com 31 coeficientes (janela de Hamming). Num filtro assim, os coeficientes de
 * posição par são zero, fora o do meio: só os ímpares entram na conta.
 */
const TAPS = 31
const CENTER = (TAPS - 1) / 2
const COEFFS = Array.from({ length: TAPS }, (_, n) => {
    const k = n - CENTER
    const ideal = k === 0 ? 0.5 : Math.sin((Math.PI * k) / 2) / (Math.PI * k)
    return ideal * (0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (TAPS - 1)))
})
const clamp = (value: number): number => Math.max(-32768, Math.min(32767, Math.round(value)))

/** 16000 Hz para 8000 Hz: filtra e fica com uma amostra em cada duas. */
export class Downsampler {
    private history = new Float64Array(TAPS - 1)

    process(pcm: Int16Array): Int16Array {
        const input = new Float64Array(this.history.length + pcm.length)
        input.set(this.history)
        input.set(pcm, this.history.length)
        const out = new Int16Array(pcm.length >> 1)
        for (let n = 0; n < out.length; n++) {
            let sum = 0
            const base = 2 * n
            for (let k = 0; k < TAPS; k++) sum += COEFFS[k]! * input[base + k]!
            out[n] = clamp(sum)
        }
        this.history.set(input.subarray(input.length - this.history.length))
        return out
    }
}

/** 8000 Hz para 16000 Hz: põe um zero entre as amostras e filtra, o que desenha a amostra que faltava. */
export class Upsampler {
    private history = new Float64Array(TAPS - 1)

    process(pcm: Int16Array): Int16Array {
        const input = new Float64Array(this.history.length + pcm.length * 2)
        input.set(this.history)
        for (let i = 0; i < pcm.length; i++) input[this.history.length + 2 * i] = pcm[i]!
        const out = new Int16Array(pcm.length * 2)
        for (let n = 0; n < out.length; n++) {
            let sum = 0
            for (let k = 0; k < TAPS; k++) sum += COEFFS[k]! * input[n + k]!
            // Metade das amostras era zero: o dobro devolve o volume original.
            out[n] = clamp(2 * sum)
        }
        this.history.set(input.subarray(input.length - this.history.length))
        return out
    }
}
