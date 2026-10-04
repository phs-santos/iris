// Áudio de uma chamada do motor próprio (RF-39). O RTP fica no processo principal; aqui o microfone
// vira blocos de 20 ms de PCM e o que chega da rede vai para um elemento <audio>, como nas chamadas
// WebRTC, para a escolha de saída de áudio (RF-19) valer igual.

import workletUrl from './pcm-worklet.js?url&no-inline'
import { audioOutput } from './audio'

const RATE = 8000

export class NativeAudio {
    private ctx?: AudioContext
    private playback?: AudioWorkletNode
    private capture?: AudioWorkletNode
    private mic?: MediaStream
    private micSource?: MediaStreamAudioSourceNode
    private element = document.createElement('audio')
    private closed = false

    /** `onFrame` recebe 160 amostras de 16 bits a cada 20 ms. */
    constructor(private onFrame: (pcm: Int16Array) => void) {
        this.element.autoplay = true
        this.element.hidden = true
    }

    async start(deviceId?: string): Promise<void> {
        if (this.ctx || this.closed) return
        const ctx = new AudioContext({ sampleRate: RATE })
        this.ctx = ctx
        try {
            await ctx.audioWorklet.addModule(workletUrl)
        } catch (error) {
            // Chamada que terminou antes de o áudio abrir (ocupado, cancelada): o contexto já fechou.
            if (this.closed) return
            throw error
        }
        if (this.closed) return
        this.playback = new AudioWorkletNode(ctx, 'iris-playback', { numberOfInputs: 0, outputChannelCount: [1] })
        const out = ctx.createMediaStreamDestination()
        this.playback.connect(out)
        document.body.appendChild(this.element)
        this.element.srcObject = out.stream
        audioOutput.apply(this.element)

        this.capture = new AudioWorkletNode(ctx, 'iris-capture', { numberOfOutputs: 0 })
        this.capture.port.onmessage = (event: MessageEvent<Int16Array>) => this.onFrame(event.data)
        await this.openMic(deviceId)
    }

    /** Sem microfone (negado ou ausente), a chamada segue só ouvindo. */
    private async openMic(deviceId?: string): Promise<void> {
        const ctx = this.ctx
        if (!ctx || !this.capture) return
        const audio = deviceId ? { deviceId: { exact: deviceId } } : true
        const stream = await navigator.mediaDevices.getUserMedia({ audio }).catch(() => null)
        if (this.closed) return stream?.getTracks().forEach((track) => track.stop())
        this.micSource?.disconnect()
        this.mic?.getTracks().forEach((track) => track.stop())
        this.mic = stream ?? undefined
        if (!stream) return
        this.micSource = ctx.createMediaStreamSource(stream)
        this.micSource.connect(this.capture)
    }

    setInputDevice(deviceId: string): Promise<void> {
        return this.openMic(deviceId || undefined)
    }

    /** 20 ms recebidos da rede. */
    play(pcm: Int16Array): void {
        this.playback?.port.postMessage(pcm)
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        this.mic?.getTracks().forEach((track) => track.stop())
        this.element.srcObject = null
        this.element.remove()
        void this.ctx?.close().catch(() => undefined)
    }
}
