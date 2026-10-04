<script setup lang="ts">
import { computed } from 'vue'
import type { UpdateChannel, UpdateInfo } from '@shared/types'
import { useCallsStore } from '@renderer/stores/calls'

/** Atualização automática (RF-35): canal, procurar, baixar e reiniciar. O estado vem do App. */
const props = defineProps<{ info: UpdateInfo }>()
const emit = defineEmits<{ channel: [channel: UpdateChannel] }>()
const calls = useCallsStore()

const api = window.iris.update

const status = computed(() => props.info.status)
const supported = computed(() => status.value.state !== 'unsupported')
const message = computed(() => {
    const s = status.value
    switch (s.state) {
        case 'unsupported':
            return s.reason
        case 'idle':
            return 'Ainda não procurou por versão nova.'
        case 'checking':
            return 'Procurando versão nova…'
        case 'up-to-date':
            return 'Você já está na versão mais recente deste canal.'
        case 'available':
            return props.info.manual
                ? `A versão ${s.version} está disponível. Neste Mac a Íris ainda não consegue se atualizar sozinha, porque o app não é assinado. Baixe o instalador novo (.dmg) e instale por cima; suas contas continuam.`
                : `A versão ${s.version} está disponível. Nada foi baixado ainda.`
        case 'downloading':
            return `Baixando a versão ${s.version}: ${s.percent}%`
        case 'ready':
            return `A versão ${s.version} foi baixada. Ela entra quando o app reiniciar.`
        case 'error':
            return `Não deu para atualizar: ${s.message}`
    }
})
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>Atualização</h3>
            <p>
                Versão instalada: <b class="mono">{{ info.currentVersion }}</b>
            </p>
        </div>
        <label class="field">
            <span class="label">Canal</span>
            <select
                class="input"
                :value="info.channel"
                @change="emit('channel', ($event.target as HTMLSelectElement).value as UpdateChannel)"
            >
                <option value="stable">Estável</option>
                <option value="beta">Beta (recebe versões de teste)</option>
            </select>
        </label>
        <p class="status" :class="{ error: status.state === 'error' }" role="status">{{ message }}</p>
        <p v-if="status.state === 'ready' && calls.active.length" class="set-hint">
            Encerre as chamadas antes de reiniciar.
        </p>
        <div>
            <button
                v-if="status.state === 'available' && info.manual"
                class="btn primary"
                @click="api.openDownloadPage()"
            >
                Abrir página de download
            </button>
            <button v-else-if="status.state === 'available'" class="btn primary" @click="api.download()">Baixar</button>
            <button
                v-else-if="status.state === 'ready'"
                class="btn primary"
                :disabled="calls.active.length > 0"
                @click="api.install()"
            >
                Reiniciar e instalar
            </button>
            <button
                v-else
                class="btn primary"
                :disabled="!supported || status.state === 'checking' || status.state === 'downloading'"
                @click="api.check()"
            >
                Procurar atualização
            </button>
        </div>
    </section>
</template>

<style scoped>
.status {
    margin: 0;
}
.status.error {
    color: var(--bad);
}
</style>
