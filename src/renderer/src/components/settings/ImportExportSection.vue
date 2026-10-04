<script setup lang="ts">
import { ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'

const accounts = useAccountsStore()
const includePasswords = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)

async function doExport(): Promise<void> {
    const json = await accounts.exportJson(includePasswords.value)
    const path = await window.iris.files.saveText('iris-contas.json', json)
    if (path) message.value = { ok: true, text: `${accounts.accounts.length} contas exportadas para ${path}` }
}

async function doImport(): Promise<void> {
    const text = await window.iris.files.openText()
    if (text === null) return
    try {
        const count = await accounts.importJson(text)
        message.value = {
            ok: true,
            text: `${count} contas importadas. Contas sem senha no arquivo pedem a senha ao editar.`
        }
    } catch (error) {
        message.value = { ok: false, text: (error as Error).message }
    }
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>Importar e exportar contas</h3>
            <p>Leve as contas para outra máquina ou mande para um colega.</p>
        </div>
        <div class="part">
            <h4>Exportar</h4>
            <p>Salva todas as contas num arquivo JSON.</p>
            <label class="check">
                <input v-model="includePasswords" type="checkbox" />
                Incluir senhas em texto puro no arquivo
            </label>
            <p v-if="includePasswords" class="warn">
                Quem tiver o arquivo poderá registrar os ramais. Compartilhe com cuidado.
            </p>
            <button class="btn primary" @click="doExport">Exportar contas</button>
        </div>
        <div class="part">
            <h4>Importar</h4>
            <p>Lê um arquivo exportado pela Íris. Contas com o mesmo id são substituídas; as outras são adicionadas.</p>
            <button class="btn" @click="doImport">Escolher arquivo</button>
        </div>
        <p v-if="message" class="result" :class="message.ok ? 'ok' : 'bad'" role="status">{{ message.text }}</p>
    </section>
</template>

<style scoped>
.part {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
}
h4 {
    margin: 0;
    font-size: 13px;
}
.part p {
    margin: 0;
    color: var(--muted);
}
.check {
    display: flex;
    gap: 6px;
    align-items: center;
}
.warn {
    color: var(--warn);
}
.result {
    margin: 0;
    padding: 8px 10px;
    border-radius: 6px;
}
.result.ok {
    background: rgba(63, 207, 134, 0.12);
    color: #6fe0a6;
}
.result.bad {
    background: rgba(240, 103, 94, 0.12);
    color: #ff8f86;
}
</style>
