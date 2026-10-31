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
import { useLogStore } from '@renderer/stores/log'
import { useDebugStore } from '@renderer/stores/debug'
import { buildDialogs, dialogFailed, dialogPeer, type Dialog } from '@renderer/lib/ladder'

/**
 * Sem chamadas, a coluna mostra o que se sabe da conta atual: registro, conexão, mídia e a atividade
 * recente tirada do SIP já guardado. Só o que o motor dá; o que não existe fica de fora.
 */
const emit = defineEmits<{ contacts: [accountId: string] }>()
const accounts = useAccountsStore()
const log = useLogStore()
const debug = useDebugStore()
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

/** Codecs na ordem da oferta (SIP puro); nos outros motores, uma frase. */
const codecs = computed<{ list: string[]; text: string }>(() => {
    if (kind.value === 'simulated') return { list: [], text: t('accountDetails.codecs_simulado') }
    if (kind.value === 'ws') return { list: [], text: t('accountDetails.codecs_ws') }
    return { list: offerOrder(codecPrefs.value).map((c) => CODEC_NAMES[c]), text: '' }
})

const dtmf = computed(() => {
    const mode = account.value?.dtmfMode
    return mode === 'sip-info'
        ? t('accountDetails.dtmf_info')
        : mode === 'rtp-event'
          ? t('accountDetails.dtmf_rtp')
          : t('accountDetails.dtmf_auto')
})

/** Último OPTIONS: o número em destaque e a hora (ou o motivo) embaixo. */
const options = computed<{ big: string; small: string; bad?: boolean }>(() => {
    const h = health.value
    if (status.value?.state !== 'registered') return { big: '—', small: t('accountDetails.options_registre') }
    if (!h) return { big: '—', small: t('accountDetails.options_nunca') }
    if (h.latencyMs !== undefined)
        return {
            big: t('accountDetails.ms', { ms: h.latencyMs }),
            small: t('accountDetails.as', { at: new Date(h.checkedAt).toLocaleTimeString() })
        }
    return { big: '—', small: t('accountDetails.options_erro', { error: h.error ?? '?' }), bad: true }
})

type Fact = { key: string; value: string; mono?: boolean; extra?: string }

/** Grupos da grade; cada linha só entra quando o motor tem o dado. */
const groups = computed(() => {
    const a = account.value
    if (!a) return []
    const h = health.value
    const connection: Fact[] = [
        {
            key: t('accountDetails.servidor'),
            value: server.value,
            mono: kind.value !== 'simulated',
            extra: h?.server ? t('accountDetails.ip', { ip: h.server }) : undefined
        },
        { key: t('accountDetails.transporte'), value: transport.value },
        { key: t('accountDetails.usuario'), value: `${a.authUsername || a.extension}@${a.domain}`, mono: true }
    ]
    if (kind.value === 'ws')
        connection.push({ key: t('accountDetails.ip_local'), value: t('accountDetails.ip_local_ws') })
    else if (h?.local) connection.push({ key: t('accountDetails.ip_local'), value: h.local, mono: true })
    return [
        { id: 'connection', title: t('accountDetails.conexao'), facts: connection },
        { id: 'media', title: t('accountDetails.midia'), facts: [{ key: t('accountDetails.dtmf'), value: dtmf.value }] }
    ]
})

// ─── Atividade recente ─────────────────────────────────────────────────
/** Quantos diálogos a lista mostra: os mais novos primeiro. */
const ACTIVITY_LIMIT = 40

const activity = computed<Dialog[]>(() => {
    const id = account.value?.id
    if (!id) return []
    const sip = log.entries.filter((e) => e.kind === 'sip' && e.accountId === id)
    return buildDialogs(sip).slice(-ACTIVITY_LIMIT).reverse()
})

const clock = (ts: number): string => new Date(ts).toLocaleTimeString('pt-BR')

/** Resultado do diálogo: a resposta final, ou "sem resposta". */
function result(d: Dialog): string {
    return d.final ? `${d.final.status} ${d.final.reason}`.trim() : t('accountDetails.sem_resposta')
}

/** Tempo do diálogo: num pedido rápido é a demora da resposta; numa chamada, quanto durou. */
function took(d: Dialog): string {
    const ms = d.end - d.start
    if (d.messages.length < 2) return ''
    return ms < 1000 ? t('accountDetails.ms', { ms }) : duration(0, ms)
}

