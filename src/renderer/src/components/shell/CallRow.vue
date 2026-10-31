<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, nextTick, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import { DtmfSyntaxError, parseDtmfSequence } from '@renderer/lib/dtmf'
import { duration, now } from '@renderer/lib/now'
import Icon from '../icons/Icon.vue'

/** Uma chamada feita ou já atendida, numa linha compacta: quem, tempo, conta, qualidade e as ações. */
const props = defineProps<{ call: CallView }>()
const emit = defineEmits<{ 'save-contact': [accountId: string, number: string] }>()
const accounts = useAccountsStore()
const calls = useCallsStore()

const dtmf = ref('')
const dtmfError = ref('')
const panel = ref<'dtmf' | 'transfer' | null>(null)
const transferTo = ref('')
const transferInput = ref<HTMLInputElement | null>(null)
const dtmfInput = ref<HTMLInputElement | null>(null)

const c = computed(() => props.call)
const account = computed(() => accounts.byId(c.value.accountId))
const live = computed(() => c.value.state !== 'ended')
const established = computed(() => c.value.state === 'established')
const held = computed(() => c.value.held || c.value.heldByRemote)

const stateInfo = computed(() => {
    const s = c.value
    if (s.state === 'ended')
        return { text: s.failed ? t('callRow.falhou') : t('callRow.encerrada'), cls: s.failed ? 'bad' : 'neutral' }
    if (held.value) return { text: s.held ? t('callRow.em_espera') : t('callRow.em_espera_remoto'), cls: 'hold' }
    if (s.state === 'established') return { text: t('callRow.em_chamada'), cls: 'ok' }
    if (s.state === 'early') return { text: t('callRow.early_media'), cls: 'warn' }
    if (s.state === 'ringing') return { text: t('callRow.chamando'), cls: 'warn' }
    return { text: t('callRow.discando'), cls: 'neutral' }
})

/** Barras de sinal, de 1 a 4, a partir da nota de qualidade. */
const bars = computed(() => {
    const level = c.value.quality?.level
    return level === 'excellent' ? 4 : level === 'good' ? 3 : level === 'warning' ? 2 : level === 'bad' ? 1 : 0
})

const LEVELS = {
    excellent: 'callRow.nivel_excellent',
    good: 'callRow.nivel_good',
    warning: 'callRow.nivel_warning',
    bad: 'callRow.nivel_bad'
} as const
const signal = computed(() =>
    c.value.quality ? t('callRow.sinal', { level: t(LEVELS[c.value.quality.level]), n: bars.value }) : ''
)

/** Medidor do áudio que chega: de -60 dBFS (vazio) a 0 (cheio). */
const meter = computed(() => {
    const level = c.value.level
    if (level === null || level === undefined) return null
    return { db: level, percent: Math.round(Math.max(0, Math.min(1, (level + 60) / 60)) * 100) }
})

const timer = computed(() => {
    const s = c.value
    const end = s.endedAt ?? now.value
    return s.establishedAt ? duration(s.establishedAt, end) : duration(s.startedAt, end)
})

/** Notas que só aparecem quando valem: andamento, toque, mudo, transferência, DTMF recebido, fim. */
const notes = computed(() => {
    const s = c.value
    const list: string[] = []
    if (s.progress && s.state !== 'established' && live.value) list.push(s.progress)
    if (s.ringback === 'pbx') list.push(t('callRow.ouvindo_pbx'))
    else if (s.ringback === 'local' && s.state === 'early') list.push(t('callRow.early_nao_ouvido'))
    else if (s.ringback === 'local') list.push(t('callRow.toque_local'))
    if (s.muted) list.push(t('callRow.mudo'))
    if (s.transfer) list.push(t('callRow.transferencia', { transfer: s.transfer }))
    if (consulting.value) list.push(t('callRow.consultando', { remote: consulting.value.remote }))
    if (s.dtmfReceived) list.push(t('callRow.dtmf_recebido', { dtmfReceived: s.dtmfReceived }))
    if (s.endText) list.push(s.endText)
    return list
})

async function toggle(which: 'dtmf' | 'transfer'): Promise<void> {
    panel.value = panel.value === which ? null : which
    await nextTick()
    if (panel.value === 'dtmf') dtmfInput.value?.focus()
    if (panel.value === 'transfer') transferInput.value?.focus()
}

