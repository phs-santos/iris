<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, ref, watch } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import { describeStatus } from '@renderer/lib/accounts'
import { duration, now } from '@renderer/lib/now'
import PhoneIcon from './PhoneIcon.vue'
import { usePreferencesStore } from '@renderer/stores/preferences'

/** Modo Telefone: uma conta por vez, teclado grande e a chamada ocupando a tela. Usa as mesmas stores da Bancada. */
const emit = defineEmits<{ bench: []; settings: [] }>()
const accounts = useAccountsStore()
const calls = useCallsStore()
const prefs = usePreferencesStore()

const number = ref('')
const error = ref('')
const input = ref<HTMLInputElement | null>(null)
/** "Outra chamada": volta ao teclado sem desligar a chamada em andamento. */
const dialingAnother = ref(false)
const panel = ref<'none' | 'dtmf' | 'transfer'>('none')
const transferTo = ref('')

const account = computed(() => accounts.selected)
const status = computed(() => (account.value ? accounts.statusOf(account.value.id) : null))
const registered = computed(() => status.value?.state === 'registered')

const keys = [
    ['1', ''],
    ['2', 'ABC'],
    ['3', 'DEF'],
    ['4', 'GHI'],
    ['5', 'JKL'],
    ['6', 'MNO'],
    ['7', 'PQRS'],
    ['8', 'TUV'],
    ['9', 'WXYZ'],
    ['*', ''],
    ['0', '+'],
    ['#', '']
]

/** Nomes conhecidos: as outras contas e os números salvos da conta escolhida. */
const known = computed(() => {
    const map = new Map<string, string>()
    for (const a of accounts.accounts) if (a.domain === account.value?.domain) map.set(a.extension, a.name)
    for (const q of account.value?.quickDials ?? []) map.set(q.number, q.label)
    return map
})
const nameOf = (call: CallView): string => call.remoteName || known.value.get(call.remote) || call.remote

const ringing = computed(() => calls.ringingIncoming[0] ?? null)
/** A chamada da tela: a escolhida, se ainda estiver ativa, ou a mais recente. */
const current = computed(() => {
    const live = calls.active.filter((c) => c !== ringing.value)
    const mine = live.filter((c) => c.accountId === account.value?.id)
    return (
        mine.find((c) => c.id === calls.selectedId) ??
        mine.at(-1) ??
        live.find((c) => c.id === calls.selectedId) ??
        live.at(-1) ??
        null
    )
})
const others = computed(() => calls.active.filter((c) => c !== current.value && c !== ringing.value))
const lastEnded = computed(() => {
    const ended = calls.calls.filter((c) => c.state === 'ended')
    return ended.at(-1) ?? null
})

const screen = computed(() => {
    if (ringing.value) return 'ringing'
    if (current.value && !dialingAnother.value) return 'call'
    return 'dial'
})

watch(screen, (s) => {
    if (s !== 'call') panel.value = 'none'
})

const hint = computed(() => {
    if (!account.value) return t('phoneView.nenhuma_conta_crie_uma_na')
    if (!registered.value) return `${account.value.name}: ${describeStatus(status.value!)}`
    const typed = number.value.trim()
    if (typed) return known.value.get(typed) ?? ''
    return t('phoneView.digite_um_numero_ou_ramal')
})

async function dial(): Promise<void> {
    error.value = ''
    const target = number.value.trim()
    if (!account.value || !target) return
    try {
        const id = await calls.dial(account.value.id, target)
        if (id) calls.selectedId = id
        dialingAnother.value = false
        number.value = ''
    } catch (e) {
        error.value = (e as Error).message
    }
}

function press(key: string): void {
    number.value += key
    input.value?.focus()
}

function backspace(): void {
    number.value = number.value.slice(0, -1)
    input.value?.focus()
}

async function transfer(): Promise<void> {
    if (!current.value || !transferTo.value.trim()) return
    await calls.transfer(current.value.id, transferTo.value)
    transferTo.value = ''
    panel.value = 'none'
}

/** Mostra uma das outras chamadas: a conta dela passa a ser a escolhida no topo. */
function showCall(c: CallView): void {
    accounts.selectedId = c.accountId
    calls.selectedId = c.id
    dialingAnother.value = false
}

function stateText(c: CallView): string {
    if (c.held || c.heldByRemote) return c.held ? t('phoneView.em_espera') : t('phoneView.em_espera_pelo_outro_lado')
    if (c.state === 'established') return duration(c.establishedAt ?? c.startedAt, now.value)
    if (c.state === 'early') return t('phoneView.chamando_early_media')
    if (c.state === 'ringing') return 'chamando…'
    return 'discando…'
}

