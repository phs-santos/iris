<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import PhoneIcon from './PhoneIcon.vue'

/**
 * Imagem de uma chamada de vídeo (RF-52): o outro lado em tamanho grande e a própria câmera numa
 * miniatura. Os fluxos ficam no motor; aqui eles só são ligados aos elementos de vídeo, sem som (o
 * áudio da chamada já toca pelo motor).
 */
const props = defineProps<{ call: CallView }>()
const calls = useCallsStore()
const remoteEl = ref<HTMLVideoElement | null>(null)
const localEl = ref<HTMLVideoElement | null>(null)

// `videoRev` muda quando o motor avisa que as imagens mudaram.
const streams = computed(() => (props.call.videoRev >= 0 ? calls.videoStreams(props.call.id) : null))

watchEffect(() => {
    const remote = streams.value?.remote ?? null
    const local = streams.value?.local ?? null
    if (remoteEl.value && remoteEl.value.srcObject !== remote) remoteEl.value.srcObject = remote
    if (localEl.value && localEl.value.srcObject !== local) localEl.value.srcObject = local
})
</script>

<template>
    <div class="video" @click.stop>
        <div class="stage" :class="{ empty: !streams?.remote }">
            <video
                ref="remoteEl"
                class="remote"
                autoplay
                muted
                playsinline
                :aria-label="$t('callVideo.imagem_de', { name: call.remoteName || call.remote })"
            ></video>
            <p v-if="!streams?.remote" class="none">{{ $t('callVideo.sem_imagem') }}</p>
            <video
                v-show="streams?.local"
                ref="localEl"
                class="local"
                autoplay
                muted
                playsinline
                :aria-label="$t('callVideo.sua_camera')"
            ></video>
        </div>
        <div class="bar">
            <button
                v-if="call.sendsVideo"
                class="btn small"
                :class="{ on: call.cameraOff }"
                @click="calls.toggleCamera(call.id)"
            >
                <PhoneIcon name="video" />{{
                    call.cameraOff ? $t('callVideo.ligar_camera') : $t('callVideo.desligar_camera')
                }}
            </button>
            <span v-else class="hint">{{ $t('callVideo.so_recebendo') }}</span>
        </div>
    </div>
</template>

<style scoped>
.video {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
}
.stage {
    position: relative;
    aspect-ratio: 16 / 9;
    max-height: 300px;
    border-radius: 10px;
    overflow: hidden;
    background: #05090d;
    display: grid;
    place-items: center;
}
.remote {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.empty .remote {
    visibility: hidden;
}
.none {
    position: absolute;
    margin: 0;
    color: #b8c4d0;
    font-size: 12px;
}
.local {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 26%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: #000;
}
.bar {
    display: flex;
    align-items: center;
    gap: 8px;
}
.hint {
    color: var(--muted);
    font-size: 12px;
}
</style>
