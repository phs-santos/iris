<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { usePreferencesStore } from '@renderer/stores/preferences'
import PhoneIcon from './PhoneIcon.vue'
import { MOCK_NUMBERS } from '@renderer/sip/mock-engine'

const accounts = useAccountsStore()
const calls = useCallsStore()
const contacts = useContactsStore()
const prefs = usePreferencesStore()
const destination = ref('')
const headersText = ref('')
const showHeaders = ref(false)
const showKeypad = ref(false)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)

const from = computed(() => accounts.selected)
const registered = computed(() => (from.value ? accounts.statusOf(from.value.id).state === 'registered' : false))

/** Atalhos: as outras contas do mesmo PBX e os números salvos da conta. */
const shortcuts = computed(() => {
    const account = from.value
    if (!account) return []
    const peers = accounts.accounts
        .filter((a) => a.id !== account.id && a.domain === account.domain)
        .map((a) => ({ label: a.name, number: a.extension }))
    // Favoritos da agenda (RF-50) também viram atalhos.
    const favorites = contacts.contacts.filter((c) => c.favorite).map((c) => ({ label: c.name, number: c.number }))
    return [...peers, ...account.quickDials, ...favorites]
})

/** Teclas com as letras de um telefone; segurar o 0 escreve "+", como no celular. */
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
let plusTimer: ReturnType<typeof setTimeout> | undefined
let plusTyped = false

function keyDown(key: string): void {
    plusTyped = false
    if (key !== '0') return
    plusTimer = setTimeout(() => {
        destination.value += '+'
        plusTyped = true
    }, 500)
}

function keyUp(key: string): void {
    clearTimeout(plusTimer)
    // O clique que vem depois de segurar o 0 já escreveu o "+".
    if (!plusTyped) destination.value += key
    plusTyped = false
}

const cancelPlus = (): void => clearTimeout(plusTimer)

const erase = (): string => (destination.value = destination.value.slice(0, -1))

/** O motor da conta escolhida faz vídeo: WebRTC e simulado (RF-52). */
const canVideo = computed(() => Boolean(from.value && accounts.engineOf(from.value.id)?.video))

async function dial(number = destination.value, video = false): Promise<void> {
    error.value = ''
    if (!from.value || !number.trim()) return
    const headers = headersText.value
        .split('\n')
        .map((h) => h.trim())
        .filter(Boolean)
    const bad = headers.find((h) => !/^[A-Za-z0-9-]+:\s*.+$/.test(h))
    if (bad) {
        error.value = t('dialerPane.cabecalho_invalido_use_o_formato', { bad })
        return
    }
    try {
        await calls.dial(from.value.id, number, headers.length ? headers : undefined, video)
        destination.value = number
    } catch (e) {
        error.value = (e as Error).message
    }
}

defineExpose({
    focus: () => input.value?.focus(),
    /** Número vindo de fora (um link tel:, RF-53): fica no campo, pronto para ligar. */
    setNumber: (number: string) => {
        destination.value = number
        input.value?.focus()
    }
})
</script>

