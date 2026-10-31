<script setup lang="ts">
import { isSimulated } from '@shared/servers'
import { digits, plain, type Contact } from '@shared/contacts'
import { t } from '@renderer/i18n'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { MOCK_NUMBERS } from '@renderer/sip/mock-engine'
import Icon from '../icons/Icon.vue'
import ContactSuggestions, { type Suggestion } from './ContactSuggestions.vue'

/** Coluna de discar: número ou nome com sugestões dos contatos da conta atual, Ligar e o teclado. */
const emit = defineEmits<{ 'save-contact': [accountId: string, text: string] }>()
const accounts = useAccountsStore()
const calls = useCallsStore()
const contacts = useContactsStore()
const destination = ref('')
const headersText = ref('')
const showHeaders = ref(false)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)
/** Lista de sugestões aberta e a opção marcada (-1: nenhuma; Enter liga o que foi digitado). */
const open = ref(false)
const active = ref(-1)

const from = computed(() => accounts.current)
const registered = computed(() => (from.value ? accounts.statusOf(from.value.id).state === 'registered' : false))
const headerCount = computed(() => headersText.value.split('\n').filter((h) => h.trim()).length)

/** Texto com letra é nome: a primeira sugestão já vem marcada. Número liga o que foi digitado. */
const isName = computed(() => /[^\d\s()+*#.,-]/.test(destination.value))

const suggestions = computed(() => contacts.suggest(destination.value))

const options = computed<Suggestion[]>(() => {
    const text = destination.value.trim()
    const list: Suggestion[] = suggestions.value.map((contact) => ({ kind: 'contact', contact }))
    // "+ Salvar como contato" quando o que foi digitado não é de nenhum contato da conta (RF-50).
    const known = suggestions.value.some((c) =>
        isName.value ? plain(c.name) === plain(text) : digits(c.number) === digits(text)
    )
    if (text && from.value && !known) list.push({ kind: 'save', text })
    return list
})

const listOpen = computed(() => open.value && options.value.length > 0)

/** Chamada escolhida em andamento: o teclado também manda os tons para ela. */
const dtmfTarget = computed(() =>
    calls.calls.find((c) => c.id === calls.selectedId && c.state === 'established' && !c.held)
)

function typed(): void {
    error.value = ''
    open.value = true
    active.value = isName.value && suggestions.value.length ? 0 : -1
}

function onKey(event: KeyboardEvent): void {
    const total = options.value.length
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (!open.value) return void (open.value = true)
        active.value = total ? Math.min(active.value + 1, total - 1) : -1
    } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        active.value = Math.max(active.value - 1, -1)
    } else if (event.key === 'Escape' && listOpen.value) {
        event.preventDefault()
        event.stopPropagation()
        open.value = false
    } else if (event.key === 'Enter') {
        event.preventDefault()
        const option = listOpen.value ? options.value[active.value] : undefined
        if (option) choose(option)
        else void dial()
    }
}

function choose(option: Suggestion): void {
    open.value = false
    if (option.kind === 'save') {
        if (from.value) emit('save-contact', from.value.id, option.text)
        return
    }
    void callContact(option.contact)
}

async function callContact(contact: Contact): Promise<void> {
    destination.value = contact.number
    await dial(contact.number)
}

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
        typed()
    }, 500)
}

function keyUp(key: string): void {
    clearTimeout(plusTimer)
    // O clique que vem depois de segurar o 0 já escreveu o "+".
    if (!plusTyped) {
        destination.value += key
        typed()
        // Com uma chamada escolhida em andamento, o dígito vai também como DTMF (RF-13).
        if (dtmfTarget.value) void calls.sendDtmf(dtmfTarget.value.id, key).catch(() => undefined)
    }
    plusTyped = false
}

const cancelPlus = (): void => clearTimeout(plusTimer)

function erase(): void {
    destination.value = destination.value.slice(0, -1)
    typed()
}

