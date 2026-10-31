<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@renderer/i18n'
import { useAccountsStore } from '@renderer/stores/accounts'
import { describeStatus } from '@renderer/lib/accounts'
import { duration, now } from '@renderer/lib/now'
import { isNativeAccount } from '@renderer/sip'
import { isSimulated } from '@shared/servers'
import { offerOrder, type AudioCodecName, type CodecPrefs } from '@shared/codecs'
import { parseSipServer, type SipTransportKind } from '@shared/sip-target'
import { isFresh, renewalState } from '@shared/registration'
import Icon from '../icons/Icon.vue'

/** Sem chamadas, a coluna mostra o que se sabe da conta atual: registro, endereços, codecs e o OPTIONS. */
const accounts = useAccountsStore()
const account = computed(() => accounts.current)
const status = computed(() => (account.value ? accounts.statusOf(account.value.id) : null))
const health = computed(() => (account.value ? accounts.runtime[account.value.id]?.health : undefined))
const retry = computed(() => (account.value ? accounts.retryOf(account.value.id) : undefined))
const codecPrefs = ref<CodecPrefs | undefined>()
/** Conta que está sendo medida: a resposta atrasada de outra conta não mexe no botão desta. */
const measuringId = ref<string | null>(null)
const measuring = computed(() => Boolean(account.value) && measuringId.value === account.value?.id)

// Nomes técnicos dos codecs, iguais em qualquer idioma.
const CODEC_NAMES: Record<AudioCodecName, string> = {
    G722: 'G.722',
    PCMA: 'PCMA',
    PCMU: 'PCMU',
    opus: 'Opus' // i18n-ok
}

/**
 * Mede de novo (OPTIONS) e relê a ordem dos codecs, que muda em Ajustes → Áudio. Sem `force`, uma medida
 * da conta feita há menos de 10 s é reaproveitada: trocar de conta não manda outro OPTIONS.
 */
async function measure(force = false): Promise<void> {
    const a = account.value
    if (!a) return
    measuringId.value = a.id
    try {
        codecPrefs.value = (await window.iris.settings.load()).codecs
        const last = accounts.runtime[a.id]?.health?.checkedAt
        if (accounts.statusOf(a.id).state === 'registered' && (force || !isFresh(last, Date.now())))
            await accounts.checkHealth(a.id)
    } catch {
        // sem resposta: a linha do OPTIONS mostra o que havia
    } finally {
        if (measuringId.value === a.id) measuringId.value = null
    }
}

// Mede ao mostrar e ao trocar de conta; quando a mesma conta acaba de registrar, mede mesmo com medida recente.
watch(
    () => [account.value?.id, status.value?.state === 'registered'] as const,
    (next, before) => void measure(Boolean(before && before[0] === next[0] && next[1])),
    { immediate: true }
)

/** Hora de renovação já usada para medir de novo: uma vez por ciclo. */
let remeasuredFor: number | undefined
const renewing = computed(() =>
    status.value?.state === 'registered' ? renewalState(health.value?.renewsAt, now.value) : null
)
// Passada a renovação, a hora guardada vence: mede de novo para saber a próxima (o motor já renovou).
watch(
    () => renewing.value?.due,
    (due) => {
        const at = health.value?.renewsAt
        if (!due || at === undefined || remeasuredFor === at) return
        remeasuredFor = at
        void measure(true)
    }
)

const kind = computed(() => {
    const a = account.value
    if (!a) return null
    return isSimulated(a) ? 'simulated' : isNativeAccount(a) ? 'native' : 'ws'
})

const stateCls = computed(() => status.value?.state ?? 'disconnected')

const renewal = computed(() => {
    const r = renewing.value
    if (!r) return ''
    const parts = [
        r.leftMs > 0 ? t('accountDetails.renova_em', { t: duration(0, r.leftMs) }) : t('accountDetails.renovando')
    ]
    if (health.value?.expiresS) parts.push(t('accountDetails.vale_s', { s: health.value.expiresS }))
    return parts.join(' · ')
})

const server = computed(() => {
    const a = account.value
    if (!a) return ''
    if (kind.value === 'simulated') return t('accountDetails.simulado')
    if (kind.value === 'ws') return a.wssUrl
    const target = parseSipServer(a.sipServer, a.domain, a.transport as SipTransportKind)
    return target ? `${target.host}:${target.port}` : a.sipServer || a.domain
})

const transport = computed(() => {
    const a = account.value
    if (!a) return ''
    if (kind.value === 'simulated') return t('accountDetails.transporte_simulado')
    const name = kind.value === 'ws' ? t('accountDetails.transporte_ws') : a.transport.toUpperCase()
    return a.srtp && kind.value === 'native' ? `${name} · ${t('accountDetails.srtp')}` : name
})

const codecs = computed(() => {
    if (kind.value === 'simulated') return t('accountDetails.codecs_simulado')
    if (kind.value === 'ws') return t('accountDetails.codecs_ws')
    return offerOrder(codecPrefs.value)
        .map((c) => CODEC_NAMES[c])
        .join(', ')
})