/** De 0 a 4 barras, como no celular; o detalhe fica no texto para leitores de tela. */
const bars = computed(() => {
    const q = current.value?.quality
    if (!q) return null
    const filled = q.score >= 80 ? 4 : q.score >= 60 ? 3 : q.score >= 40 ? 2 : 1
    return {
        filled,
        label: t('phoneView.qualidade_jitter_ms_perda_rtt', {
            score: q.score,
            jitterMs: q.jitterMs,
            p: q.packetLossPercent.toFixed(1),
            rttMs: q.rttMs,
            p2: q.codec || 'codec ?'
        })
    }
})

const initial = (text: string): string => (text.trim()[0] ?? '?').toUpperCase()

defineExpose({
    focus: () => input.value?.focus(),
    setNumber: (value: string) => {
        number.value = value
        input.value?.focus()
    }
})
</script>

<template>
    <div class="phone">
        <header class="bar">
            <span class="avatar small" :style="{ background: account?.color }" aria-hidden="true">
                {{ initial(account?.name ?? '?') }}
            </span>
            <div class="from">
                <select v-model="accounts.selectedId" class="from-select" :aria-label="$t('phoneView.conta')">
                    <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                        {{ a.name }} · {{ a.extension }}
                    </option>
                </select>
                <span class="from-status">
                    <span class="dot" :class="status?.state"></span>
                    {{ account ? `${account.extension}@${account.domain}` : $t('phoneView.sem_conta') }}
                </span>
            </div>
            <button class="tool" :title="$t('phoneView.bancada_contas_chamadas_e_log')" @click="emit('bench')">
                {{ $t('phoneView.bancada') }}
            </button>
            <button
                class="tool"
                :aria-label="$t('phoneView.configuracoes')"
                :title="$t('phoneView.configuracoes_ctrl_cmd')"
                @click="emit('settings')"
            >
                ⚙
            </button>
        </header>

        <!-- Chamada recebida: ocupa a tela inteira. -->
        <section
            v-if="screen === 'ringing' && ringing"
            class="stage ringing"
            :aria-label="$t('phoneView.chamada_recebida')"
        >
            <p class="to">{{ $t('phoneView.chamada_para', { p: accounts.nameOf(ringing.accountId) }) }}</p>
            <span class="avatar big pulse" aria-hidden="true">{{ initial(nameOf(ringing)) }}</span>
            <h2 class="name">{{ nameOf(ringing) }}</h2>
            <p class="sub mono">{{ ringing.remote }}</p>
            <div class="answer-row">
                <span class="labelled">
                    <button class="round stop" :aria-label="$t('phoneView.recusar')" @click="calls.reject(ringing.id)">
                        <PhoneIcon name="x" />
                    </button>
                    {{ $t('phoneView.recusar') }}
                </span>
                <span class="labelled">
                    <button class="round go" :aria-label="$t('phoneView.atender')" @click="calls.answer(ringing.id)">
                        <PhoneIcon name="phone" />
                    </button>
                    {{ $t('phoneView.atender') }}
                </span>
            </div>
        </section>

        <!-- Em chamada. -->
        <section
            v-else-if="screen === 'call' && current"
            class="stage call"
            :aria-label="$t('phoneView.chamada_em_andamento')"
        >
            <span class="avatar big" aria-hidden="true">{{ initial(nameOf(current)) }}</span>
            <h2 class="name">{{ nameOf(current) }}</h2>
            <p class="sub mono">
                {{ $t('phoneView.via', { remote: current.remote, p: accounts.nameOf(current.accountId) }) }}
            </p>
            <p class="state mono tabular" :class="{ hold: current.held || current.heldByRemote }" role="status">
                {{ stateText(current) }}
            </p>
            <span v-if="bars" class="bars" role="img" :aria-label="bars.label" :title="bars.label">
                <i v-for="n in 4" :key="n" :class="{ off: n > bars.filled }" :style="{ height: `${4 + n * 3}px` }"></i>
            </span>

            <div class="controls">
                <button
                    class="ctrl"
                    :class="{ on: current.muted }"
                    :aria-pressed="current.muted"
                    :disabled="current.state !== 'established'"
                    @click="calls.toggleMute(current.id)"
                >
                    <span><PhoneIcon name="mic" /></span
                    >{{ current.muted ? $t('phoneView.ativar_mic') : $t('phoneView.mudo') }}
                </button>
                <button
                    class="ctrl"
                    :class="{ on: current.held }"
                    :aria-pressed="current.held"
                    :disabled="current.state !== 'established'"
                    @click="calls.toggleHold(current.id)"
                >
                    <span><PhoneIcon name="pause" /></span
                    >{{ current.held ? $t('phoneView.retomar') : $t('phoneView.espera') }}
                </button>
                <button
                    class="ctrl"
                    :class="{ on: panel === 'dtmf' }"
                    :aria-pressed="panel === 'dtmf'"
                    :disabled="current.state !== 'established'"
                    @click="panel = panel === 'dtmf' ? 'none' : 'dtmf'"
                >
                    <span><PhoneIcon name="grid" /></span>{{ $t('phoneView.teclado') }}
                </button>
                <button
                    class="ctrl"
                    :class="{ on: panel === 'transfer' }"
                    :aria-pressed="panel === 'transfer'"
                    :disabled="current.state !== 'established'"
                    @click="panel = panel === 'transfer' ? 'none' : 'transfer'"
                >
                    <span><PhoneIcon name="transfer" /></span>{{ $t('phoneView.transferir') }}
                </button>
                <button class="ctrl" @click="dialingAnother = true">
                    <span><PhoneIcon name="plus" /></span>{{ $t('phoneView.outra_chamada') }}
                </button>
                <button v-if="prefs.isOn('log')" class="ctrl" @click="emit('bench')">
                    <span><PhoneIcon name="log" /></span>{{ $t('phoneView.ver_o_log') }}
                </button>
            </div>

            <div v-if="panel === 'dtmf'" class="pad compact" :aria-label="$t('phoneView.enviar_dtmf')">
                <button
                    v-for="[k] in keys"
                    :key="k"
                    class="key"
                    :aria-label="`DTMF ${k}`"
                    @click="calls.sendDtmf(current.id, k)"
                >
                    <b>{{ k }}</b>
                </button>
            </div>
            <form v-if="panel === 'transfer'" class="transfer" @submit.prevent="transfer">
                <input
                    v-model="transferTo"
                    class="input mono"
                    :placeholder="$t('phoneView.transferir_para')"
                    :aria-label="$t('phoneView.destino_da_transferencia')"
                />
                <button class="btn primary" type="submit" :disabled="!transferTo.trim()">
                    {{ $t('phoneView.transferir') }}
                </button>
            </form>

            <button class="round stop hang" :aria-label="$t('phoneView.desligar')" @click="calls.hangup(current.id)">
                <PhoneIcon name="hangup" />
            </button>
        </section>

        <!-- Teclado. -->
        <section v-else class="stage dial" :aria-label="$t('phoneView.discar')">
            <form class="display" @submit.prevent="dial">
                <input
                    ref="input"
                    v-model="number"
                    class="number mono"
                    :aria-label="$t('phoneView.numero')"
                    placeholder=" "
                    autocomplete="off"
                />
                <p class="hint" :class="{ warn: account && !registered }">{{ hint }}</p>
                <p v-if="error" class="error" role="alert">{{ error }}</p>
                <div class="pad">
                    <button
                        v-for="[k, letters] in keys"
                        :key="k"
                        type="button"
                        class="key"
                        :aria-label="k"
                        @click="press(k)"
                    >
                        <b>{{ k }}</b
                        ><small aria-hidden="true">{{ letters }}</small>
                    </button>
                </div>
                <div class="dial-row">
                    <button
                        v-if="dialingAnother"
                        type="button"
                        class="side"
                        :title="$t('phoneView.voltar_para_a_chamada')"
                        @click="dialingAnother = false"
                    >
                        {{ $t('phoneView.voltar') }}
                    </button>
                    <span v-else class="side"></span>
                    <button
                        class="round go"
                        type="submit"
                        :aria-label="$t('phoneView.ligar')"
                        :disabled="!registered || !number.trim()"
                    >
                        <PhoneIcon name="phone" />
                    </button>
                    <button
                        type="button"
                        class="side"
                        :aria-label="$t('phoneView.apagar')"
                        :disabled="!number"
                        @click="backspace"
                    >
                        <PhoneIcon name="erase" />
                    </button>
                </div>
            </form>
            <p v-if="lastEnded && !others.length" class="last mono">
                {{ $t('phoneView.ultima', { p: lastEnded.direction === 'out' ? '→' : '←', p2: nameOf(lastEnded) }) }}
                <span v-if="lastEnded.endText">· {{ lastEnded.endText }}</span>
            </p>
        </section>

        <footer v-if="others.length || (screen === 'dial' && current)" class="others">
            <span class="label">{{ $t('phoneView.tambem_em_andamento') }}</span>
            <button
                v-for="c in [...(screen === 'dial' && current ? [current] : []), ...others]"
                :key="c.id"
                class="other"
                @click="showCall(c)"
            >
                <span class="dot" :class="c.held ? 'connecting' : 'registered'"></span>
                <span class="who">{{ nameOf(c) }}</span>
                <span class="mono tabular">{{ stateText(c) }}</span>
            </button>
        </footer>
    </div>
