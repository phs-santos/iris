// Dispositivos de áudio (RF-19), saída das chamadas e toque central de chamada recebida.

import { DEFAULT_RINGTONE, DEFAULT_RING_VOLUME, RINGTONES, ringGain, type RingtoneId } from '@shared/ringtones'

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }

class AudioOutput {
    private deviceId = ''
    private elements = new Set<SinkElement>()

    apply(el: HTMLAudioElement): void {
        const sink = el as SinkElement
        this.elements.add(sink)
        el.addEventListener('emptied', () => {
            if (!el.isConnected) this.elements.delete(sink)
        })
        if (this.deviceId) sink.setSinkId?.(this.deviceId).catch(() => undefined)
    }

    async setDevice(deviceId: string): Promise<void> {
        this.deviceId = deviceId
        for (const el of this.elements) {
            if (!el.isConnected) {
                this.elements.delete(el)
                continue
            }
            await el.setSinkId?.(deviceId).catch(() => undefined)
        }
    }
}

export const audioOutput = new AudioOutput()

/**
 * Microfone escolhido. Os motores pedem o microfone com `getUserMedia({ audio: true })`, então
 * a escolha entra trocando esse pedido pelo dispositivo selecionado. Se ele sumiu (desconectado),
 * cai no padrão do sistema em vez de deixar a chamada sem áudio.
 */
class AudioInput {
    deviceId = ''
    private installed = false

    install(): void {
        const media = navigator.mediaDevices
        if (this.installed || !media?.getUserMedia) return
        this.installed = true
        const original = media.getUserMedia.bind(media)
        media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
            if (!this.deviceId || constraints?.audio !== true) return original(constraints)
            try {
                return await original({ ...constraints, audio: { deviceId: { exact: this.deviceId } } })
            } catch (error) {
                const name = (error as Error).name
                if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw error
                return original(constraints)
            }
        }
    }
}

export const audioInput = new AudioInput()

/** Toque de chamada sintetizado (RF-55), um só tocando por vez; cada conta escolhe o seu. */
class Ringer {
    private ctx?: AudioContext
    private timer?: ReturnType<typeof setInterval>
    private deviceId = ''
    /** Toque em andamento, para os testes e para não recomeçar o mesmo. */
    current: RingtoneId | null = null
    volume = DEFAULT_RING_VOLUME

    get ringing(): boolean {
        return this.timer !== undefined
    }

    setDevice(deviceId: string): void {
        this.deviceId = deviceId
        void this.applySink()
    }

    private async applySink(): Promise<void> {
        const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined
        await ctx?.setSinkId?.(this.deviceId).catch(() => undefined)
    }

    /** Toca um ciclo do toque. */
    private cycle(id: RingtoneId): void {
        if (!this.ctx) {
            this.ctx = new AudioContext()
            void this.applySink()
        }
        const ctx = this.ctx
        if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
        const level = ringGain(this.volume)
        for (const note of RINGTONES[id].notes) {
            const start = ctx.currentTime + note.atMs / 1000
            const end = start + note.ms / 1000
            const gain = ctx.createGain()
            // A onda quadrada soa bem mais alta que a senoide na mesma amplitude.
            const peak = note.wave === 'square' ? level * 0.4 : level
            gain.gain.setValueAtTime(peak, start)
            if (note.fade) gain.gain.exponentialRampToValueAtTime(Math.max(peak / 100, 0.0001), end)
            gain.connect(ctx.destination)
            for (const freq of note.freqs) {
                const osc = ctx.createOscillator()
                osc.type = note.wave
                osc.frequency.value = freq
                osc.connect(gain)
                osc.start(start)
                osc.stop(end)
            }
        }
    }

    start(id: RingtoneId = DEFAULT_RINGTONE): void {
        if (this.timer && this.current === id) return
        this.stop()
        this.current = id
        this.cycle(id)
        this.timer = setInterval(() => this.cycle(id), RINGTONES[id].periodMs)
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
        this.current = null
    }

    /** Um ciclo só, para ouvir o toque na tela de escolha. */
    preview(id: RingtoneId): void {
        if (!this.timer) this.cycle(id)
    }
}

export const ringer = new Ringer()
