// Ponte de áudio do motor próprio (RF-39), dentro do AudioWorklet: o contexto roda a 8000 Hz, a
// taxa do G.711. A captura junta o microfone em blocos de 160 amostras (20 ms) de 16 bits; a
// reprodução guarda o que chega da rede numa fila curta, que absorve a variação do atraso.
/* global AudioWorkletProcessor, registerProcessor */

const FRAME = 160
/** Fila de reprodução: começa a tocar com 60 ms e descarta o que passar de 240 ms. */
const START = 480
const LIMIT = 1920

class CaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.frame = new Int16Array(FRAME)
        this.filled = 0
    }

    process(inputs) {
        const input = inputs[0]?.[0]
        if (!input) return true
        for (let i = 0; i < input.length; i++) {
            const sample = Math.max(-1, Math.min(1, input[i]))
            this.frame[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
            if (this.filled === FRAME) {
                this.port.postMessage(this.frame.slice())
                this.filled = 0
            }
        }
        return true
    }
}

class PlaybackProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.queue = new Float32Array(LIMIT * 2)
        this.read = 0
        this.size = 0
        this.playing = false
        this.port.onmessage = (event) => this.push(event.data)
    }

    push(pcm) {
        // Fila cheia (a rede entregou de uma vez): joga fora o mais antigo para não acumular atraso.
        if (this.size + pcm.length > LIMIT) {
            const drop = this.size + pcm.length - LIMIT
            this.read = (this.read + drop) % this.queue.length
            this.size -= drop
        }
        let write = (this.read + this.size) % this.queue.length
        for (let i = 0; i < pcm.length; i++) {
            this.queue[write] = pcm[i] / 0x8000
            write = (write + 1) % this.queue.length
        }
        this.size += pcm.length
    }

    process(_inputs, outputs) {
        const output = outputs[0]?.[0]
        if (!output) return true
        if (!this.playing && this.size >= START) this.playing = true
        for (let i = 0; i < output.length; i++) {
            if (this.playing && this.size > 0) {
                output[i] = this.queue[this.read]
                this.read = (this.read + 1) % this.queue.length
                this.size--
            } else {
                // Fila vazia: silêncio, e espera encher de novo antes de voltar a tocar.
                output[i] = 0
                this.playing = false
            }
        }
        return true
    }
}

registerProcessor('iris-capture', CaptureProcessor)
registerProcessor('iris-playback', PlaybackProcessor)
