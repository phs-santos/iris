<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { Account } from '@shared/types'
import { useAccountsStore } from '@renderer/stores/accounts'
import { ACCOUNT_COLORS, describeStatus, validateAccount } from '@renderer/lib/accounts'
import { createEngine, type RegStatus } from '@renderer/sip'

const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()
const accounts = useAccountsStore()

const isNew = !accounts.byId(props.account.id)
const form = reactive<Account>(JSON.parse(JSON.stringify(props.account)))
const password = ref('')
const showAdvanced = ref(false)
const errors = ref<Record<string, string>>({})
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
const saving = ref(false)
const quickDialsText = ref(form.quickDials.map((q) => `${q.number} ${q.label}`).join('\n'))

const title = computed(() => (isNew ? 'Nova conta' : `Editar ${props.account.name}`))

async function effectivePassword(): Promise<string> {
  if (password.value) return password.value
  return isNew ? '' : ((await window.bench.secrets.get(form.id)) ?? '')
}

function applyQuickDials(): void {
  form.quickDials = quickDialsText.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [number, ...label] = line.split(/\s+/)
      return { number, label: label.join(' ') || number }
    })
}

async function validate(): Promise<boolean> {
  applyQuickDials()
  errors.value = validateAccount(form, await effectivePassword())
  if (Object.keys(errors.value).some((k) => ['authUsername', 'iceServers'].includes(k))) showAdvanced.value = true
  return Object.keys(errors.value).length === 0
}

/** Registra com os dados do formulário, mostra o resultado e desregistra (RF-05). */
async function testConnection(): Promise<void> {
  testResult.value = null
  if (!(await validate())) return
  testing.value = true
  const engine = createEngine(JSON.parse(JSON.stringify(form)), await effectivePassword())
  try {
    const status = await new Promise<RegStatus>((resolve) => {
      const timer = setTimeout(() => resolve({ state: 'error', reason: 'Sem resposta do PBX em 10 s' }), 10_000)
      engine.on('status', (s) => {
        if (s.state === 'registered' || s.state === 'error') {
          clearTimeout(timer)
          resolve(s)
        }
      })
      void engine.connect()
    })
    testResult.value =
      status.state === 'registered'
        ? { ok: true, text: 'Registrou com sucesso. A conexão de teste já foi encerrada.' }
        : { ok: false, text: `Falhou: ${describeStatus(status)}` }
  } finally {
    await engine.dispose()
    testing.value = false
  }
}

