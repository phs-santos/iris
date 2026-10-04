<script setup lang="ts">
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
        keyError.value = 'Cole a chave da OpenRouter.'
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
            <h3>Ajuda da IA</h3>
            <p>
                O botão "Explicar com IA" manda um trecho do log para um modelo da OpenRouter, com a sua chave. O uso é
                cobrado na sua conta de lá.
            </p>
        </div>
        <template v-if="status && !status.hasKey">
            <label class="field">
                <span class="label">Chave da OpenRouter</span>
                <input v-model="keyInput" class="input mono" type="password" autocomplete="off" />
            </label>
            <p v-if="keyError" class="error" role="alert">{{ keyError }}</p>
            <p class="set-hint">
                Crie a chave em <span class="mono">openrouter.ai/keys</span>. Ela fica no arquivo de senhas da Íris,
                cifrada, e não aparece de novo na tela nem entra em exportações.
            </p>
            <div><button class="btn primary" @click="saveKey">Salvar chave</button></div>
        </template>
        <template v-else-if="status">
            <div class="set-group">
                <div class="set-row">
                    <span class="what">
                        <b>Chave da OpenRouter</b>
                        <small>Salva e cifrada no arquivo de senhas.</small>
                    </span>
                    <button class="btn" @click="removeKey">Remover chave</button>
                </div>
                <label class="set-row">
                    <span class="what">
                        <b>Modelo padrão</b>
                        <small>No formato fornecedor/modelo. Dá para trocar na hora de enviar.</small>
                    </span>
                    <input v-model="model" class="input mono control" placeholder="fornecedor/modelo" />
                </label>
                <label class="set-row">
                    <span class="what">
                        <b>Mascarar dados do ambiente</b>
                        <small>Ramais, números, IPs, domínios e nomes de conta viram marcadores antes de sair.</small>
                    </span>
                    <input v-model="mask" type="checkbox" />
                </label>
            </div>
            <div class="actions">
                <button class="btn primary" @click="saveOptions">Salvar</button>
                <span v-if="saved" class="set-hint" role="status">Salvo.</span>
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