async function sendDtmf(): Promise<void> {
    dtmfError.value = ''
    try {
        parseDtmfSequence(dtmf.value)
    } catch (e) {
        if (e instanceof DtmfSyntaxError) {
            dtmfError.value = e.message
            return
        }
        throw e
    }
    await calls.sendDtmf(c.value.id, dtmf.value)
}

async function doTransfer(): Promise<void> {
    if (!transferTo.value.trim()) return
    await calls.transfer(c.value.id, transferTo.value)
    panel.value = null
}

/** Transferência assistida (RF-16): consulta o destino antes de transferir. */
async function doConsult(): Promise<void> {
    if (!transferTo.value.trim()) return
    await calls.startConsult(c.value.id, transferTo.value)
    panel.value = null
}

// A chamada original (em espera) e a de consulta se referenciam.
const consultOf = computed(() => calls.calls.find((x) => x.id === c.value.consultFor))
const consulting = computed(() => calls.calls.find((x) => x.id === c.value.consultId))

const openRecordings = (): void => void window.iris.audio.openRecordings().catch(() => undefined)
</script>

<template>
    <article
        class="call"
        :class="[stateInfo.cls, { selected: calls.selectedId === call.id, ended: !live }]"
        :style="{ '--account': account?.color }"
        @click="calls.selectedId = call.id"
    >
        <div class="line">
            <div class="who">
                <div class="title">
                    <b class="name">{{ call.remoteName || call.remote }}</b>
                    <span class="pill" :class="stateInfo.cls">{{ stateInfo.text }}</span>
                    <span v-if="call.recording" class="rec" :title="call.recording">
                        <i aria-hidden="true"></i>{{ $t('callRow.gravando') }}
                    </span>
                    <span class="timer mono tabular">{{ timer }}</span>
                </div>
                <div class="meta">
                    <span class="route mono">
                        {{ account?.extension ?? '?' }} {{ call.direction === 'out' ? '→' : '←' }} {{ call.remote }}
                    </span>
                    <span class="acct-tag"
                        ><i aria-hidden="true"></i>{{ account?.name ?? accounts.nameOf(call.accountId) }}</span
                    >
                    <template v-if="call.quality && established">
                        <span class="mono">{{ call.quality.codec }}</span>
                        <span class="mono tabular">{{
                            $t('callRow.perda', { p: call.quality.packetLossPercent.toFixed(1) })
                        }}</span>
                        <span class="mono tabular">{{ $t('callRow.jitter', { ms: call.quality.jitterMs }) }}</span>
                        <span class="mono tabular">{{ $t('callRow.rtt', { ms: call.quality.rttMs }) }}</span>
                    </template>
                    <span
                        v-if="call.quality && established"
                        class="bars"
                        :class="call.quality.level"
                        role="img"
                        :aria-label="signal"
                        :title="signal"
                    >
                        <i v-for="n in 4" :key="n" :class="{ on: n <= bars }"></i>
                    </span>
                    <span
                        v-if="meter && (established || call.ringback === 'pbx')"
                        class="meter"
                        role="meter"
                        aria-valuemin="-60"
                        aria-valuemax="0"
                        :aria-valuenow="meter.db"
                        :aria-label="$t('callRow.audio_chegando')"
                        :title="$t('callRow.audio_chegando_db', { db: meter.db })"
                    >
                        <span
                            class="meter-fill"
                            :class="{ silent: meter.percent < 17 }"
                            :style="{ width: `${meter.percent}%` }"
                        ></span>
                    </span>
                    <span v-if="meter && meter.percent < 17 && established" class="silence">{{
                        $t('callRow.sem_audio')
                    }}</span>
                </div>
                <div v-if="notes.length" class="notes">
                    <span v-for="note in notes" :key="note">{{ note }}</span>
                </div>
            </div>

            <div v-if="live" class="controls" @click.stop>
                <template v-if="established">
                    <button class="btn small" :class="{ on: call.muted }" @click="calls.toggleMute(call.id)">
                        <Icon name="mic" />{{ call.muted ? $t('callRow.ativar_mic') : $t('callRow.mudo_botao') }}
                    </button>
                    <button
                        class="btn small"
                        :class="{ resume: call.held, on: call.held }"
                        @click="calls.toggleHold(call.id)"
                    >
                        <Icon name="pause" />{{ call.held ? $t('callRow.retomar') : $t('callRow.espera') }}
                    </button>
                    <button
                        class="btn small"
                        :class="{ on: panel === 'dtmf' }"
                        :aria-expanded="panel === 'dtmf'"
                        @click="toggle('dtmf')"
                    >
                        <Icon name="grid" />{{ $t('callRow.dtmf') }}
                    </button>
                    <button
                        class="btn small"
                        :class="{ on: panel === 'transfer' }"
                        :aria-expanded="panel === 'transfer'"
                        aria-haspopup="true"
                        :disabled="Boolean(consulting) || Boolean(consultOf)"
                        @click="toggle('transfer')"
                    >
                        <Icon name="transfer" />{{ $t('callRow.transferir') }}
                    </button>
                    <button
                        v-if="call.canRecord"
                        class="btn small"
                        :class="{ recording: call.recording }"
                        :title="call.recording ?? $t('callRow.gravar_dica')"
                        @click="calls.toggleRecording(call.id)"
                    >
                        <Icon name="record" />{{ call.recording ? $t('callRow.parar_gravacao') : $t('callRow.gravar') }}
                    </button>
                    <button
                        v-if="call.canRecord"
                        class="btn small ghost icon-only"
                        :title="$t('callRow.pasta_gravacoes')"
                        :aria-label="$t('callRow.pasta_gravacoes')"
                        @click="openRecordings"
                    >
                        <Icon name="folder" />
                    </button>
                    <button
                        v-if="!call.remoteName"
                        class="btn small ghost icon-only"
                        :title="$t('callRow.salvar_contato', { remote: call.remote })"
                        :aria-label="$t('callRow.salvar_contato', { remote: call.remote })"
                        @click="emit('save-contact', call.accountId, call.remote)"
                    >
                        <Icon name="user-plus" />
                    </button>
                </template>
                <button class="btn small stop" @click="calls.hangup(call.id)">
                    <Icon name="hangup" />{{ $t('callRow.desligar') }}
                </button>
            </div>
        </div>

        <div v-if="live && consultOf" class="sub consult" @click.stop>
            <span>
                {{ $t('callRow.consulta_para_transferir') }} <b class="mono">{{ consultOf.remote }}</b>
                <span class="muted">{{ established ? '' : $t('callRow.aguardando_atender') }}</span>
            </span>
            <button class="btn small go" :disabled="!established" @click="calls.completeTransfer(call.id)">
                {{ $t('callRow.concluir_transferencia') }}
            </button>
            <button class="btn small" @click="calls.cancelConsult(call.id)">
                {{ $t('callRow.cancelar_e_voltar') }}
            </button>
        </div>

        <div v-if="live && established && panel === 'dtmf'" class="sub" @click.stop>
            <form class="form" @submit.prevent="sendDtmf">
                <input
                    ref="dtmfInput"
                    v-model="dtmf"
                    class="input mono"
                    :class="{ invalid: dtmfError }"
                    :placeholder="$t('callRow.dtmf_exemplo')"
                    :aria-label="$t('callRow.sequencia_dtmf')"
                />
                <button v-if="!call.dtmfRunning" class="btn small primary" type="submit" :disabled="!dtmf.trim()">
                    {{ $t('callRow.enviar') }}
                </button>
                <button v-else class="btn small" type="button" @click="calls.stopDtmf(call.id)">
                    {{ $t('callRow.parar') }}
                </button>
            </form>
            <p class="hint" :class="{ error: dtmfError }">{{ dtmfError || $t('callRow.dtmf_dica') }}</p>
        </div>

        <div v-if="live && established && panel === 'transfer'" class="sub" @click.stop>
            <form class="form" @submit.prevent="doTransfer">
                <input
                    ref="transferInput"
                    v-model="transferTo"
                    class="input mono"
                    :placeholder="$t('callRow.destino_exemplo')"
                    :aria-label="$t('callRow.destino')"
                />
                <button class="btn small" type="submit" :disabled="!transferTo.trim()">
                    {{ $t('callRow.cega') }}
                </button>
                <button class="btn small primary" type="button" :disabled="!transferTo.trim()" @click="doConsult">
                    {{ $t('callRow.consultar_antes') }}
                </button>
            </form>
            <p class="hint">{{ $t('callRow.transferir_dica') }}</p>
        </div>
    </article>
