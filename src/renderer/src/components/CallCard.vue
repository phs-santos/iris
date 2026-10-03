<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import { DtmfSyntaxError, parseDtmfSequence } from '@renderer/lib/dtmf'
import { duration, now } from '@renderer/lib/now'

const props = defineProps<{ call: CallView }>()
const accounts = useAccountsStore()
const calls = useCallsStore()

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
    if (s.held || s.heldByRemote) return { text: s.held ? 'em espera' : 'em espera (remoto)', cls: 'hold' }
    if (s.state === 'established') return { text: 'em chamada', cls: 'ok' }
    if (s.state === 'early') return { text: 'early media', cls: 'warn' }
    if (s.direction === 'in') return { text: 'tocando', cls: 'warn' }
    if (s.state === 'ringing') return { text: 'chamando', cls: 'warn' }
    return { text: 'discando', cls: 'neutral' }
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

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
</script>

<template>
    <article
        class="call"
        :class="[stateInfo.cls, { selected: calls.selectedId === call.id, ended: !live }]"
        @click="calls.selectedId = call.id"
    >
        <div class="top">
            <span class="swatch" :style="{ background: account?.color }"></span>
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
            <span v-if="call.muted">· mudo</span>
            <span v-if="call.transfer">· transferência {{ call.transfer }}</span>
            <span v-if="call.dtmfReceived">· DTMF recebido {{ call.dtmfReceived }}</span>
            <span v-if="call.endText">· {{ call.endText }}</span>
        </div>

        <div v-if="live" class="controls" @click.stop>
            <template v-if="call.direction === 'in' && call.state === 'ringing'">
                <button class="btn go" @click="calls.answer(call.id)">
                    Atender<span v-if="autoAnswerIn !== null" class="muted-inv"> (auto em {{ autoAnswerIn }} s)</span>
                </button>
                <button class="btn stop" @click="calls.reject(call.id)">Recusar</button>
            </template>
            <template v-else>
                <button
                    class="btn"
                    :class="{ on: call.muted }"
                    :disabled="!established"
                    @click="calls.toggleMute(call.id)"
                >
                    {{ call.muted ? 'Ativar mic' : 'Mudo' }}
                </button>
                <button
                    class="btn"
                    :class="{ on: call.held }"
                    :disabled="!established"
                    @click="calls.toggleHold(call.id)"
                >
                    {{ call.held ? 'Retomar' : 'Espera' }}
                </button>
                <button class="btn" :class="{ on: showDtmf }" :disabled="!established" @click="showDtmf = !showDtmf">
                    DTMF
                </button>
                <button
                    class="btn"
                    :class="{ on: showTransfer }"
                    :disabled="!established"
                    @click="showTransfer = !showTransfer"
                >
                    Transferir
                </button>
                <button class="btn stop" @click="calls.hangup(call.id)">Desligar</button>
            </template>
        </div>

        <div v-if="live && showDtmf && established" class="panel" @click.stop>
            <form class="line" @submit.prevent="sendDtmf">
                <input
                    v-model="dtmf"
                    class="input mono"
                    :class="{ invalid: dtmfError }"
                    placeholder="1,w2,4321#"
                    aria-label="Sequência DTMF"
                />
                <button v-if="!call.dtmfRunning" class="btn primary" type="submit" :disabled="!dtmf.trim()">
                    Enviar
                </button>
                <button v-else class="btn" type="button" @click="calls.stopDtmf(call.id)">Parar</button>
            </form>
            <p v-if="dtmfError" class="error">{{ dtmfError }}</p>
            <p v-else class="hint">
                Dígitos 0-9 * # A-D. "w2" espera 2 s. Clique no teclado para enviar um dígito na hora.
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
                    placeholder="Destino da transferência"
                    aria-label="Destino"
                />
                <button class="btn primary" type="submit" :disabled="!transferTo.trim()">Transferir (cega)</button>
            </form>
        </div>

        <div v-if="established && call.quality" class="quality mono tabular">
            qualidade {{ call.quality.score }} · jitter {{ call.quality.jitterMs }} ms · perda
            {{ call.quality.packetLossPercent.toFixed(1) }}% · RTT {{ call.quality.rttMs }} ms ·
            {{ call.quality.codec || 'codec ?' }}
        </div>
    </article>
</template>

<style scoped>
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
    opacity: 0.7;
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
</style>
