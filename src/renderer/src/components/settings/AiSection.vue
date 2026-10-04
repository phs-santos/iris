<script setup lang="ts">
import { t } from '@renderer/i18n'
import { onMounted, ref } from 'vue'
import type { AiStatus } from '@shared/ai'

/** Chave, modelo padrão e máscara da ajuda da IA (RF-38). O pedido em si continua na tela "Explicar com IA". */
const status = ref<AiStatus | null>(null)
const keyInput = ref('')
const keyError = ref('')
const model = ref('')
const mask = ref(true)
const saved = ref(false)

async function refresh(): Promise<void> {
    status.value = await window.iris.ai.status()
    model.value = status.value.model ?? ''
    mask.value = status.value.mask
}

async function saveKey(): Promise<void> {
    keyError.value = ''
    if (!keyInput.value.trim()) {
        keyError.value = t('aiSection.cole_a_chave_da_openrouter')
        return
    }
    await window.iris.ai.setKey(keyInput.value)
    keyInput.value = ''
    await refresh()
}

async function removeKey(): Promise<void> {
    await window.iris.ai.setKey(null)
    await refresh()
}

async function saveOptions(): Promise<void> {
    await window.iris.ai.setOptions({ model: model.value.trim(), mask: mask.value })
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
}

onMounted(refresh)
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('aiSection.ajuda_da_ia') }}</h3>
            <p>
                {{ $t('aiSection.o_botao_explicar_com_ia') }}
            </p>
        </div>
        <template v-if="status && !status.hasKey">
            <label class="field">
                <span class="label">{{ $t('aiSection.chave_da_openrouter') }}</span>
                <input v-model="keyInput" class="input mono" type="password" autocomplete="off" />
            </label>
            <p v-if="keyError" class="error" role="alert">{{ keyError }}</p>
            <p class="set-hint">
                {{ $t('aiSection.crie_a_chave_em') }} <span class="mono">{{ $t('aiSection.openrouter_ai_keys') }}</span
                >{{ $t('aiSection.ela_fica_no_arquivo_de') }}
            </p>
            <div>
                <button class="btn primary" @click="saveKey">{{ $t('aiSection.salvar_chave') }}</button>
            </div>
        </template>
        <template v-else-if="status">
            <div class="set-group">
                <div class="set-row">
                    <span class="what">
                        <b>{{ $t('aiSection.chave_da_openrouter') }}</b>
                        <small>{{ $t('aiSection.salva_e_cifrada_no_arquivo') }}</small>
                    </span>
                    <button class="btn" @click="removeKey">{{ $t('aiSection.remover_chave') }}</button>
                </div>
                <label class="set-row">
                    <span class="what">
                        <b>{{ $t('aiSection.modelo_padrao') }}</b>
                        <small>{{ $t('aiSection.no_formato_fornecedor_modelo_da') }}</small>
                    </span>
                    <input
                        v-model="model"
                        class="input mono control"
                        :placeholder="$t('aiSection.fornecedor_modelo')"
                    />
                </label>
                <label class="set-row">
                    <span class="what">
                        <b>{{ $t('aiSection.mascarar_dados_do_ambiente') }}</b>
                        <small>{{ $t('aiSection.ramais_numeros_ips_dominios_e') }}</small>
                    </span>
                    <input v-model="mask" type="checkbox" />
                </label>
            </div>
            <div class="actions">
                <button class="btn primary" @click="saveOptions">{{ $t('aiSection.salvar') }}</button>
                <span v-if="saved" class="set-hint" role="status">{{ $t('aiSection.salvo') }}</span>
            </div>
        </template>
    </section>
</template>

<style scoped>
.error {
    margin: 0;
    color: var(--bad);
}
.actions {
    display: flex;
    align-items: center;
    gap: 10px;
}
.actions .set-hint {
    margin: 0;
}
</style>
