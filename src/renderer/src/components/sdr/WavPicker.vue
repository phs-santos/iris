<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { t } from '@renderer/i18n'
import workletUrl from '@renderer/sip/pcm-worklet.js?url&no-inline'

/**
 * Áudio do modo SDR (abertura e recado da caixa postal): gravar com o microfone, ouvir, escolher um
 * WAV do disco ou tirar. O que é gravado vira um WAV de 8 kHz na pasta sdr dos dados da Íris.
 */
const props = defineProps<{ path?: string; name: string; label: string }>()
const emit = defineEmits<{ change: [path: string | undefined] }>()
const recording = ref(false)
const seconds = ref(0)
const error = ref('')
let session:
    { ctx: AudioContext; stream: MediaStream; frames: Int16Array[]; timer: ReturnType<typeof setInterval> } | undefined

const fileName = (path?: string): string => path?.split(/[\\/]/).pop() ?? ''

async function record(): Promise<void> {
    error.value = ''
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const ctx = new AudioContext({ sampleRate: 8000 })
        await ctx.audioWorklet.addModule(workletUrl)
        const node = new AudioWorkletNode(ctx, 'iris-capture', { numberOfOutputs: 0 })
        const frames: Int16Array[] = []
        node.port.onmessage = (event: MessageEvent<Int16Array>) => frames.push(event.data)
        ctx.createMediaStreamSource(stream).connect(node)
        seconds.value = 0
        const timer = setInterval(() => {
            seconds.value++
            if (seconds.value >= 60) void stop()
        }, 1000)
        session = { ctx, stream, frames, timer }
        recording.value = true
    } catch (cause) {
        error.value = t('sdrAudio.sem_microfone', { p: (cause as Error).message })
    }
}

async function stop(): Promise<void> {
    const s = session
    if (!s) return
    session = undefined
    recording.value = false
    clearInterval(s.timer)
    s.stream.getTracks().forEach((track) => track.stop())
    await s.ctx.close().catch(() => undefined)
    const total = s.frames.reduce((sum, f) => sum + f.length, 0)
    if (total < 4000) return void (error.value = t('sdrAudio.curto_demais'))
    const pcm = new Int16Array(total)
    let offset = 0
    for (const frame of s.frames) {
        pcm.set(frame, offset)
        offset += frame.length
    }
    try {
        emit('change', await window.iris.sdr.saveWav(`${props.name}-${Date.now()}`, pcm))
    } catch (cause) {
        error.value = (cause as Error).message
    }
}

async function choose(): Promise<void> {
    const path = await window.iris.audio.pickWav()
    if (path) emit('change', path)
}

async function listen(): Promise<void> {
    if (!props.path) return
    error.value = ''
    try {
        const pcm = await window.iris.audio.loadWav(props.path)
        const ctx = new AudioContext({ sampleRate: 8000 })
        const buffer = ctx.createBuffer(1, pcm.length, 8000)
        const channel = buffer.getChannelData(0)
        for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i]! / 0x8000
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.onended = () => void ctx.close()
        source.start()
    } catch (cause) {
        error.value = (cause as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    }
}

onUnmounted(() => void stop())
</script>

<template>
    <div class="wav" role="group" :aria-label="label">
        <span class="file mono">{{ path ? fileName(path) : $t('sdrAudio.nenhum') }}</span>
        <button v-if="!recording" type="button" class="btn small" @click="record">{{ $t('sdrAudio.gravar') }}</button>
        <button v-else type="button" class="btn small stop" @click="stop">
            {{ $t('sdrAudio.parar', { s: seconds }) }}
        </button>
        <button type="button" class="btn small" :disabled="recording" @click="choose">
            {{ $t('sdrAudio.escolher') }}
        </button>
        <button v-if="path" type="button" class="btn small" :disabled="recording" @click="listen">
            {{ $t('sdrAudio.ouvir') }}
        </button>
        <button
            v-if="path"
            type="button"
            class="btn small ghost"
            :disabled="recording"
            @click="emit('change', undefined)"
        >
            {{ $t('sdrAudio.tirar') }}
        </button>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
</template>

<style scoped>
.wav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}
.file {
    flex: 1;
    min-width: 120px;
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.error {
    flex-basis: 100%;
    margin: 0;
    color: var(--bad-text);
    font-size: 12px;
}
</style>