async function dial(number = destination.value): Promise<void> {
    error.value = ''
    open.value = false
    if (!from.value || !number.trim()) return
    const headers = headersText.value
        .split('\n')
        .map((h) => h.trim())
        .filter(Boolean)
    const bad = headers.find((h) => !/^[A-Za-z0-9-]+:\s*.+$/.test(h))
    if (bad) {
        error.value = t('dialPanel.cabecalho_invalido', { bad })
        showHeaders.value = true
        return
    }
    try {
        // Cabeçalhos extras no INVITE (RF-18).
        await calls.dial(from.value.id, number, headers.length ? headers : undefined)
        destination.value = number
    } catch (e) {
        error.value = (e as Error).message
    }
}

// Como a barra de endereço do navegador: Ctrl/Cmd+L foca e seleciona o número anterior, para digitar por cima.
defineExpose({
    focus: () => {
        input.value?.focus()
        input.value?.select()
    }
})
</script>

<template>
    <div class="dial">
        <header class="head">
            <span v-if="from" class="swatch" :style="{ '--account': from.color }" aria-hidden="true"></span>
            <!-- A conta de origem é a conta atual, trocada pelo seletor da barra de ícones. -->
            <h2>{{ from ? $t('dialPanel.discar_de', { name: from.name }) : $t('dialPanel.sem_conta') }}</h2>
        </header>

        <div class="body">
            <!-- Ligar fica ao lado do campo: a lista de sugestões abre embaixo dos dois e não cobre o botão. -->
            <div class="dial-row">
                <div class="field">
                    <input
                        ref="input"
                        v-model="destination"
                        class="number"
                        :placeholder="$t('dialPanel.numero_ou_nome')"
                        :aria-label="$t('dialPanel.numero')"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls="dial-suggestions"
                        :aria-expanded="listOpen"
                        :aria-activedescendant="listOpen && active >= 0 ? `dial-opt-${active}` : undefined"
                        autocomplete="off"
                        spellcheck="false"
                        @input="typed"
                        @keydown="onKey"
                        @blur="open = false"
                    />
                    <button
                        v-if="destination"
                        type="button"
                        class="clear"
                        :aria-label="$t('dialPanel.apagar')"
                        @pointerdown.prevent
                        @click="erase"
                    >
                        <Icon name="erase" />
                    </button>
                </div>
                <button
                    class="btn go call"
                    type="button"
                    :disabled="!registered || !destination.trim()"
                    @click="dial()"
                >
                    <Icon name="phone" />{{ $t('dialPanel.ligar') }}
                </button>
                <ContactSuggestions
                    v-show="listOpen"
                    id="dial-suggestions"
                    :options="options"
                    :active="active"
                    :query="destination"
                    :label="$t('dialPanel.sugestoes', { name: from?.name ?? '' })"
                    @choose="choose"
                    @hover="(i) => (active = i)"
                />
            </div>

            <div class="actions">
                <button
                    class="btn ghost headers-toggle"
                    type="button"
                    :class="{ set: headerCount }"
                    :aria-expanded="showHeaders"
                    aria-controls="extra-headers-box"
                    :title="$t('dialPanel.cabecalhos_dica')"
                    @click="showHeaders = !showHeaders"
                >
                    {{ headerCount ? $t('dialPanel.cabecalhos_n', { n: headerCount }) : $t('dialPanel.cabecalhos') }}
                </button>
            </div>

            <div v-if="showHeaders" id="extra-headers-box" class="headers">
                <label class="label" for="extra-headers">{{ $t('dialPanel.cabecalhos_extras') }}</label>
                <textarea
                    id="extra-headers"
                    v-model="headersText"
                    class="input mono"
                    rows="2"
                    :placeholder="$t('dialPanel.cabecalho_exemplo')"
                ></textarea>
            </div>

            <p v-if="from && !registered" class="hint">
                {{ $t('dialPanel.registre_para_ligar', { name: from.name }) }}
            </p>
            <p v-if="error" class="error" role="alert">{{ error }}</p>

            <div class="keypad" role="group" :aria-label="$t('dialPanel.teclado_rotulo')">
                <button
                    v-for="[k, letters] in keys"
                    :key="k"
                    class="key"
                    type="button"
                    :aria-label="k === '0' ? $t('dialPanel.tecla_zero') : k"
                    @pointerdown="keyDown(k)"
                    @pointerleave="cancelPlus"
                    @click="keyUp(k)"
                >
                    <b>{{ k }}</b>
                    <small aria-hidden="true">{{ letters }}</small>
                </button>
            </div>
            <p v-if="dtmfTarget" class="hint dtmf" role="status">
                {{ $t('dialPanel.teclado_dtmf', { remote: dtmfTarget.remoteName || dtmfTarget.remote }) }}
            </p>

            <details v-if="from && isSimulated(from)" class="mock-help">
                <summary>{{ $t('dialPanel.numeros_do_pbx_simulado') }}</summary>
                <ul>
                    <li v-for="m in MOCK_NUMBERS" :key="m.number">
                        <b class="mono">{{ m.number }}</b> {{ m.description }}
                    </li>
                </ul>
            </details>
        </div>
    </div>
