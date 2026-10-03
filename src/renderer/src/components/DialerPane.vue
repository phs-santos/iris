<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { MOCK_NUMBERS } from '@renderer/sip/mock-engine'

const accounts = useAccountsStore()
const calls = useCallsStore()
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
  return [...peers, ...account.quickDials]
})

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

async function dial(number = destination.value): Promise<void> {
  error.value = ''
  if (!from.value || !number.trim()) return
  const headers = headersText.value
    .split('\n')
    .map((h) => h.trim())
    .filter(Boolean)
  const bad = headers.find((h) => !/^[A-Za-z0-9-]+:\s*.+$/.test(h))
  if (bad) {
    error.value = `Cabeçalho inválido: "${bad}". Use o formato Nome: valor`
    return
  }
  try {
    await calls.dial(from.value.id, number, headers.length ? headers : undefined)
    destination.value = number
  } catch (e) {
    error.value = (e as Error).message
  }
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <section class="dialer">
    <div class="from">
      <span class="label">Discar de</span>
      <select v-model="accounts.selectedId" class="input from-select" aria-label="Conta de origem">
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
        placeholder="Número ou ramal"
        aria-label="Número"
        autocomplete="off"
      />
      <button class="btn go big" type="submit" :disabled="!registered || !destination.trim()">Ligar</button>
    </form>

    <p v-if="from && !registered" class="hint">Registre {{ from.name }} para ligar.</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="chips">
      <button
        v-for="s in shortcuts"
        :key="s.label + s.number"
        class="chip mono"
        type="button"
        :disabled="!registered"
        :title="`Ligar para ${s.number}`"
        @click="dial(s.number)"
      >
        {{ s.number }} <span>{{ s.label }}</span>
      </button>
      <button class="chip mono" type="button" @click="showKeypad = !showKeypad">teclado</button>
      <button class="chip mono" type="button" @click="showHeaders = !showHeaders">cabeçalhos SIP</button>
    </div>

    <div v-if="showKeypad" class="keypad">
      <button v-for="k in keys" :key="k" class="btn mono" type="button" @click="destination += k">{{ k }}</button>
    </div>

    <div v-if="showHeaders" class="headers">
      <label class="label" for="extra-headers">Cabeçalhos extras no INVITE, um por linha</label>
      <textarea
        id="extra-headers"
        v-model="headersText"
        class="input mono"
        rows="2"
        placeholder="X-Test-Id: cenario-42"
      ></textarea>
    </div>

    <details v-if="from?.simulated" class="mock-help">
      <summary>Números do PBX simulado</summary>
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
  display: grid;
  grid-template-columns: repeat(3, 56px);
  gap: 6px;
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
</style>
