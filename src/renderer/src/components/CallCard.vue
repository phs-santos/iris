<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import { DtmfSyntaxError, parseDtmfSequence } from '@renderer/lib/dtmf'
import { duration, now } from '@renderer/lib/now'
import { useAiStore } from '@renderer/stores/ai'

const props = defineProps<{ call: CallView }>()
const accounts = useAccountsStore()
const calls = useCallsStore()
const ai = useAiStore()

const dtmf = ref('')
const dtmfError = ref('')
const showDtmf = ref(false)
const transferTo = ref('')
const showTransfer = ref(false)

const account = computed(() => accounts.byId(props.call.accountId))
const c = computed(() => props.call)
const live = computed(() => c.value.state !== 'ended')
const established = computed(() => c.value.state === 'established')

const stateInfo = computed(() => {
    const s = c.value
    if (s.state === 'ended') return { text: s.failed ? 'falhou' : 'encerrada', cls: s.failed ? 'bad' : 'neutral' }
    if (s.held || s.heldByRemote)
        return { text: s.held ? t('callCard.em_espera') : t('callCard.em_espera_remoto'), cls: 'hold' }
    if (s.state === 'established') return { text: t('callCard.em_chamada'), cls: 'ok' }
    if (s.state === 'early') return { text: t('callCard.early_media'), cls: 'warn' }
    if (s.direction === 'in') return { text: 'tocando', cls: 'warn' }
    if (s.state === 'ringing') return { text: 'chamando', cls: 'warn' }
    return { text: 'discando', cls: 'neutral' }
})

/** Iniciais de quem está do outro lado (nome da agenda ou do PBX); sem nome, os dois últimos dígitos. */
const initials = computed(() => {
    const words = (c.value.remoteName ?? '').split(/\s+/).filter((w) => /\p{L}/u.test(w))
    if (words.length)
        return words
            .slice(0, 2)
            .map((w) => w[0]!.toUpperCase())
            .join('')
    return c.value.remote.replace(/\D/g, '').slice(-2) || '?'
})

/** Barras de sinal, de 1 a 4, a partir da nota de qualidade; os números ficam na dica. */
const bars = computed(() => {
    const level = c.value.quality?.level
    return level === 'excellent' ? 4 : level === 'good' ? 3 : level === 'warning' ? 2 : level === 'bad' ? 1 : 0
})

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

const autoAnswerIn = computed(() => {
    const at = c.value.autoAnswerAt
    return at ? Math.max(0, Math.ceil((at - now.value) / 1000)) : null
})

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
    showTransfer.value = false
}

async function doConsult(): Promise<void> {
    if (!transferTo.value.trim()) return
    await calls.startConsult(c.value.id, transferTo.value)
    showTransfer.value = false
}

// Transferência assistida: a chamada original (em espera) e a de consulta se referenciam.
const consultOf = computed(() => calls.calls.find((x) => x.id === c.value.consultFor))
const consulting = computed(() => calls.calls.find((x) => x.id === c.value.consultId))

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
</script>

