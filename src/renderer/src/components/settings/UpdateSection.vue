<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UpdateChannel, UpdateInfo } from '@shared/types'
import { useCallsStore } from '@renderer/stores/calls'

/** Atualização automática (RF-35): canal, procurar, baixar e reiniciar. O estado vem do App. */
const props = defineProps<{ info: UpdateInfo }>()
const emit = defineEmits<{ channel: [channel: UpdateChannel] }>()
const calls = useCallsStore()

const api = window.iris.update

/** No Mac sem assinatura, atualizar pelo Terminal evita o aviso da Apple (scripts/install-macos.sh, RNF-17). */
const INSTALL_COMMAND =
    'curl -fsSL https://raw.githubusercontent.com/phs-santos/iris/main/scripts/install-macos.sh | bash'
const copied = ref(false)

async function copyCommand(): Promise<void> {
    await navigator.clipboard.writeText(INSTALL_COMMAND).catch(() => undefined)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
}

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
            return `A versão ${s.version} está disponível. Nada foi baixado ainda.`
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
        <p v-if="status.state === 'error' && info.manual" class="set-hint">
            Se não der pelo app, feche a Íris (Sair, na barra de menus) e cole este comando no Terminal. Ela volta na
            versão nova e as contas continuam.
        </p>
        <pre
            v-if="status.state === 'error' && info.manual"
            class="command mono"
            tabindex="0"
            aria-label="Comando para atualizar pelo Terminal"
            >{{ INSTALL_COMMAND }}</pre>
        <div class="actions">
            <button v-if="status.state === 'error' && info.manual" class="btn" @click="copyCommand">
                {{ copied ? 'Copiado' : 'Copiar comando' }}
            </button>
            <button v-if="status.state === 'available'" class="btn primary" @click="api.download()">Baixar</button>
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
.command {
    margin: 0;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    font-size: 11.5px;
    white-space: pre-wrap;
    word-break: break-all;
    user-select: all;
}
.actions {
    display: flex;
    gap: 8px;
}
.status {
    margin: 0;
}
.status.error {
    color: var(--bad);
}
</style>