</template>

<style scoped>
.dial {
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.head {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
    flex: none;
}
.head h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* A cor da conta atual, num quadradinho; o estado fica no avatar da barra. */
.swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--account, var(--muted));
    flex: none;
}
.body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

/* Campo do número e Ligar na mesma linha; a lista de sugestões abre embaixo dos dois. */
.dial-row {
    position: relative;
    display: flex;
    gap: 6px;
}
.field {
    position: relative;
    flex: 1;
    min-width: 0;
}
.number {
    width: 100%;
    height: 40px;
    padding: 0 30px 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    font-family: var(--mono);
    font-size: 15px;
    outline: none;
    transition:
        border-color 120ms,
        box-shadow 120ms;
}
.number::placeholder {
    font-family: var(--sans);
    font-size: 12.5px;
    color: var(--muted);
}
.number:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--focus-ring);
}
.clear {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
}
.clear:hover {
    background: var(--panel-2);
    color: var(--fg);
}
.clear :deep(.icon) {
    width: 16px;
    height: 16px;
}

.actions {
    display: flex;
    justify-content: flex-end;
    margin-top: -4px;
}
.call {
    min-height: 40px;
    padding: 0 12px;
    font-weight: 600;
}
.call :deep(.icon) {
    width: 15px;
    height: 15px;
}
.headers-toggle {
    min-height: 22px;
    padding: 0 6px;
    font-size: 11.5px;
    color: var(--muted);
}
.headers-toggle[aria-expanded='true'],
.headers-toggle.set {
    color: var(--accent-text);
}
.headers {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

/* Teclado: 3 × 4, baixo e largo, para caber inteiro na coluna sem rolar. */
.keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    margin-top: 2px;
}
.key {
    height: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--fg);
    cursor: pointer;
    transition:
        background 100ms,
        border-color 100ms,
        transform 60ms;
}
.key:hover {
    background: var(--panel-2);
    border-color: var(--line-strong);
}
.key:active {
    transform: scale(0.96);
    background: var(--selected);
}
.key b {
    font-size: 17px;
    font-weight: 500;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}
.key small {
    min-height: 10px;
    font-size: 8.5px;
    line-height: 1;
    letter-spacing: 0.14em;
    color: var(--muted);
}
@media (prefers-reduced-motion: reduce) {
    .key {
        transition: none;
    }
}

.hint,
.error {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
}
.error {
    color: var(--bad-text);
}
.hint.dtmf {
    color: var(--accent-text);
}
.mock-help {
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
}
.mock-help summary {
    cursor: pointer;
}
.mock-help ul {
    margin: 6px 0 0;
    padding-left: 16px;
}
.mock-help b {
    color: var(--fg);
}
</style>
