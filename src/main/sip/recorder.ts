// Gravação da chamada (RF-36) em WAV estéreo a 8000 Hz: o que esta conta mandou no canal esquerdo e o
// que recebeu no direito. Os dois lados chegam em ritmos próprios; a gravação emparelha os blocos e
// completa com silêncio quando um lado atrasa ou para.

import { closeSync, openSync, writeSync } from 'node:fs'
import { wavHeader } from '@shared/audio'

/** Quanto um lado pode esperar o outro antes de ser gravado com silêncio no lugar dele: 200 ms. */
const MAX_LAG = 1600

export class WavRecorder {
    private fd: number
    private left: number[] = []
    private right: number[] = []
    private bytes = 0
    private closed = false

    constructor(readonly path: string) {
        this.fd = openSync(path, 'w')
        writeSync(this.fd, wavHeader(0, 2))
    }

    push(side: 'sent' | 'received', pcm: Int16Array): void {
        if (this.closed) return
        const queue = side === 'sent' ? this.left : this.right
        for (let i = 0; i < pcm.length; i++) queue.push(pcm[i]!)
        const lag = Math.abs(this.left.length - this.right.length)
        this.write(Math.min(this.left.length, this.right.length) + Math.max(0, lag - MAX_LAG))
    }

    private write(frames: number): void {
        if (frames <= 0) return
        const out = Buffer.alloc(frames * 4)
        for (let i = 0; i < frames; i++) {
            out.writeInt16LE(this.left[i] ?? 0, i * 4)
            out.writeInt16LE(this.right[i] ?? 0, i * 4 + 2)
        }
        this.left.splice(0, frames)
        this.right.splice(0, frames)
        writeSync(this.fd, out)
        this.bytes += out.length
    }

    /** Grava o que sobrou e acerta o tamanho no cabeçalho. Devolve a duração em milissegundos. */
    finish(): number {
        if (this.closed) return 0
        this.write(Math.max(this.left.length, this.right.length))
        this.closed = true
        writeSync(this.fd, wavHeader(this.bytes, 2), 0, 44, 0)
        closeSync(this.fd)
        return Math.round(this.bytes / 4 / 8)
    }
}
