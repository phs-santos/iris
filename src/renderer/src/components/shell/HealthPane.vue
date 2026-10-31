<script setup lang="ts">
import { isSimulated } from '@shared/servers'
import { t } from '@renderer/i18n'
import { computed, ref, watch } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { describeStatus } from '@renderer/lib/accounts'
import { isNativeAccount } from '@renderer/sip'
import type { Account } from '@shared/types'
import { firstStunServer } from '@shared/net-diag'
import { parseSipServer, type SipTransportKind } from '@shared/sip-target'

// Aba Saúde da gaveta de depuração: a conta (RF-24), este computador (RF-25) e a rede (RF-46).

type Group = 'account' | 'computer' | 'network'
type Check = { ok: boolean | null; text: string; hint?: string; group: Group }

const props = defineProps<{ accountId: string | null }>()
const accounts = useAccountsStore()
const account = computed(() => accounts.byId(props.accountId))
const checks = ref<Check[]>([])
const running = ref(false)
const checkedAt = ref('')
const note = ref('')
const groups = computed(() =>
    (
        [
            ['account', t('healthPane.conta')],
            ['computer', t('healthPane.ambiente')],
            ['network', t('healthPane.rede')]
        ] as const
    )
        .map(([id, title]) => ({ id, title, checks: checks.value.filter((c) => c.group === id) }))
        .filter((g) => g.checks.length)
)

/** Rede (RF-46): o que o DNS diz do domínio, o certificado do PBX e o endereço visto de fora. */
async function network(a: Account, all: Check[]): Promise<void> {
    const list = { push: (c: Omit<Check, 'group'>) => all.push({ ...c, group: 'network' }) }
    const native = isNativeAccount(a)
    const target = native ? parseSipServer(a.sipServer, a.domain, a.transport as SipTransportKind) : null
    let tls: { host: string; port: number } | undefined
    if (native && a.transport === 'tls' && target) tls = target
    else if (!native && a.wssUrl.startsWith('wss://')) {
        try {
            const url = new URL(a.wssUrl)
            tls = { host: url.hostname, port: Number(url.port) || 443 }
        } catch {
            // endereço inválido: a verificação do transporte já avisa
        }
    }
    const stun = firstStunServer(a.iceServers)
    const result = await window.iris.net.diagnose({ domain: a.domain.trim(), tls, stun }).catch(() => null)
    if (!result) return

    if (result.srvError) list.push({ ok: null, text: t('healthPane.srv_erro', { error: result.srvError }) })
    else if (result.srv?.length)
        list.push({
            ok: true,
            text: t('healthPane.srv_encontrados', { domain: a.domain }),
            hint: result.srv.map((r) => `${r.service} → ${r.target}:${r.port} (${r.priority}/${r.weight})`).join(' · ')
        })
    else if (result.srv) list.push({ ok: null, text: t('healthPane.srv_nenhum', { domain: a.domain }) })

    if (result.tlsError) list.push({ ok: false, text: t('healthPane.tls_erro', { error: result.tlsError }) })
    else if (result.tls) {
        const c = result.tls
        const until = new Date(c.validTo)
        list.push({
            // Certificado não confiável é aviso, não erro: o usuário pode ter aceitado o host (RF-37).
            ok: c.trusted ? true : null,
            text: c.trusted
                ? t('healthPane.tls_confiavel', { subject: c.subject })
                : t('healthPane.tls_nao_confiavel', { subject: c.subject, problem: c.problem ?? '' }),
            hint: t('healthPane.tls_detalhes', {
                issuer: c.issuer,
                until: Number.isNaN(until.getTime()) ? c.validTo : until.toLocaleDateString(),
                names: c.names.join(', ') || '—'
            })
        })
    }

    if (result.stunError) list.push({ ok: false, text: t('healthPane.stun_erro', { error: result.stunError }) })
    else if (result.stun)
        list.push({
            ok: true,
            text: t('healthPane.stun_endereco', { address: result.stun.address, port: result.stun.port })
        })
    else if (native) list.push({ ok: null, text: t('healthPane.stun_sem_servidor') })
}

/** Cada medida tem um número: só a última apaga o "Verificando…". */
let runs = 0

