<script setup lang="ts">
import { t } from '@renderer/i18n'
import { onMounted, onUnmounted, ref } from 'vue'
import { useDevicesStore } from '@renderer/stores/devices'
import { ringer } from '@renderer/sip/audio'
import { DEFAULT_RINGTONE } from '@shared/ringtones'
import CodecsList from './CodecsList.vue'

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

        <h4 class="sub">{{ $t('audioSection.dispositivos') }}</h4>
        <div class="set-group">
            <div class="set-row">
                <label class="what" for="audio-in"
                    ><b>{{ $t('audioSection.microfone') }}</b></label
                >
                <select
                    id="audio-in"
                    class="input control"
                    :value="devices.inputId"
                    @change="chooseInput(($event.target as HTMLSelectElement).value)"
                >
                    <option value="">{{ $t('audioSection.padrao_do_sistema') }}</option>
                    <option v-for="d in devices.inputs" :key="d.id" :value="d.id">{{ d.label }}</option>
                </select>
            </div>
            <div class="set-row">
                <span class="what">
                    <b>{{ $t('audioSection.nivel') }}</b>
                    <small v-if="micError" class="error">{{ micError }}</small>
                    <small v-else>{{ $t('audioSection.fale_alguma_coisa_a_barra') }}</small>
                </span>
                <div
                    class="meter control"
                    role="meter"
                    :aria-label="$t('audioSection.nivel_do_microfone')"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-valuenow="Math.round(level * 100)"
                >
                    <div class="bar" :style="{ width: `${Math.round(level * 100)}%` }"></div>
                </div>
            </div>
            <div class="set-row">
                <label class="what" for="audio-out"
                    ><b>{{ $t('audioSection.alto_falante') }}</b></label
                >
                <span class="control pair">
                    <select
                        id="audio-out"
                        class="input"
                        :value="devices.outputId"
                        @change="devices.setOutput(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">{{ $t('audioSection.padrao_do_sistema') }}</option>
                        <option v-for="d in devices.outputs" :key="d.id" :value="d.id">{{ d.label }}</option>
                    </select>
                    <button class="btn small" :disabled="testing" @click="testOutput">
                        {{ $t('audioSection.testar') }}
                    </button>
                </span>
            </div>
            <div class="set-row">
                <span class="what">
                    <b>{{ $t('audioSection.volume_do_toque', { n: devices.ringVolume }) }}</b>
                    <small>{{ $t('audioSection.toque_por_conta') }}</small>
                </span>
                <span class="control pair">
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
            </div>
            <div class="set-row">
                <span class="what">
                    <b>{{ $t('audioSection.gravacoes') }}</b>
                    <small>{{ $t('audioSection.gravacoes_dica') }}</small>
                    <small v-if="folderError" class="error" role="alert">{{ folderError }}</small>
                </span>
                <button class="btn small" @click="openRecordings">{{ $t('audioSection.abrir_gravacoes') }}</button>
            </div>
        </div>

        <h4 class="sub">{{ $t('audioSection.codecs') }}</h4>
        <CodecsList />
    </section>
</template>

<style scoped>
.sub {
    margin: 0 0 -8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
}
.set-row {
    padding: 7px 12px;
}
.control.pair {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 300px;
}
.control.pair select,
.control.pair input[type='range'] {
    flex: 1;
    min-width: 0;
}
select.control {
    width: 300px;
}
input[type='range'] {
    accent-color: var(--accent);
}
.meter {
    width: 300px;
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
.error {
    color: var(--bad-text) !important;
}
</style>