<template>
    <article
        class="call"
        :class="[stateInfo.cls, { selected: calls.selectedId === call.id, ended: !live }]"
        @click="calls.selectedId = call.id"
    >
        <div class="top">
            <span class="avatar" :style="{ '--account': account?.color }" aria-hidden="true">{{ initials }}</span>
            <span class="who">
                <b>{{ account?.extension ?? '?' }}</b>
                <span class="arrow">{{ call.direction === 'out' ? '→' : '←' }}</span>
                <b class="mono">{{ call.remote }}</b>
                <span v-if="call.remoteName" class="muted">{{ call.remoteName }}</span>
            </span>
            <span class="pill" :class="stateInfo.cls">{{ stateInfo.text }}</span>
            <span class="timer mono tabular">{{ timer }}</span>
        </div>

        <div class="meta mono">
            <span>{{ account?.name }}</span>
            <span v-if="call.progress && call.state !== 'established' && live">· {{ call.progress }}</span>
            <span v-if="call.muted">{{ $t('callCard.mudo') }}</span>
            <span v-if="call.transfer">{{ $t('callCard.transferencia', { transfer: call.transfer }) }}</span>
            <span v-if="consulting">{{ $t('callCard.consultando', { remote: consulting.remote }) }}</span>
            <span v-if="call.dtmfReceived">{{
                $t('callCard.dtmf_recebido', { dtmfReceived: call.dtmfReceived })
            }}</span>
            <span v-if="call.endText">· {{ call.endText }}</span>
            <button v-if="!live" class="btn small explain" @click.stop="ai.explainCall(call)">
                {{ $t('callCard.explicar_com_ia') }}
            </button>
        </div>

        <div v-if="live && consultOf" class="consult" @click.stop>
            <span>
                {{ $t('callCard.consulta_para_transferir') }} <b class="mono">{{ consultOf.remote }}</b>
                <span class="muted">{{ established ? '' : $t('callCard.aguardando_atender') }}</span>
            </span>
            <button class="btn go" :disabled="!established" @click="calls.completeTransfer(call.id)">
                {{ $t('callCard.concluir_transferencia') }}
            </button>
            <button class="btn" @click="calls.cancelConsult(call.id)">{{ $t('callCard.cancelar_e_voltar') }}</button>
        </div>

        <div v-if="live" class="controls" @click.stop>
            <template v-if="call.direction === 'in' && call.state === 'ringing'">
                <button class="btn go" @click="calls.answer(call.id)">
                    {{ $t('callCard.atender')
                    }}<span v-if="autoAnswerIn !== null" class="muted-inv">
                        {{ $t('callCard.auto_em_s', { autoAnswerIn }) }}</span
                    >
                </button>
                <button class="btn stop" @click="calls.reject(call.id)">{{ $t('callCard.recusar') }}</button>
            </template>
            <template v-else>
                <button
                    class="btn"
                    :class="{ on: call.muted }"
                    :disabled="!established"
                    @click="calls.toggleMute(call.id)"
                >
                    {{ call.muted ? $t('callCard.ativar_mic') : $t('callCard.mudo_2') }}
                </button>
                <button
                    class="btn"
                    :class="{ on: call.held }"
                    :disabled="!established"
                    @click="calls.toggleHold(call.id)"
                >
                    {{ call.held ? $t('callCard.retomar') : $t('callCard.espera') }}
                </button>
                <button
                    v-if="call.canRecord"
                    class="btn"
                    :class="{ on: call.recording }"
                    :disabled="!established"
                    :title="call.recording ?? $t('callCard.gravar_dica')"
                    @click="calls.toggleRecording(call.id)"
                >
                    {{ call.recording ? $t('callCard.parar_gravacao') : $t('callCard.gravar') }}
                </button>
                <button class="btn" :class="{ on: showDtmf }" :disabled="!established" @click="showDtmf = !showDtmf">
                    {{ $t('callCard.dtmf') }}
                </button>
                <button
                    class="btn"
                    :class="{ on: showTransfer }"
                    :disabled="!established || Boolean(consulting) || Boolean(consultOf)"
                    @click="showTransfer = !showTransfer"
                >
                    {{ $t('callCard.transferir') }}
                </button>
                <button class="btn stop" @click="calls.hangup(call.id)">{{ $t('callCard.desligar') }}</button>
            </template>
        </div>

        <div v-if="live && showDtmf && established" class="panel" @click.stop>
            <form class="line" @submit.prevent="sendDtmf">
                <input
                    v-model="dtmf"
                    class="input mono"
                    :class="{ invalid: dtmfError }"
                    :placeholder="$t('callCard.t_1_w2_4321')"
                    :aria-label="$t('callCard.sequencia_dtmf')"
                />
                <button v-if="!call.dtmfRunning" class="btn primary" type="submit" :disabled="!dtmf.trim()">
                    {{ $t('callCard.enviar') }}
                </button>
                <button v-else class="btn" type="button" @click="calls.stopDtmf(call.id)">
                    {{ $t('callCard.parar') }}
                </button>
            </form>
            <p v-if="dtmfError" class="error">{{ dtmfError }}</p>
            <p v-else class="hint">
                {{ $t('callCard.digitos_0_9_a_d') }}
            </p>
            <div class="keypad">
                <button
                    v-for="k in keys"
                    :key="k"
                    class="btn small mono"
                    type="button"
                    @click="calls.sendDtmf(call.id, k)"
                >
                    {{ k }}
                </button>
            </div>
        </div>

        <div v-if="live && showTransfer && established" class="panel" @click.stop>
            <form class="line" @submit.prevent="doTransfer">
                <input
                    v-model="transferTo"
                    class="input mono"
                    :placeholder="$t('callCard.destino_da_transferencia')"
                    :aria-label="$t('callCard.destino')"
                />
                <button class="btn" type="submit" :disabled="!transferTo.trim()">{{ $t('callCard.cega') }}</button>
                <button class="btn primary" type="button" :disabled="!transferTo.trim()" @click="doConsult">
                    {{ $t('callCard.consultar_antes') }}
                </button>
            </form>
            <p class="hint">
                {{ $t('callCard.cega_transfere_na_hora_consultar') }}
            </p>
        </div>

        <div v-if="established && (meter || call.quality)" class="signal">
            <span
                v-if="meter"
                class="meter"
                role="meter"
                aria-valuemin="-60"
                aria-valuemax="0"
                :aria-valuenow="meter.db"
                :aria-label="$t('callCard.audio_chegando')"
                :title="$t('callCard.audio_chegando_db', { db: meter.db })"
            >
                <span
                    class="meter-fill"
                    :class="{ silent: meter.percent < 17 }"
                    :style="{ width: `${meter.percent}%` }"
                ></span>
            </span>
            <span v-if="meter && meter.percent < 17" class="silence">{{ $t('callCard.sem_audio') }}</span>
            <span
                v-if="call.quality"
                class="bars"
                :class="call.quality.level"
                role="img"
                :aria-label="$t('callCard.sinal', { n: bars })"
                :title="
                    $t('callCard.qualidade_jitter_ms_perda_rtt', {
                        score: call.quality.score,
                        jitterMs: call.quality.jitterMs,
                        p: call.quality.packetLossPercent.toFixed(1),
                        rttMs: call.quality.rttMs,
                        p2: call.quality.codec || 'codec ?'
                    })
                "
            >
                <i v-for="n in 4" :key="n" :class="{ on: n <= bars }" :style="{ height: `${n * 3 + 2}px` }"></i>
            </span>
        </div>
        <div v-if="established && call.quality" class="quality mono tabular">
            {{
                $t('callCard.qualidade_jitter_ms_perda_rtt', {
                    score: call.quality.score,
                    jitterMs: call.quality.jitterMs,
                    p: call.quality.packetLossPercent.toFixed(1),
                    rttMs: call.quality.rttMs,
                    p2: call.quality.codec || 'codec ?'
                })
            }}
        </div>
    </article>
