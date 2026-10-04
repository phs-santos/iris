<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { LOAD_LIMITS, loadReportToText, type LoadProgress, type LoadReport } from '@shared/load'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogStore } from '@renderer/stores/log'
import { t } from '@renderer/i18n'

/** Teste de carga por SIP puro (RF-42): várias chamadas ao mesmo tempo pela conta, cada uma tocando um tom. */
const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
const accounts = useAccountsStore()
const log = useLogStore()
const account = computed(() => accounts.byId(props.accountId))

const form = reactive({ destination: '', calls: 10, seconds: 10, rampMs: 100 })
const running = ref(false)
const progress = ref<LoadProgress | null>(null)
const report = ref<LoadReport | null>(null)
const error = ref('')
const saved = ref('')
const text = computed(() => (report.value ? loadReportToText(report.value, account.value?.name ?? '') : ''))

function stop(): void {
    void accounts.engineOf(props.accountId)?.stopLoadTest?.()
}
// Fechar a tela no meio do teste encerra as chamadas: elas não ficam abertas sem ninguém vendo.
function close(): void {
    if (running.value) stop()
    emit('close')
}
useDialog(dialogEl, close)
onUnmounted(() => running.value && stop())

async function start(): Promise<void> {
    const engine = accounts.engineOf(props.accountId)
    error.value = ''
    report.value = null
    saved.value = ''
    if (!engine?.loadTest) {
        error.value = t('loadDialog.registre_antes')
        return
    }
    running.value = true
    progress.value = { started: 0, established: 0, finished: 0, total: form.calls }
    try {
        report.value = await engine.loadTest(
            {
                destination: form.destination.trim(),
                calls: Math.round(form.calls),
                seconds: Math.round(form.seconds),
                rampMs: Math.round(form.rampMs)
            },
            (p) => (progress.value = p)
        )
        const r = report.value
        log.add(
            props.accountId,
            r.failed ? 'warn' : 'info',
            'event',
            t('loadDialog.log_resultado', {
                destination: r.destination,
                established: r.established,
                requested: r.requested,
                withAudio: r.withAudio
            })
        )
    } catch (cause) {
        error.value = (cause as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    } finally {
        running.value = false
    }
}

async function save(): Promise<void> {
    const path = await window.iris.files.saveText('iris-carga.txt', text.value)
    if (path) saved.value = t('loadDialog.salvo_em', { path })
}
</script>

<template>
    <div class="overlay" @click.self="close">
        <form
            ref="dialogEl"
            class="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="load-title"
            tabindex="-1"
            @submit.prevent="start"
        >
            <header>
                <h2 id="load-title">{{ $t('loadDialog.titulo', { name: account?.name ?? '' }) }}</h2>
                <button type="button" class="btn small ghost" :aria-label="$t('loadDialog.fechar')" @click="close">
                    ✕
                </button>
            </header>
            <div class="body">
                <p class="hint">{{ $t('loadDialog.explicacao') }}</p>
                <fieldset class="fields" :disabled="running">
                    <label class="field">
                        <span class="label">{{ $t('loadDialog.destino') }}</span>
                        <input v-model="form.destination" class="input mono" required placeholder="600" />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('loadDialog.chamadas') }}</span>
                        <input
                            v-model.number="form.calls"
                            class="input mono"
                            type="number"
                            min="1"
                            :max="LOAD_LIMITS.calls"
                            required
                        />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('loadDialog.segundos') }}</span>
                        <input
                            v-model.number="form.seconds"
                            class="input mono"
                            type="number"
                            min="1"
                            :max="LOAD_LIMITS.seconds"
                            required
                        />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('loadDialog.intervalo') }}</span>
                        <input
                            v-model.number="form.rampMs"
                            class="input mono"
                            type="number"
                            min="0"
                            :max="LOAD_LIMITS.rampMs"
                            step="10"
                            required
                        />
                    </label>
                </fieldset>
                <p v-if="running && progress" class="progress mono tabular" role="status">
                    {{
                        $t('loadDialog.andamento', {
                            started: progress.started,
                            total: progress.total,
                            established: progress.established,
                            finished: progress.finished
                        })
                    }}
                </p>
                <p v-if="error" class="bad" role="alert">{{ error }}</p>
                <div v-if="report" role="status">
                    <p class="summary" :class="report.failed || report.withAudio < report.established ? 'bad' : 'ok'">
                        {{
                            $t('loadDialog.resumo', {
                                established: report.established,
                                requested: report.requested,
                                withAudio: report.withAudio
                            })
                        }}
                    </p>
                    <pre class="mono" tabindex="0" :aria-label="$t('loadDialog.relatorio')">{{ text }}</pre>
                    <p v-if="saved" class="hint">{{ saved }}</p>
                </div>
            </div>
            <footer>
                <button v-if="report" type="button" class="btn" @click="save">{{ $t('loadDialog.salvar') }}</button>
                <button type="button" class="btn" @click="close">{{ $t('loadDialog.fechar') }}</button>
                <button v-if="running" type="button" class="btn stop" @click="stop">
                    {{ $t('loadDialog.parar') }}
                </button>
                <button v-else type="submit" class="btn primary">{{ $t('loadDialog.comecar') }}</button>
            </footer>
        </form>
    </div>
</template>

<style scoped>
.dialog {
    width: min(640px, 100%);
}
.hint {
    color: var(--muted);
    margin: 0 0 10px;
}
.fields {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    border: 0;
    margin: 0 0 10px;
    padding: 0;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.ok {
    color: var(--ok);
}
.bad {
    color: var(--bad);
}
.summary {
    font-weight: 600;
}
pre {
    margin: 6px 0;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    font-size: 12px;
    white-space: pre-wrap;
}
</style>