async function save(register: boolean): Promise<void> {
  if (!(await validate())) return
  saving.value = true
  try {
    const copy: Account = JSON.parse(JSON.stringify(form))
    await accounts.save(copy, password.value ? password.value : isNew ? '' : undefined)
    if (register) await accounts.register(copy.id)
    emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="dialog" @submit.prevent="save(true)">
      <header>
        <span class="swatch" :style="{ background: form.color }"></span>
        <h2>{{ title }}</h2>
        <button type="button" class="btn small ghost" aria-label="Fechar" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <div class="grid">
          <label class="field">
            <span class="label">Nome</span>
            <input v-model="form.name" class="input" :class="{ invalid: errors.name }" placeholder="Suporte 1001" />
            <small v-if="errors.name">{{ errors.name }}</small>
          </label>
          <label class="field">
            <span class="label">Ramal</span>
            <input v-model="form.extension" class="input mono" :class="{ invalid: errors.extension }" placeholder="1001" />
            <small v-if="errors.extension">{{ errors.extension }}</small>
          </label>
          <label class="field">
            <span class="label">Domínio SIP</span>
            <input
              v-model="form.domain"
              class="input mono"
              :class="{ invalid: errors.domain }"
              placeholder="pbx.empresa.com"
            />
            <small v-if="errors.domain">{{ errors.domain }}</small>
          </label>
          <label class="field">
            <span class="label">Senha</span>
            <input
              v-model="password"
              type="password"
              class="input mono"
              :class="{ invalid: errors.password }"
              :placeholder="isNew ? '' : 'mantida; digite para trocar'"
              autocomplete="new-password"
            />
            <small v-if="errors.password">{{ errors.password }}</small>
          </label>
          <label class="field wide">
            <span class="label">WebSocket (WSS)</span>
            <input
              v-model="form.wssUrl"
              class="input mono"
              :class="{ invalid: errors.wssUrl }"
              placeholder="wss://pbx.empresa.com:8089/ws"
            />
            <small v-if="errors.wssUrl">{{ errors.wssUrl }}</small>
          </label>
        </div>

        <div class="toggles">
          <label class="check">
            <input v-model="form.simulated" type="checkbox" /> PBX simulado (sem rede)
          </label>
          <label class="check">
            <input v-model="form.autoRegister" type="checkbox" /> Registrar ao abrir o app
          </label>
          <label class="check">
            <input v-model="form.autoAnswer.enabled" type="checkbox" /> Auto-atender após
            <input
              v-model.number="form.autoAnswer.delayMs"
              type="number"
              min="0"
              max="10000"
              step="250"
              class="input mono ms"
              :disabled="!form.autoAnswer.enabled"
              aria-label="Atraso do auto-atender em milissegundos"
            />
            ms
          </label>
          <label class="check">
            <input v-model="form.rawSipLog" type="checkbox" /> Mostrar SIP bruto no log
          </label>
        </div>

        <button type="button" class="btn small ghost toggle-adv" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '▾' : '▸' }} Avançado
        </button>

        <div v-if="showAdvanced" class="grid">
          <label class="field">
            <span class="label">Preset</span>
            <select v-model="form.preset" class="input">
              <option value="asterisk">Asterisk</option>
              <option value="kamailio">Kamailio</option>
              <option value="generic">Genérico</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Biblioteca SIP</span>
            <select v-model="form.provider" class="input">
              <option value="sipjs">SIP.js (padrão)</option>
              <option value="jssip">JsSIP</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Usuário de autenticação</span>
            <input v-model="form.authUsername" class="input mono" placeholder="igual ao ramal" />
          </label>
          <label class="field">
            <span class="label">Nome de exibição</span>
            <input v-model="form.displayName" class="input" placeholder="igual ao ramal" />
          </label>
          <label class="field">
            <span class="label">Modo DTMF</span>
            <select v-model="form.dtmfMode" class="input">
              <option value="auto">Automático</option>
              <option value="sip-info">SIP INFO</option>
              <option value="rtp-event">RTP (RFC 4733)</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Cor</span>
            <div class="colors">
              <button
                v-for="color in ACCOUNT_COLORS"
                :key="color"
                type="button"
                class="color"
                :class="{ on: form.color === color }"
                :style="{ background: color }"
                :aria-label="`Cor ${color}`"
                @click="form.color = color"
              ></button>
            </div>
          </label>
          <label class="field wide">
            <span class="label">STUN / TURN, separados por vírgula</span>
            <input
              v-model="form.iceServers"
              class="input mono"
              placeholder="stun:stun.l.google.com:19302, turn:turn.empresa.com:3478"
            />
          </label>
          <label class="field wide">
            <span class="label">Atalhos de discagem, um por linha: número e descrição</span>
            <textarea v-model="quickDialsText" class="input mono" rows="3" placeholder="8000 URA&#10;*97 correio de voz"></textarea>
          </label>
        </div>

        <p v-if="testResult" class="result" :class="testResult.ok ? 'ok' : 'bad'">{{ testResult.text }}</p>
      </div>

      <footer>
        <button type="button" class="btn" :disabled="testing" @click="testConnection">
          {{ testing ? 'Testando…' : 'Testar conexão' }}
        </button>
        <span class="spacer"></span>
        <button type="button" class="btn" :disabled="saving" @click="save(false)">Salvar</button>
        <button type="submit" class="btn primary" :disabled="saving">Salvar e registrar</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.dialog {
  width: min(620px, 100%);
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.field.wide {
  grid-column: 1 / -1;
}
.field small {
  color: var(--bad);
}
.toggles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ms {
  width: 80px;
  padding: 2px 6px;
}
.toggle-adv {
  align-self: flex-start;
  color: var(--muted);
}
.colors {
  display: flex;
  gap: 6px;
  padding-top: 4px;
}
.color {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.color.on {
  border-color: var(--fg);
}
.result {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
}
.result.ok {
  background: rgba(63, 207, 134, 0.12);
  color: #6fe0a6;
}
.result.bad {
  background: rgba(240, 103, 94, 0.12);
  color: #ff8f86;
}
.spacer {
  flex: 1;
}
</style>