<template>
    <section class="dialer">
        <div class="from">
            <span class="label">{{ $t('dialerPane.discar_de') }}</span>
            <select
                v-model="accounts.selectedId"
                class="input from-select"
                :aria-label="$t('dialerPane.conta_de_origem')"
            >
                <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                    {{ a.name }} · {{ a.extension }}@{{ a.domain }}
                </option>
            </select>
        </div>

        <form class="dial-row" @submit.prevent="dial()">
            <input
                ref="input"
                v-model="destination"
                class="input mono number"
                :placeholder="$t('dialerPane.numero_ou_ramal')"
                :aria-label="$t('dialerPane.numero')"
                autocomplete="off"
                list="iris-contacts"
            />
            <!-- Sugestões da agenda (RF-50): o número, com o nome ao lado. -->
            <datalist id="iris-contacts">
                <option v-for="c in contacts.contacts" :key="c.id" :value="c.number">{{ c.name }}</option>
            </datalist>
            <button class="btn go big" type="submit" :disabled="!registered || !destination.trim()">
                <PhoneIcon name="phone" class="dial-icon" />{{ $t('dialerPane.ligar') }}
            </button>
            <button
                v-if="from && prefs.isOn('video')"
                class="btn big video-call"
                type="button"
                :disabled="!canVideo || !registered || !destination.trim()"
                :title="canVideo ? $t('dialerPane.ligar_com_video') : $t('dialerPane.video_so_webrtc')"
                :aria-label="$t('dialerPane.ligar_com_video')"
                @click="dial(destination, true)"
            >
                <PhoneIcon name="video" class="dial-icon" />{{ $t('dialerPane.video') }}
            </button>
        </form>

        <p v-if="from && !registered" class="hint">{{ $t('dialerPane.registre_para_ligar', { name: from.name }) }}</p>
        <p v-if="error" class="error">{{ error }}</p>

        <div class="chips">
            <button
                v-for="s in shortcuts"
                :key="s.label + s.number"
                class="chip mono"
                type="button"
                :disabled="!registered"
                :title="$t('dialerPane.ligar_para', { number: s.number })"
                @click="dial(s.number)"
            >
                {{ s.number }} <span>{{ s.label }}</span>
            </button>
            <button class="chip mono" type="button" @click="showKeypad = !showKeypad">
                {{ $t('dialerPane.teclado') }}
            </button>
            <button v-if="prefs.isOn('log')" class="chip mono" type="button" @click="showHeaders = !showHeaders">
                {{ $t('dialerPane.cabecalhos_sip') }}
            </button>
        </div>

        <div v-if="showKeypad" class="keypad" role="group" :aria-label="$t('dialerPane.teclado_rotulo')">
            <button
                v-for="[k, letters] in keys"
                :key="k"
                class="key"
                type="button"
                :aria-label="k === '0' ? $t('dialerPane.tecla_zero') : k"
                @pointerdown="keyDown(k)"
                @pointerleave="cancelPlus"
                @click="keyUp(k)"
            >
                <b :class="{ star: k === '*' }">{{ k }}</b>
                <small aria-hidden="true">{{ letters }}</small>
            </button>
            <span></span>
            <button
                class="key call"
                type="button"
                :disabled="!registered || !destination.trim()"
                :aria-label="$t('dialerPane.ligar')"
                @click="dial()"
            >
                <PhoneIcon name="phone" />
            </button>
            <button
                class="key plain"
                type="button"
                :disabled="!destination"
                :aria-label="$t('dialerPane.apagar')"
                @click="erase"
            >
                <PhoneIcon name="erase" />
            </button>
        </div>

        <div v-if="showHeaders && prefs.isOn('log')" class="headers">
            <label class="label" for="extra-headers">{{ $t('dialerPane.cabecalhos_extras_no_invite_um') }}</label>
            <textarea
                id="extra-headers"
                v-model="headersText"
                class="input mono"
                rows="2"
                :placeholder="$t('dialerPane.x_test_id_cenario_42')"
            ></textarea>
        </div>

        <details v-if="from?.simulated" class="mock-help">
            <summary>{{ $t('dialerPane.numeros_do_pbx_simulado') }}</summary>
            <ul>
                <li v-for="m in MOCK_NUMBERS" :key="m.number">
                    <b class="mono">{{ m.number }}</b> {{ m.description }}
                </li>
            </ul>
        </details>
    </section>
</template>

<style scoped>
.dialer {
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.from {
    display: flex;
    align-items: center;
    gap: 10px;
}
.from-select {
    flex: 1;
}
.dial-row {
    display: flex;
    gap: 8px;
}
.number {
    font-size: 20px;
    letter-spacing: 0.04em;
    padding: 8px 12px;
}
.big {
    min-width: 96px;
    font-size: 14px;
    font-weight: 600;
}
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.chip {
    font-size: 11.5px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    padding: 3px 8px;
    background: transparent;
    cursor: pointer;
}
.chip span {
    color: var(--muted);
}
.chip:hover:not(:disabled) {
    border-style: solid;
    background: var(--panel-2);
}
.chip:disabled {
    opacity: 0.5;
    cursor: default;
}
.keypad {
    align-self: center;
    display: grid;
    grid-template-columns: repeat(3, 68px);
    gap: 10px 18px;
    padding: 14px 22px 16px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--panel-2);
}
.key {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--raise);
    color: var(--fg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition:
        background 120ms,
        transform 80ms;
}
.key:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 22%, var(--raise));
    border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
}
.key:active:not(:disabled) {
    transform: scale(0.94);
}
.key b {
    font-size: 24px;
    font-weight: 500;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
}
/* O asterisco da fonte é pequeno e fica no alto da linha: maior e mais para baixo, ele se alinha ao #. */
.key b.star {
    font-size: 34px;
    line-height: 0.6;
    padding-top: 14px;
}
.key small {
    min-height: 11px;
    font-size: 9px;
    letter-spacing: 0.16em;
    color: var(--muted);
}
.key.call {
    border: 0;
    background: color-mix(in srgb, var(--ok) 55%, #000);
    color: #fff;
}
.key.call:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ok) 68%, #000);
}
.key.plain {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
}
.key:disabled {
    opacity: 0.45;
    cursor: default;
}
.key :deep(svg) {
    width: 26px;
    height: 26px;
}
@media (prefers-reduced-motion: reduce) {
    .key {
        transition: none;
    }
}
.headers {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.hint {
    margin: 0;
    color: var(--muted);
}
.error {
    margin: 0;
    color: var(--bad);
}
.mock-help {
    color: var(--muted);
    font-size: 12px;
}
.mock-help ul {
    margin: 6px 0 0;
    padding-left: 18px;
}
.mock-help b {
    color: var(--fg);
}
.dial-icon {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    vertical-align: -3px;
}
</style>
