// Saída de áudio das chamadas e toque central de chamada recebida.

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

/** Toque de chamada sintetizado (dois tons de 1 s a cada 3 s), um só para todas as contas. */
class Ringer {
  private ctx?: AudioContext
  private timer?: ReturnType<typeof setInterval>

  get ringing(): boolean {
    return this.timer !== undefined
  }

  start(): void {
    if (this.timer) return
    this.ctx ??= new AudioContext()
    const ring = (): void => {
      const ctx = this.ctx
      if (!ctx) return
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
      const gain = ctx.createGain()
      gain.gain.value = 0.08
      gain.connect(ctx.destination)
      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator()
        osc.frequency.value = freq
        osc.connect(gain)
        osc.start()
        osc.stop(ctx.currentTime + 1)
      }
    }
    ring()
    this.timer = setInterval(ring, 3000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
}

export const ringer = new Ringer()
