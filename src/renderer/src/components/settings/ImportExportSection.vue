<script setup lang="ts">
import { t } from '@renderer/i18n'
import { ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { CSV_HEADER } from '@renderer/lib/accounts'

const accounts = useAccountsStore()
const includePasswords = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)

async function doExport(): Promise<void> {
    const json = await accounts.exportJson(includePasswords.value)
    const path = await window.iris.files.saveText('iris-contas.json', json)
    if (path)
        message.value = {
            ok: true,
            text: t('importExportSection.contas_exportadas_para', { length: accounts.accounts.length, path })
        }
}

async function doImport(): Promise<void> {
    const text = await window.iris.files.openText()
    if (text === null) return
    try {
        const count = await accounts.importJson(text)
        message.value = {
            ok: true,
            text: t('importExportSection.contas_importadas_contas_sem_senha', { count })
        }
    } catch (error) {
        message.value = { ok: false, text: (error as Error).message }
    }
}

async function doImportCsv(): Promise<void> {
    const text = await window.iris.files.openText('csv')
    if (text === null) return
    try {
        const count = await accounts.importCsv(text)
        message.value = { ok: true, text: t('importExportSection.contas_criadas', { count }) }
    } catch (error) {
        message.value = { ok: false, text: (error as Error).message }
    }
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('importExportSection.importar_e_exportar_contas') }}</h3>
            <p>{{ $t('importExportSection.leve_as_contas_para_outra') }}</p>
        </div>
        <div class="part">
            <h4>{{ $t('importExportSection.exportar') }}</h4>
            <p>{{ $t('importExportSection.salva_todas_as_contas_num') }}</p>
            <label class="check">
                <input v-model="includePasswords" type="checkbox" />
                {{ $t('importExportSection.incluir_senhas_em_texto_puro') }}
            </label>
            <p v-if="includePasswords" class="warn">
                {{ $t('importExportSection.quem_tiver_o_arquivo_podera') }}
            </p>
            <button class="btn primary" @click="doExport">{{ $t('importExportSection.exportar_contas') }}</button>
        </div>
        <div class="part">
            <h4>{{ $t('importExportSection.importar') }}</h4>
            <p>{{ $t('importExportSection.le_um_arquivo_exportado_pela') }}</p>
            <button class="btn" @click="doImport">{{ $t('importExportSection.escolher_arquivo') }}</button>
        </div>
        <div class="part">
            <h4>{{ $t('importExportSection.importar_csv') }}</h4>
            <p>{{ $t('importExportSection.csv_explicacao', { header: CSV_HEADER }) }}</p>
            <button class="btn" @click="doImportCsv">{{ $t('importExportSection.escolher_csv') }}</button>
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
    color: var(--bad-text);
}
</style>