</template>

<style scoped>
.explain {
    margin-left: auto;
}
.consult {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 10px;
    border: 1px dashed var(--accent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.consult > span {
    flex: 1;
}
.call {
    border: 1px solid var(--line);
    border-left-width: 3px;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--panel);
}
.call.selected {
    background: var(--panel-2);
}
.call.warn {
    border-left-color: var(--warn);
}
.call.ok {
    border-left-color: var(--ok);
}
.call.hold {
    border-left-color: var(--hold);
}
.call.bad {
    border-left-color: var(--bad);
}
.call.ended {
    /* Sem transparência, que derrubava o contraste do texto: borda tracejada e fundo do app. */
    background: var(--bg);
    border-style: dashed;
}
.top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
}
.who {
    display: flex;
    gap: 6px;
    align-items: baseline;
    min-width: 0;
}
.arrow,
.muted {
    color: var(--muted);
}
.timer {
    margin-left: auto;
    color: var(--muted);
}
.meta {
    font-size: 11px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.muted-inv {
    opacity: 0.8;
    font-weight: 400;
}
.panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
}
.line {
    display: flex;
    gap: 6px;
}
.keypad {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 32px));
    gap: 4px;
}
.hint,
.error {
    margin: 0;
    font-size: 11.5px;
    color: var(--muted);
}
.error {
    color: var(--bad);
}
.quality {
    font-size: 11px;
    color: var(--muted);
}
.avatar {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: color-mix(in srgb, var(--account, var(--accent)) 55%, #000);
}
.signal {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
}
.meter {
    flex: 1;
    max-width: 260px;
    height: 6px;
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
    font-size: 11px;
    color: var(--warn);
}
.bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
}
.bars i {
    width: 4px;
    border-radius: 1px;
    background: var(--line);
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
@media (prefers-reduced-motion: reduce) {
    .meter-fill {
        transition: none;
    }
}
</style>