/** Verificações de ambiente e da conta (RF-24 e RF-25). */
async function run(): Promise<void> {
    const a = account.value
    if (!a) return
    const token = ++runs
    running.value = true
    // Com try/finally, um erro no meio (microfone, rede) não deixa a aba presa em "Verificando…".
    try {
        const all: Check[] = []
        const list = { push: (c: Omit<Check, 'group'>) => all.push({ ...c, group: 'account' }) }
        const computer = { push: (c: Omit<Check, 'group'>) => all.push({ ...c, group: 'computer' }) }
        const net = { push: (c: Omit<Check, 'group'>) => all.push({ ...c, group: 'network' }) }

        const status = accounts.statusOf(a.id)
        list.push({
            ok: status.state === 'registered',
            text: t('healthPane.registro', { p: describeStatus(status) }),
            hint: status.state === 'error' && status.code === 401 ? t('healthPane.confira_a_senha_e_o') : undefined
        })

        // SIP puro (RF-39) não usa WebSocket: mostra o transporte da conta.
        const link = isNativeAccount(a)
            ? t('healthPane.transporte', { p: a.transport?.toUpperCase() })
            : t('healthPane.websocket')
        const health = await accounts.checkHealth(a.id)
        if (health) {
            list.push({
                ok: health.websocketConnected,
                text: `${link} ${health.websocketConnected ? t('healthPane.conectado') : t('healthPane.desconectado')}`
            })
            list.push({
                ok: health.latencyMs !== undefined,
                text:
                    health.latencyMs !== undefined
                        ? t('healthPane.options_respondeu_em_ms', { latencyMs: health.latencyMs })
                        : health.error
                          ? t('healthPane.options_sem_resposta_erro', { error: health.error })
                          : t('healthPane.options_sem_resposta')
            })
        } else {
            list.push({ ok: null, text: t('healthPane.registre_a_conta_para_medir', { link }) })
        }

        let micOk = false
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((t) => t.stop())
            micOk = true
        } catch {
            micOk = false
        }
        computer.push({
            ok: micOk,
            text: micOk ? t('healthPane.microfone_liberado') : t('healthPane.microfone_indisponivel'),
            hint: micOk ? undefined : t('healthPane.conecte_um_microfone_e_permita')
        })

        const devices = await navigator.mediaDevices.enumerateDevices()
        const outputs = devices.filter((d) => d.kind === 'audiooutput').length
        computer.push({ ok: outputs > 0, text: t('healthPane.saidas_de_audio_encontradas', { outputs }) })

        if (!isSimulated(a)) await network(a, all)

        if (!isSimulated(a) && !isNativeAccount(a)) {
            const hasTurn = /turns?:/i.test(a.iceServers)
            net.push({
                ok: hasTurn ? true : null,
                text: hasTurn ? t('healthPane.servidor_turn_configurado') : t('healthPane.sem_servidor_turn'),
                hint: hasTurn ? undefined : t('healthPane.atras_de_nat_simetrico_a')
            })
            net.push({
                ok: a.wssUrl.startsWith('wss://'),
                text: a.wssUrl.startsWith('wss://')
                    ? t('healthPane.transporte_seguro_wss')
                    : t('healthPane.transporte_sem_tls_ws'),
                hint: a.wssUrl.startsWith('wss://') ? undefined : t('healthPane.muitos_pbx_exigem_wss_para')
            })
        }

        // A conta pode ter mudado enquanto media: o resultado de outra conta não aparece.
        if (account.value?.id !== a.id) return
        checks.value = all
        checkedAt.value = new Date().toLocaleTimeString('pt-BR')
    } finally {
        if (token === runs) running.value = false
    }
}

async function copyReport(): Promise<void> {
    const text = [
        t('healthPane.saude_de_as', {
            name: account.value?.name,
            extension: account.value?.extension,
            domain: account.value?.domain,
            p: checkedAt.value
        }),
        ...checks.value.map(
            (c) => `${c.ok === true ? '✓' : c.ok === false ? '✗' : '!'} ${c.text}${c.hint ? ` (${c.hint})` : ''}`
        )
    ].join('\n')
    await navigator.clipboard
        .writeText(text)
        .then(() => (note.value = t('healthPane.relatorio_copiado')))
        .catch(() => undefined)
    setTimeout(() => (note.value = ''), 2500)
}

// Mede ao abrir a aba e a cada troca de conta.
watch(
    () => props.accountId,
    () => {
        checks.value = []
        checkedAt.value = ''
        void run()
    },
    { immediate: true }
)
</script>

<template>
    <div class="health">
        <p v-if="!account" class="muted empty">{{ $t('healthPane.sem_conta') }}</p>
        <template v-else>
            <header class="head">
                <h3>{{ $t('healthPane.titulo', { name: account.name }) }}</h3>
                <span class="when">{{
                    running ? $t('healthPane.verificando') : $t('healthPane.verificado_as', { p: checkedAt })
                }}</span>
            </header>
            <div class="body" tabindex="0" role="region" :aria-label="$t('healthPane.titulo', { name: account.name })">
                <section v-for="g in groups" :key="g.id" class="group">
                    <h4>{{ g.title }}</h4>
                    <ul>
                        <li
                            v-for="(c, i) in g.checks"
                            :key="i"
                            :class="c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'warn'"
                        >
                            <span class="mark" aria-hidden="true">{{
                                c.ok === true ? '✓' : c.ok === false ? '✗' : '!'
                            }}</span>
                            <div class="txt">
                                <div>{{ c.text }}</div>
                                <div v-if="c.hint" class="hint">{{ c.hint }}</div>
                            </div>
                        </li>
                    </ul>
                </section>
            </div>
            <div class="foot">
                <button type="button" class="btn small" @click="copyReport">
                    {{ $t('healthPane.copiar_relatorio') }}
                </button>
                <span class="note" role="status">{{ note }}</span>
                <button type="button" class="btn small primary" :disabled="running" @click="run">
                    {{ $t('healthPane.verificar_de_novo') }}
                </button>
            </div>
        </template>
    </div>
</template>

<style scoped>
.health {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 10px 6px;
}
.head h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.when {
    flex: none;
    font-size: 11px;
    color: var(--muted);
}
.body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-top: 1px solid var(--line);
    background: var(--bg);
}
.body:focus-visible {
    outline-offset: -2px;
}
.group h4 {
    margin: 0;
    padding: 8px 10px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
}
.group ul {
    list-style: none;
    margin: 0;
    padding: 0;
}
.group li {
    display: flex;
    gap: 8px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.4;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
}
.group li:first-child {
    border-top: 1px solid var(--line);
}
.mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    border-radius: 50%;
    font-size: 10px;
    font-weight: 700;
    color: var(--panel);
}
li.ok .mark {
    background: var(--ok);
}
li.bad .mark {
    background: var(--bad);
}
li.warn .mark {
    background: var(--warn);
}
li.bad .txt > div:first-child {
    color: var(--bad-text);
}
.txt {
    min-width: 0;
    overflow-wrap: break-word;
}
.hint {
    color: var(--muted);
    font-size: 11.5px;
}
.muted {
    color: var(--muted);
    font-size: 12px;
}
.empty {
    margin: 0;
    padding: 12px 10px;
}
.foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-top: 1px solid var(--line);
}
.note {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
}
</style>
