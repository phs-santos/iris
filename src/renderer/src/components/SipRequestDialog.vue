<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { MANUAL_METHODS, type SipManualResponse } from '@shared/types'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogStore } from '@renderer/stores/log'
import { t } from '@renderer/i18n'

/** Pedido SIP manual por uma conta registrada (RF-45): OPTIONS, MESSAGE, SUBSCRIBE e afins. */
const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const log = useLogStore()

const account = computed(() => accounts.byId(props.accountId))
const form = reactive({
    method: 'OPTIONS' as string,
    uri: `sip:${account.value?.domain ?? ''}`,
    headers: '',
    contentType: 'text/plain',
    body: ''
})
const sending = ref(false)
const error = ref('')
const response = ref<SipManualResponse | null>(null)

async function send(): Promise<void> {
    const engine = accounts.engineOf(props.accountId)
    error.value = ''
    response.value = null
    if (!engine?.request) {
        error.value = t('sipRequestDialog.registre_antes')
        return
    }
    sending.value = true
    try {
        response.value = await engine.request({
            method: form.method,
            uri: form.uri.trim(),
            headers: form.headers
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            body: form.body || undefined,
            contentType: form.body ? form.contentType.trim() : undefined
        })
        const { status, reason, ms } = response.value
        log.add(
            props.accountId,
            status >= 300 ? 'warn' : 'info',
            'event',
            `${form.method} manual: ${status} ${reason} em ${ms} ms`
        )
    } catch (cause) {
        // O Electron põe o nome do canal na frente da mensagem; fica só o motivo.
        error.value = (cause as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    } finally {
        sending.value = false
    }
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <form
            ref="dialogEl"
            class="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sip-request-title"
            tabindex="-1"
            @submit.prevent="send"
        >
            <header>
                <h2 id="sip-request-title">{{ $t('sipRequestDialog.titulo', { name: account?.name ?? '' }) }}</h2>
                <button
                    type="button"
                    class="btn small ghost"
                    :aria-label="$t('sipRequestDialog.fechar')"
                    @click="emit('close')"
                >
                    ✕
                </button>
            </header>
            <div class="body">
                <p class="hint">{{ $t('sipRequestDialog.explicacao') }}</p>
                <div class="line">
                    <label class="field method">
                        <span class="label">{{ $t('sipRequestDialog.metodo') }}</span>
                        <select v-model="form.method" class="input mono">
                            <option v-for="m in MANUAL_METHODS" :key="m" :value="m">{{ m }}</option>
                        </select>
                    </label>
                    <label class="field grow">
                        <span class="label">{{ $t('sipRequestDialog.endereco') }}</span>
                        <input v-model="form.uri" class="input mono" required />
                    </label>
                </div>
                <label class="field">
                    <span class="label">{{ $t('sipRequestDialog.cabecalhos') }}</span>
                    <textarea
                        v-model="form.headers"
                        class="input mono"
                        rows="3"
                        :placeholder="$t('sipRequestDialog.cabecalhos_exemplo')"
                    ></textarea>
                </label>
                <div class="line">
                    <label class="field grow">
                        <span class="label">{{ $t('sipRequestDialog.corpo') }}</span>
                        <textarea v-model="form.body" class="input mono" rows="3"></textarea>
                    </label>
                    <label class="field type">
                        <span class="label">{{ $t('sipRequestDialog.tipo_do_corpo') }}</span>
                        <input v-model="form.contentType" class="input mono" :disabled="!form.body" />
                    </label>
                </div>
                <p v-if="error" class="result bad" role="alert">{{ error }}</p>
                <div v-if="response" class="response" role="status">
                    <p class="result" :class="response.status < 300 ? 'ok' : 'bad'">
                        {{
                            $t('sipRequestDialog.resposta', {
                                status: response.status,
                                reason: response.reason,
                                ms: response.ms
                            })
                        }}
                    </p>
                    <pre class="mono" tabindex="0" :aria-label="$t('sipRequestDialog.resposta_completa')">{{
                        response.text
                    }}</pre>
                </div>
            </div>
            <footer>
                <button type="button" class="btn" @click="emit('close')">{{ $t('sipRequestDialog.fechar') }}</button>
                <button type="submit" class="btn primary" :disabled="sending">
                    {{ sending ? $t('sipRequestDialog.enviando') : $t('sipRequestDialog.enviar') }}
                </button>
            </footer>
        </form>
    </div>
</template>

<style scoped>
.dialog {
    width: min(680px, 100%);
}
.hint {
    color: var(--muted);
    margin: 0 0 10px;
}
.line {
    display: flex;
    gap: 10px;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
}
.grow {
    flex: 1;
    min-width: 0;
}
.method {
    width: 150px;
}
.type {
    width: 170px;
}
.result.ok {
    color: var(--ok);
}
.result.bad {
    color: var(--bad);
}
.response pre {
    max-height: 220px;
    overflow: auto;
    margin: 6px 0 0;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