const dtmf = computed(() => {
    const mode = account.value?.dtmfMode
    return mode === 'sip-info'
        ? t('accountDetails.dtmf_info')
        : mode === 'rtp-event'
          ? t('accountDetails.dtmf_rtp')
          : t('accountDetails.dtmf_auto')
})

const options = computed(() => {
    const h = health.value
    if (status.value?.state !== 'registered') return t('accountDetails.options_registre')
    if (!h) return t('accountDetails.options_nunca')
    if (h.latencyMs !== undefined)
        return t('accountDetails.options_ms', { ms: h.latencyMs, at: new Date(h.checkedAt).toLocaleTimeString() })
    return t('accountDetails.options_erro', { error: h.error ?? '?' })
})

const none = (): string => t('accountDetails.nao_disponivel')

const rows = computed(() => {
    const a = account.value
    if (!a) return []
    const h = health.value
    return [
        {
            key: t('accountDetails.servidor'),
            value: server.value,
            mono: kind.value !== 'simulated',
            extra: h?.server ? t('accountDetails.ip', { ip: h.server }) : ''
        },
        { key: t('accountDetails.transporte'), value: transport.value },
        { key: t('accountDetails.usuario'), value: `${a.authUsername || a.extension}@${a.domain}`, mono: true },
        {
            key: t('accountDetails.ip_local'),
            value: kind.value === 'ws' ? t('accountDetails.ip_local_ws') : (h?.local ?? none()),
            mono: kind.value !== 'ws'
        },
        { key: t('accountDetails.codecs'), value: codecs.value },
        { key: t('accountDetails.dtmf'), value: dtmf.value },
        { key: t('accountDetails.options'), value: options.value, bad: h?.latencyMs === undefined && !!h?.error }
    ]
})
</script>

<template>
    <section v-if="account" class="details" :style="{ '--account': account.color }">
        <header class="head">
            <span class="badge" aria-hidden="true">{{ account.extension.slice(-4) }}</span>
            <div class="title">
                <h3>{{ $t('accountDetails.detalhes', { name: account.name }) }}</h3>
                <span class="state" :class="stateCls">
                    <span class="dot" :class="stateCls" aria-hidden="true"></span>
                    {{ status ? describeStatus(status) : '' }}
                    <template v-if="retry">
                        ·
                        {{
                            $t('accountDetails.tentando', {
                                attempt: retry.attempt,
                                max: retry.max ? $t('accountDetails.de_max', { max: retry.max }) : ''
                            })
                        }}
                    </template>
                    <span v-if="renewal" class="renew mono tabular">· {{ renewal }}</span>
                </span>
            </div>
            <button
                v-if="stateCls === 'disconnected' || stateCls === 'error'"
                class="btn small primary"
                @click="accounts.register(account.id)"
            >
                {{ $t('accountDetails.registrar') }}
            </button>
            <button v-else class="btn small" :disabled="measuring" @click="measure(true)">
                <Icon name="refresh" class="ico" />{{
                    measuring ? $t('accountDetails.medindo') : $t('accountDetails.medir')
                }}
            </button>
        </header>
        <dl class="kv">
            <template v-for="row in rows" :key="row.key">
                <dt>{{ row.key }}</dt>
                <dd :class="{ bad: row.bad }">
                    <span :class="{ mono: row.mono }">{{ row.value }}</span>
                    <span v-if="row.extra" class="extra mono">{{ row.extra }}</span>
                </dd>
            </template>
        </dl>
        <p class="empty">{{ $t('accountDetails.sem_chamadas') }}</p>
    </section>
    <p v-else class="empty alone">{{ $t('accountDetails.sem_conta') }}</p>
</template>

<style scoped>
.details {
    padding: 12px 14px;
    max-width: 680px;
}
.head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}
/* O ramal num quadrado na cor da conta, como o avatar da barra. */
.badge {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--account, var(--accent)) 22%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--account, var(--accent)) 45%, var(--panel));
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    flex: none;
}
.title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}
h3 {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
}
.state {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--muted);
}
.state.registered {
    color: var(--ok-text);
}
.state.error {
    color: var(--bad-text);
}
.renew {
    color: var(--muted);
    font-size: 11.5px;
}
.ico {
    width: 13px;
    height: 13px;
}
/* Pares chave/valor em duas colunas, com linhas finas: denso, sem cartões. */
.kv {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    margin: 0;
    border-top: 1px solid var(--line);
}
.kv dt,
.kv dd {
    margin: 0;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
    min-width: 0;
}
.kv dt {
    color: var(--muted);
    font-size: 12px;
}
.kv dd {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    font-size: 12px;
    overflow-wrap: anywhere;
}
.kv dd.bad {
    color: var(--bad-text);
}
.extra {
    color: var(--muted);
}
.empty {
    margin: 12px 0 0;
    font-size: 12px;
    color: var(--muted);
}
.empty.alone {
    padding: 12px 14px;
    margin: 0;
}
</style>