</template>

<style scoped>
/* A linha: barra de estado à esquerda (cor e, em espera e encerrada, o fundo e a borda mudam também). */
.call {
    position: relative;
    padding: 7px 12px 7px 15px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    cursor: default;
}
.call::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--muted);
}
.call.ok::before {
    background: var(--ok);
}
.call.warn::before {
    background: var(--warn);
}
.call.bad::before {
    background: var(--bad);
}
.call.selected {
    background: var(--selected);
}
/* Em espera: fundo amarelo e barra tracejada, com o Retomar em destaque. */
.call.hold {
    background: var(--warn-soft);
}
.call.hold::before {
    background: repeating-linear-gradient(var(--warn) 0 4px, transparent 4px 7px);
}
.call.ended {
    background: var(--bg);
}
.call.ended::before {
    background: repeating-linear-gradient(var(--muted) 0 2px, transparent 2px 5px);
}

.line {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.who {
    flex: 1 1 320px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.name {
    font-size: 13.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.timer {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
}
.call.ok .timer {
    color: var(--ok-text);
}
.meta,
.notes {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 10px;
    font-size: 11.5px;
    color: var(--muted);
}
.route {
    color: var(--fg);
}
.notes span + span::before {
    content: '·';
    margin-right: 6px;
}

/* Gravando: ponto vermelho que pulsa, com o texto (não só a cor). */
.rec {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--bad-text);
}
.rec i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--bad);
}
@media (prefers-reduced-motion: no-preference) {
    .rec i {
        animation: pulse 1.2s ease-in-out infinite;
    }
}