function tone(d: Dialog): 'ok' | 'bad' | 'pending' {
    if (!d.final) return 'pending'
    return dialogFailed(d) ? 'bad' : d.final.status >= 300 ? 'pending' : 'ok'
}

function openInDrawer(d: Dialog): void {
    if (!account.value) return
    debug.show('sip', account.value.id, d.messages[0]?.entryId)
}
</script>

<template>
    <section
        v-if="account"
        class="details"
        :style="{ '--account': account.color }"
        :aria-label="$t('accountDetails.detalhes', { name: account.name })"
    >
        <header class="head">
            <span class="badge" aria-hidden="true">{{ account.extension.slice(-4) }}</span>
            <div class="title">
                <h3>{{ account.name }}</h3>
                <p class="idle">{{ $t('accountDetails.sem_chamadas') }}</p>
            </div>
            <div class="actions">
                <button
                    type="button"
                    class="btn small"
                    :class="{ primary: stateCls !== 'registered' }"
                    @click="accounts.register(account.id)"
                >
                    <Icon name="refresh" class="ico" />{{
                        stateCls === 'registered'
                            ? $t('accountDetails.registrar_de_novo')
                            : $t('accountDetails.registrar')
                    }}
                </button>
                <button
                    type="button"
                    class="btn small"
                    :disabled="measuring || stateCls !== 'registered'"
                    @click="measure(true)"
                >
                    {{ measuring ? $t('accountDetails.medindo') : $t('accountDetails.medir') }}
                </button>
                <button type="button" class="btn small" @click="debug.show('sip', account.id)">
                    <Icon name="flow" class="ico" />{{ $t('accountDetails.ver_sip') }}
                </button>
                <button type="button" class="btn small ghost" @click="emit('contacts', account.id)">
                    <Icon name="user-plus" class="ico" />{{ $t('accountDetails.contatos') }}
                </button>
            </div>
        </header>

        <div class="grid">
            <section class="cell reg" :class="stateCls">
                <h4>{{ $t('accountDetails.registro') }}</h4>
                <p class="big state">
                    <span class="dot" :class="stateCls" aria-hidden="true"></span>
                    {{ status ? describeStatus(status) : '' }}
                </p>
                <p v-if="retry" class="small">
                    {{
                        $t('accountDetails.tentando', {
                            attempt: retry.attempt,
                            max: retry.max ? $t('accountDetails.de_max', { max: retry.max }) : ''
                        })
                    }}
                </p>
                <p v-if="renewal" class="small mono tabular">{{ renewal }}</p>
            </section>
            <section class="cell">
                <h4>{{ $t('accountDetails.options') }}</h4>
                <p class="big mono tabular" :class="{ bad: options.bad }">{{ options.big }}</p>
                <p class="small" :class="{ bad: options.bad }">{{ options.small }}</p>
            </section>
            <section v-for="g in groups" :key="g.id" class="cell wide">
                <h4>{{ g.title }}</h4>
                <dl class="kv">
                    <template v-for="f in g.facts" :key="f.key">
                        <dt>{{ f.key }}</dt>
                        <dd>
                            <span :class="{ mono: f.mono }">{{ f.value }}</span>
                            <span v-if="f.extra" class="extra mono">{{ f.extra }}</span>
                        </dd>
                    </template>
                    <template v-if="g.id === 'media'">
                        <dt>{{ $t('accountDetails.codecs') }}</dt>
                        <dd>
                            <span v-for="(c, i) in codecs.list" :key="c" class="codec" :class="{ first: i === 0 }">{{
                                c
                            }}</span>
                            <span v-if="codecs.text">{{ codecs.text }}</span>
                        </dd>
                    </template>
                </dl>
            </section>
        </div>

        <section class="activity">
            <header class="act-head">
                <h4>{{ $t('accountDetails.atividade') }}</h4>
                <span class="small">{{ $t('accountDetails.atividade_dica') }}</span>
            </header>
            <p v-if="activity.length === 0" class="small none">{{ $t('accountDetails.atividade_vazia') }}</p>
            <ol v-else class="feed">
                <li v-for="d in activity" :key="d.key">
                    <button type="button" class="item" :class="tone(d)" @click="openInDrawer(d)">
                        <span class="when mono tabular">{{ clock(d.start) }}</span>
                        <span class="method mono"
                            ><span aria-hidden="true">{{ d.direction === 'in' ? '←' : '→' }}</span
                            ><span class="sr-only">{{
                                d.direction === 'in' ? $t('accountDetails.recebida') : $t('accountDetails.enviada')
                            }}</span>
                            {{ d.method }}</span
                        >
                        <span class="peer">{{ dialogPeer(d) }}</span>
                        <span class="res mono">{{ result(d) }}</span>
                        <span class="took mono tabular">{{ took(d) }}</span>
                    </button>
                </li>
            </ol>
        </section>
    </section>
    <p v-else class="empty alone">{{ $t('accountDetails.sem_conta') }}</p>
