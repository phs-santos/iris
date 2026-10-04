<script setup lang="ts">
import { t } from '@renderer/i18n'
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
    'curl -fsSL https://raw.githubusercontent.com/phs-santos/iris/main/scripts/install-macos.sh | bash' // i18n-ok: comando, não frase
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
            return t('updateSection.ainda_nao_procurou_por_versao')
        case 'checking':
            return t('updateSection.procurando_versao_nova')
        case 'up-to-date':
            return t('updateSection.voce_ja_esta_na_versao')
        case 'available':
            return t('updateSection.a_versao_esta_disponivel_nada', { version: s.version })
        case 'downloading':
            return t('updateSection.baixando_a_versao', { version: s.version, percent: s.percent })
        case 'ready':
            return t('updateSection.a_versao_foi_baixada_ela', { version: s.version })
        case 'error':
            return t('updateSection.nao_deu_para_atualizar', { message: s.message })
    }
})
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('updateSection.atualizacao') }}</h3>
            <p>
                {{ $t('updateSection.versao_instalada') }} <b class="mono">{{ info.currentVersion }}</b>
            </p>
        </div>
        <label class="field">
            <span class="label">{{ $t('updateSection.canal') }}</span>
            <select
                class="input"
                :value="info.channel"
                @change="emit('channel', ($event.target as HTMLSelectElement).value as UpdateChannel)"
            >
                <option value="stable">{{ $t('updateSection.estavel') }}</option>
                <option value="beta">{{ $t('updateSection.beta_recebe_versoes_de_teste') }}</option>
            </select>
        </label>
        <p class="status" :class="{ error: status.state === 'error' }" role="status">{{ message }}</p>
        <p v-if="status.state === 'ready' && calls.active.length" class="set-hint">
            {{ $t('updateSection.encerre_as_chamadas_antes_de') }}
        </p>
        <p v-if="status.state === 'error' && info.manual" class="set-hint">
            {{ $t('updateSection.se_nao_der_pelo_app') }}
        </p>
        <pre
            v-if="status.state === 'error' && info.manual"
            class="command mono"
            tabindex="0"
            :aria-label="$t('updateSection.comando_para_atualizar_pelo_terminal')"
            >{{ INSTALL_COMMAND }}</pre>
        <div class="actions">
            <button v-if="status.state === 'error' && info.manual" class="btn" @click="copyCommand">
                {{ copied ? $t('updateSection.copiado') : $t('updateSection.copiar_comando') }}
            </button>
            <button v-if="status.state === 'available'" class="btn primary" @click="api.download()">
                {{ $t('updateSection.baixar') }}
            </button>
            <button
                v-else-if="status.state === 'ready'"
                class="btn primary"
                :disabled="calls.active.length > 0"
                @click="api.install()"
            >
                {{ $t('updateSection.reiniciar_e_instalar') }}
            </button>
            <button
                v-else
                class="btn primary"
                :disabled="!supported || status.state === 'checking' || status.state === 'downloading'"
                @click="api.check()"
            >
                {{ $t('updateSection.procurar_atualizacao') }}
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
