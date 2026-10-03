<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { describeStatus } from '@renderer/lib/accounts'

type Check = { ok: boolean | null; text: string; hint?: string }

const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ close: [] }>()
const accounts = useAccountsStore()
const account = computed(() => accounts.byId(props.accountId))
const checks = ref<Check[]>([])
const running = ref(false)
const checkedAt = ref('')

/** Verificações de ambiente e da conta (RF-24 e RF-25). */
async function run(): Promise<void> {
  const a = account.value
  if (!a) return
  running.value = true
  const list: Check[] = []

  const status = accounts.statusOf(a.id)
  list.push({
    ok: status.state === 'registered',
    text: `Registro: ${describeStatus(status)}`,
    hint: status.state === 'error' && status.code === 401 ? 'Confira a senha e o usuário de autenticação.' : undefined
  })

  const health = await accounts.checkHealth(a.id)
  if (health) {
    list.push({ ok: health.websocketConnected, text: health.websocketConnected ? 'WebSocket conectado' : 'WebSocket desconectado' })
    list.push({
      ok: health.latencyMs !== undefined,
      text: health.latencyMs !== undefined ? `OPTIONS respondeu em ${health.latencyMs} ms` : `OPTIONS sem resposta${health.error ? `: ${health.error}` : ''}`
    })
  } else {
    list.push({ ok: null, text: 'Registre a conta para medir WebSocket e OPTIONS' })
  }

  let micOk = false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    micOk = true
  } catch {
    micOk = false
  }
  list.push({
    ok: micOk,
    text: micOk ? 'Microfone liberado' : 'Microfone indisponível',
    hint: micOk ? undefined : 'Conecte um microfone e permita o acesso nas configurações de privacidade do sistema.'
  })

  const devices = await navigator.mediaDevices.enumerateDevices()
  const outputs = devices.filter((d) => d.kind === 'audiooutput').length
  list.push({ ok: outputs > 0, text: `${outputs} saídas de áudio encontradas` })

  if (!a.simulated) {
    const hasTurn = /turns?:/i.test(a.iceServers)
    list.push({
      ok: hasTurn ? true : null,
      text: hasTurn ? 'Servidor TURN configurado' : 'Sem servidor TURN',
      hint: hasTurn ? undefined : 'Atrás de NAT simétrico a chamada pode ficar muda. Adicione um TURN em Avançado.'
    })
    list.push({
      ok: a.wssUrl.startsWith('wss://'),
      text: a.wssUrl.startsWith('wss://') ? 'Transporte seguro (wss://)' : 'Transporte sem TLS (ws://)',
      hint: a.wssUrl.startsWith('wss://') ? undefined : 'Muitos PBX exigem WSS para WebRTC.'
    })
  }

  checks.value = list
  checkedAt.value = new Date().toLocaleTimeString('pt-BR')
  running.value = false
}

async function copyReport(): Promise<void> {
  const text = [
    `Saúde de ${account.value?.name} (${account.value?.extension}@${account.value?.domain}) às ${checkedAt.value}`,
    ...checks.value.map((c) => `${c.ok === true ? '✓' : c.ok === false ? '✗' : '!'} ${c.text}${c.hint ? ` (${c.hint})` : ''}`)
  ].join('\n')
  await navigator.clipboard.writeText(text).catch(() => undefined)
}

onMounted(run)
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-labelledby="health-title">
      <header>
        <h2 id="health-title">Saúde · {{ account?.name }}</h2>
        <span class="label">{{ checkedAt }}</span>
        <button class="btn small ghost" aria-label="Fechar" @click="emit('close')">✕</button>
      </header>
      <div class="body">
        <p v-if="running && checks.length === 0" class="muted">Verificando…</p>
        <ul class="checks">
          <li v-for="(c, i) in checks" :key="i">
            <span class="mark" :class="c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'warn'">
              {{ c.ok === true ? '✓' : c.ok === false ? '✗' : '!' }}
            </span>
            <div>
              <div>{{ c.text }}</div>
              <div v-if="c.hint" class="hint">{{ c.hint }}</div>
            </div>
          </li>
        </ul>
      </div>
      <footer>
        <button class="btn" @click="copyReport">Copiar relatório</button>
        <button class="btn primary" :disabled="running" @click="run">Verificar de novo</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checks li {
  display: flex;
  gap: 10px;
}
.mark {
  width: 18px;
  font-family: var(--mono);
  text-align: center;
}
.mark.ok {
  color: var(--ok);
}
.mark.bad {
  color: var(--bad);
}
.mark.warn {
  color: var(--warn);
}
.hint,
.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
