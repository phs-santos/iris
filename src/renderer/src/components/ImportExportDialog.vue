<script setup lang="ts">
import { useDialog } from '@renderer/lib/dialog'
import { ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'

const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
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
    <div class="overlay" @click.self="emit('close')">
        <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" aria-labelledby="ie-title" tabindex="-1">
            <header>
                <h2 id="ie-title">Importar e exportar contas</h2>
                <button class="btn small ghost" aria-label="Fechar" @click="emit('close')">✕</button>
            </header>
            <div class="body">
                <section>
                    <h3>Exportar</h3>
                    <p>Salva todas as contas num arquivo JSON para levar a outra máquina ou mandar a um colega.</p>
                    <label class="check">
                        <input v-model="includePasswords" type="checkbox" />
                        Incluir senhas em texto puro no arquivo
                    </label>
                    <p v-if="includePasswords" class="warn">
                        Quem tiver o arquivo poderá registrar os ramais. Compartilhe com cuidado.
                    </p>
                    <button class="btn primary" @click="doExport">Exportar contas</button>
                </section>
                <section>
                    <h3>Importar</h3>
                    <p>
                        Lê um arquivo exportado pela Íris. Contas com o mesmo id são substituídas; as outras são
                        adicionadas.
                    </p>
                    <button class="btn" @click="doImport">Escolher arquivo</button>
                </section>
                <p v-if="message" class="result" :class="message.ok ? 'ok' : 'bad'">{{ message.text }}</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
}
h3 {
    margin: 0;
    font-size: 13px;
}
p {
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