/* Barras de qualidade: quantas acesas (forma) e a cor do nível. */
.bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
}
.bars i {
    width: 3px;
    border-radius: 1px;
    background: var(--line-strong);
}
.bars i:nth-child(1) {
    height: 4px;
}
.bars i:nth-child(2) {
    height: 6px;
}
.bars i:nth-child(3) {
    height: 9px;
}
.bars i:nth-child(4) {
    height: 12px;
}
.bars.excellent i.on,
.bars.good i.on {
    background: var(--ok);
}
.bars.warning i.on {
    background: var(--warn);
}
.bars.bad i.on {
    background: var(--bad);
}
.meter {
    width: 56px;
    height: 5px;
    border-radius: 3px;
    background: var(--raise);
    overflow: hidden;
}
.meter-fill {
    display: block;
    height: 100%;
    background: var(--ok);
    transition: width 0.2s;
}
.meter-fill.silent {
    background: var(--warn);
}
.silence {
    color: var(--warn-text);
}
@media (prefers-reduced-motion: reduce) {
    .meter-fill {
        transition: none;
    }
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-left: auto;
}
.controls :deep(.icon) {
    width: 13px;
    height: 13px;
}
.icon-only {
    padding: 2px 6px;
}
/* Retomar em amarelo cheio, ganhando dos estilos de botão ligado e de passar o mouse. */
.controls .btn.resume.on,
.controls .btn.resume.on:hover:not(:disabled) {
    background: var(--warn-text);
    border-color: var(--warn-text);
    color: #fff;
}
:root[data-theme='dark'] .controls .btn.resume.on {
    color: #1b1300;
}
.btn.recording {
    border-color: var(--bad);
    color: var(--bad-text);
}

/* Painéis que abrem embaixo da linha: DTMF, transferência e a consulta da assistida. */
.sub {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px dashed var(--line);
}
.form {
    display: flex;
    gap: 6px;
    max-width: 520px;
}
.form .input {
    height: 26px;
    padding: 2px 8px;
}
.hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--muted);
}
.hint.error {
    color: var(--bad-text);
}
.consult {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}
.consult > span {
    flex: 1;
}
.muted {
    color: var(--muted);
}
</style>
