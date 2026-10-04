<script setup lang="ts">
import { t } from '@renderer/i18n'
import { useDialog } from '@renderer/lib/dialog'
import { computed, onMounted, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { describeStatus } from '@renderer/lib/accounts'
import { isNativeAccount } from '@renderer/sip'

type Check = { ok: boolean | null; text: string; hint?: string }

const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const account = computed(() => accounts.byId(props.accountId))
const checks = ref<Check[]>([])
const running = ref(false)
const checkedAt = ref('')

/** Verificações de ambiente e da conta (RF-24 e RF-25). */
async function run(): Promise<void> {
    const a = account.value
    if (!a) return
    running.value = true
    const list: Check[] = []

    const status = accounts.statusOf(a.id)
    list.push({
        ok: status.state === 'registered',
        text: t('healthDialog.registro', { p: describeStatus(status) }),
        hint: status.state === 'error' && status.code === 401 ? t('healthDialog.confira_a_senha_e_o') : undefined
    })

    // SIP puro (RF-39) não usa WebSocket: mostra o transporte da conta.
    const link = isNativeAccount(a)
        ? t('healthDialog.transporte', { p: a.transport?.toUpperCase() })
        : t('healthDialog.websocket')
    const health = await accounts.checkHealth(a.id)
    if (health) {
        list.push({
            ok: health.websocketConnected,
            text: `${link} ${health.websocketConnected ? 'conectado' : 'desconectado'}`
        })
        list.push({
            ok: health.latencyMs !== undefined,
            text:
                health.latencyMs !== undefined
                    ? t('healthDialog.options_respondeu_em_ms', { latencyMs: health.latencyMs })
                    : health.error
                      ? t('healthDialog.options_sem_resposta_erro', { error: health.error })
                      : t('healthDialog.options_sem_resposta')
        })
    } else {
        list.push({ ok: null, text: t('healthDialog.registre_a_conta_para_medir', { link }) })
    }

    let micOk = false
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
        micOk = true
    } catch {
        micOk = false
    }
    list.push({
        ok: micOk,
        text: micOk ? t('healthDialog.microfone_liberado') : t('healthDialog.microfone_indisponivel'),
        hint: micOk ? undefined : t('healthDialog.conecte_um_microfone_e_permita')
    })

    const devices = await navigator.mediaDevices.enumerateDevices()
    const outputs = devices.filter((d) => d.kind === 'audiooutput').length
    list.push({ ok: outputs > 0, text: t('healthDialog.saidas_de_audio_encontradas', { outputs }) })

    if (!a.simulated) {
        const hasTurn = /turns?:/i.test(a.iceServers)
        list.push({
            ok: hasTurn ? true : null,
            text: hasTurn ? t('healthDialog.servidor_turn_configurado') : t('healthDialog.sem_servidor_turn'),
            hint: hasTurn ? undefined : t('healthDialog.atras_de_nat_simetrico_a')
        })
        list.push({
            ok: a.wssUrl.startsWith('wss://'),
            text: a.wssUrl.startsWith('wss://')
                ? t('healthDialog.transporte_seguro_wss')
                : t('healthDialog.transporte_sem_tls_ws'),
            hint: a.wssUrl.startsWith('wss://') ? undefined : t('healthDialog.muitos_pbx_exigem_wss_para')
        })
    }

    checks.value = list
    checkedAt.value = new Date().toLocaleTimeString('pt-BR')
    running.value = false
}

async function copyReport(): Promise<void> {
    const text = [
        t('healthDialog.saude_de_as', {
            name: account.value?.name,
            extension: account.value?.extension,
            domain: account.value?.domain,
            p: checkedAt.value
        }),
        ...checks.value.map(
            (c) => `${c.ok === true ? '✓' : c.ok === false ? '✗' : '!'} ${c.text}${c.hint ? ` (${c.hint})` : ''}`
        )
    ].join('\n')
    await navigator.clipboard.writeText(text).catch(() => undefined)
}

onMounted(run)
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" aria-labelledby="health-title" tabindex="-1">
            <header>
                <h2 id="health-title">{{ $t('healthDialog.saude', { name: account?.name }) }}</h2>
                <span class="label">{{ checkedAt }}</span>
                <button class="btn small ghost" :aria-label="$t('healthDialog.fechar')" @click="emit('close')">
                    ✕
                </button>
            </header>
            <div class="body">
                <p v-if="running && checks.length === 0" class="muted">{{ $t('healthDialog.verificando') }}</p>
                <ul class="checks">
                    <li v-for="(c, i) in checks" :key="i">
                        <span class="mark" :class="c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'warn'">
                            {{ c.ok === true ? '✓' : c.ok === false ? '✗' : '!' }}
                        </span>
                        <div>
                            <div>{{ c.text }}</div>
                            <div v-if="c.hint" class="hint">{{ c.hint }}</div>
                        </div>
                    </li>
                </ul>
            </div>
            <footer>
                <button class="btn" @click="copyReport">{{ $t('healthDialog.copiar_relatorio') }}</button>
                <button class="btn primary" :disabled="running" @click="run">
                    {{ $t('healthDialog.verificar_de_novo') }}
                </button>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.checks li {
    display: flex;
    gap: 10px;
}
.mark {
    width: 18px;
    font-family: var(--mono);
    text-align: center;
}
.mark.ok {
    color: var(--ok);
}
.mark.bad {
    color: var(--bad);
}
.mark.warn {
    color: var(--warn);
}
.hint,
.muted {
    color: var(--muted);
    font-size: 12px;
}
</style>