</template>

<style scoped>
.phone {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    min-height: 0;
}
.bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
}
.from {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
}
.from-select {
    border: 0;
    background: transparent;
    font-weight: 600;
    padding: 0;
    max-width: 100%;
    cursor: pointer;
}
.from-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.tool {
    border: 1px solid var(--line);
    background: var(--panel-2);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    flex: none;
}
.tool:hover {
    background: var(--raise);
}
.avatar {
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-weight: 700;
    color: #fff;
    flex: none;
    background: var(--accent-strong);
}
.avatar.small {
    width: 30px;
    height: 30px;
    font-size: 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.avatar.big {
    width: 84px;
    height: 84px;
    font-size: 30px;
}
.stage {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 20px;
    gap: 6px;
}
.name {
    margin: 8px 0 0;
    font-size: 22px;
    font-weight: 600;
    text-align: center;
    overflow-wrap: anywhere;
}
.sub,
.to {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
}
.to {
    margin-bottom: 18px;
}
.state {
    margin: 4px 0 0;
    color: var(--ok);
    font-size: 15px;
}
.state.hold {
    color: var(--hold);
}
.bars {
    display: flex;
    gap: 3px;
    align-items: flex-end;
    height: 16px;
}
.bars i {
    width: 4px;
    border-radius: 1px;
    background: var(--ok);
}
.bars i.off {
    background: var(--line);
}
.ringing {
    justify-content: center;
}
.pulse {
    box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 18%, transparent);
}
@media (prefers-reduced-motion: no-preference) {
    .pulse {
        animation: ring 1.6s ease-in-out infinite;
    }
    @keyframes ring {
        50% {
            box-shadow: 0 0 0 16px color-mix(in srgb, var(--accent) 8%, transparent);
        }
    }
}
.answer-row {
    display: flex;
    gap: 72px;
    margin-top: 40px;
}
.labelled {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
}
.round {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 0;
    display: grid;
    place-items: center;
    font-size: 22px;
    color: #fff;
    cursor: pointer;
    flex: none;
}
.round.go {
    background: #17824b;
}
.round.stop {
    background: #c9433a;
}
.round:disabled {
    opacity: 0.4;
    cursor: default;
}
.controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 8px;
    width: 100%;
    max-width: 300px;
    margin-top: 18px;
}
.ctrl {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    border: 0;
    background: transparent;
    font-size: 11.5px;
    color: var(--fg);
    cursor: pointer;
    padding: 0;
}
.ctrl span {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    font-size: 17px;
}
.ctrl:hover:not(:disabled) span {
    background: var(--raise);
}
.ctrl.on span {
    background: var(--hold);
    color: #101830;
    border-color: transparent;
}
.ctrl:disabled {
    opacity: 0.45;
    cursor: default;
}
.hang {
    margin-top: auto;
}
.call .hang {
    margin-top: 18px;
}
.transfer {
    display: flex;
    gap: 6px;
    width: 100%;
    max-width: 300px;
    margin-top: 10px;
}
.display {
    width: 100%;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
}
.number {
    border: 0;
    background: transparent;
    text-align: center;
    font-size: 32px;
    font-weight: 300;
    letter-spacing: 0.04em;
    padding: 10px 0 0;
    min-width: 0;
}
.number:focus-visible {
    outline: none;
    box-shadow: inset 0 -2px 0 var(--accent);
}
.hint {
    margin: 0;
    min-height: 18px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
}
.hint.warn {
    color: var(--warn);
}
.error {
    margin: 0;
    color: var(--bad);
    text-align: center;
    font-size: 12px;
}
.pad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 8px;
}
.pad.compact {
    width: 100%;
    max-width: 240px;
    gap: 6px;
    margin-top: 12px;
}
.key {
    aspect-ratio: 1.3;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}
.compact .key {
    aspect-ratio: 1.8;
}
.key:hover {
    background: var(--raise);
}
.key b {
    font-size: 20px;
    font-weight: 500;
    line-height: 1.1;
}
.key small {
    font-size: 9px;
    letter-spacing: 0.14em;
    color: var(--muted);
    min-height: 11px;
}
.dial-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    justify-items: center;
    margin-top: 12px;
}
.side {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 18px;
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 6px;
}
.side:hover:not(:disabled) {
    color: var(--fg);
}
.side:disabled {
    opacity: 0.3;
    cursor: default;
}
.last {
    margin: 14px 0 0;
    color: var(--muted);
    font-size: 11.5px;
    text-align: center;
}
.others {
    border-top: 1px solid var(--line);
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.other {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    background: transparent;
    padding: 4px 2px;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
}
.other:hover {
    background: var(--panel-2);
}
.other .who {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.other .mono {
    color: var(--muted);
    font-size: 11px;
}
</style>