</template>

<style scoped>
.details {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px 0;
}
.head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
/* O ramal num quadrado na cor da conta, como o avatar da barra. */
.badge {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--account, var(--accent)) 22%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--account, var(--accent)) 45%, var(--panel));
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    flex: none;
}
.title {
    flex: 1 1 200px;
    min-width: 0;
}
h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.01em;
}
.idle {
    margin: 1px 0 0;
    font-size: 12px;
    color: var(--muted);
}
.actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.ico {
    width: 13px;
    height: 13px;
    margin-right: 5px;
}

/* Grade que se ajusta à largura: dois números em destaque e os grupos de fatos. */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    flex: none;
}
.cell {
    background: var(--panel);
    padding: 9px 12px 10px;
    min-width: 0;
}
.cell.wide {
    grid-column: span 2;
}
.cell.reg.registered {
    box-shadow: inset 3px 0 0 var(--ok);
}
.cell.reg.error {
    box-shadow: inset 3px 0 0 var(--bad);
}
h4 {
    margin: 0 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--muted);
}
.big {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
}
.big.state {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 15px;
}
.reg.registered .big {
    color: var(--ok-text);
}
.reg.error .big,
.bad {
    color: var(--bad-text);
}
.small {
    margin: 2px 0 0;
    font-size: 11.5px;
    color: var(--muted);
}
.kv {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 3px 12px;
    margin: 0;
    font-size: 12px;
}
.kv dt {
    color: var(--muted);
}
.kv dd {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    min-width: 0;
    overflow-wrap: anywhere;
}
.extra {
    color: var(--muted);
}
.codec {
    padding: 0 6px;
    border-radius: 4px;
    background: var(--raise);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 17px;
}
.codec.first {
    background: color-mix(in srgb, var(--accent) 14%, var(--panel));
    color: var(--accent-text);
    font-weight: 600;
}

/* Atividade recente: ocupa a altura que sobra e rola sozinha. */
.activity {
    flex: 1;
    min-height: 140px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line);
    margin: 0 -14px;
}
.act-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 9px 14px 5px;
}
.act-head h4 {
    margin: 0;
}
.act-head .small {
    margin: 0;
}
.none {
    padding: 0 14px;
}
.feed {
    list-style: none;
    margin: 0;
    padding: 0 0 8px;
    overflow: auto;
    flex: 1;
    min-height: 0;
}
.item {
    display: grid;
    grid-template-columns: 64px 104px minmax(0, 120px) minmax(0, 1fr) 64px;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 4px 14px;
    border: 0;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}
.item:hover {
    background: var(--panel-2);
}
.item:focus-visible {
    outline-offset: -2px;
}
.when {
    color: var(--muted);
    font-size: 11px;
}
.method {
    font-weight: 600;
    font-size: 11.5px;
}
.peer {
    color: var(--muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.res {
    font-size: 11.5px;
    white-space: nowrap;
}
.item.ok .res {
    color: var(--ok-text);
}
.item.bad .res {
    color: var(--bad-text);
}
.item.pending .res {
    color: var(--muted);
}
.took {
    color: var(--muted);
    font-size: 11px;
    text-align: right;
}
.empty.alone {
    padding: 12px 14px;
    margin: 0;
    font-size: 12px;
    color: var(--muted);
}
@media (max-width: 1000px) {
    .cell.wide {
        grid-column: auto;
    }
}
</style>
