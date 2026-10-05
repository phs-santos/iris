<script setup lang="ts">
import { t } from '@renderer/i18n'
import { onMounted, onUnmounted, ref } from 'vue'
import { useDevicesStore } from '@renderer/stores/devices'
import { ringer } from '@renderer/sip/audio'
import { DEFAULT_RINGTONE } from '@shared/ringtones'

const devices = useDevicesStore()

const level = ref(0)
const micError = ref('')
const testing = ref(false)
let meter: { stream: MediaStream; ctx: AudioContext; frame: number } | undefined

/** Medidor do microfone escolhido, para conferir que é o certo antes de ligar. */
async function startMeter(): Promise<void> {
    stopMeter()
    micError.value = ''
    try {
        // Passa pelo mesmo caminho das chamadas: { audio: true } vira o microfone escolhido.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        const tick = (): void => {
            analyser.getByteTimeDomainData(data)
            let peak = 0
            for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
            level.value = Math.min(1, peak / 64)
            if (meter) meter.frame = requestAnimationFrame(tick)
        }
        meter = { stream, ctx, frame: requestAnimationFrame(tick) }
    } catch (error) {
        level.value = 0
        micError.value = t('audioSection.microfone_indisponivel', { p: (error as Error).message })
    }
}

function stopMeter(): void {
    if (!meter) return
    cancelAnimationFrame(meter.frame)
    meter.stream.getTracks().forEach((t) => t.stop())
    void meter.ctx.close()
    meter = undefined
}

async function chooseInput(id: string): Promise<void> {
    await devices.setInput(id)
    await startMeter()
}

const folderError = ref('')
async function openRecordings(): Promise<void> {
    folderError.value = ''
    await window.iris.audio.openRecordings().catch((cause: Error) => {
        folderError.value = t('audioSection.gravacoes_erro', { p: cause.message })
    })
}

/** Toca um bipe curto na saída escolhida. */
async function testOutput(): Promise<void> {
    testing.value = true
    const ctx = new AudioContext() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    await ctx.setSinkId?.(devices.outputId).catch(() => undefined)
    const gain = ctx.createGain()
    gain.gain.value = 0.15
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.frequency.value = 660
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
    osc.onended = () => {
        void ctx.close()
        testing.value = false
    }
}

onMounted(async () => {
    await devices.unlockLabels()
    await startMeter()
})
onUnmounted(stopMeter)
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('audioSection.audio') }}</h3>
            <p>{{ $t('audioSection.vale_para_as_chamadas_e') }}</p>
        </div>
        <label class="field">
            <span class="label">{{ $t('audioSection.microfone') }}</span>
            <select
                class="input"
                :value="devices.inputId"
                @change="chooseInput(($event.target as HTMLSelectElement).value)"
            >
                <option value="">{{ $t('audioSection.padrao_do_sistema') }}</option>
                <option v-for="d in devices.inputs" :key="d.id" :value="d.id">{{ d.label }}</option>
            </select>
        </label>
        <div
            class="meter"
            role="meter"
            :aria-label="$t('audioSection.nivel_do_microfone')"
            :aria-valuenow="Math.round(level * 100)"
        >
            <div class="bar" :style="{ width: `${Math.round(level * 100)}%` }"></div>
        </div>
        <p v-if="micError" class="error">{{ micError }}</p>
        <p v-else class="set-hint">{{ $t('audioSection.fale_alguma_coisa_a_barra') }}</p>

        <label class="field">
            <span class="label">{{ $t('audioSection.alto_falante') }}</span>
            <select
                class="input"
                :value="devices.outputId"
                @change="devices.setOutput(($event.target as HTMLSelectElement).value)"
            >
                <option value="">{{ $t('audioSection.padrao_do_sistema') }}</option>
                <option v-for="d in devices.outputs" :key="d.id" :value="d.id">{{ d.label }}</option>
            </select>
        </label>
        <div>
            <button class="btn" :disabled="testing" @click="testOutput">
                {{ $t('audioSection.tocar_som_de_teste') }}
            </button>
        </div>

        <label class="field">
            <span class="label">{{ $t('audioSection.camera') }}</span>
            <select
                class="input"
                :value="devices.cameraId"
                @change="devices.setCamera(($event.target as HTMLSelectElement).value)"
            >
                <option value="">{{ $t('audioSection.padrao_do_sistema') }}</option>
                <option v-for="d in devices.cameras" :key="d.id" :value="d.id">{{ d.label }}</option>
            </select>
        </label>
        <p class="set-hint">{{ $t('audioSection.camera_dica') }}</p>

        <label class="field">
            <span class="label">{{ $t('audioSection.volume_do_toque', { n: devices.ringVolume }) }}</span>
            <span class="ring">
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    :value="devices.ringVolume"
                    :aria-label="$t('audioSection.volume_do_toque_rotulo')"
                    @change="devices.setRingVolume(Number(($event.target as HTMLInputElement).value))"
                />
                <button type="button" class="btn small" @click="ringer.preview(DEFAULT_RINGTONE)">
                    {{ $t('audioSection.ouvir_toque') }}
                </button>
            </span>
        </label>
        <p class="set-hint">{{ $t('audioSection.toque_por_conta') }}</p>

        <div class="set-head">
            <h3>{{ $t('audioSection.gravacoes') }}</h3>
            <p>{{ $t('audioSection.gravacoes_dica') }}</p>
        </div>
        <div>
            <button class="btn" @click="openRecordings">{{ $t('audioSection.abrir_gravacoes') }}</button>
        </div>
        <p v-if="folderError" class="error" role="alert">{{ folderError }}</p>
    </section>
</template>

<style scoped>
.meter {
    height: 8px;
    border-radius: 4px;
    background: var(--raise);
    overflow: hidden;
}
.bar {
    height: 100%;
    background: var(--ok);
    transition: width 60ms linear;
}
.ring {
    display: flex;
    align-items: center;
    gap: 10px;
}
.ring input {
    flex: 1;
    accent-color: var(--accent);
}
.error {
    color: var(--bad);
    font-size: 12px;
    margin: 0;
}
</style>
