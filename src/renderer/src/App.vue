<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Account, CertificateErrorEvent } from '@shared/types'
import { useAccountsStore } from './stores/accounts'
import { useCallsStore } from './stores/calls'
import { useLogStore } from './stores/log'
import AccountsPane from './components/AccountsPane.vue'
import DialerPane from './components/DialerPane.vue'
import CallCard from './components/CallCard.vue'
import LogPane from './components/LogPane.vue'
import AccountForm from './components/AccountForm.vue'
import ImportExportDialog from './components/ImportExportDialog.vue'
import HealthDialog from './components/HealthDialog.vue'

const accounts = useAccountsStore()
const calls = useCallsStore()
const log = useLogStore()

const editing = ref<Account | null>(null)
const showImportExport = ref(false)
const healthFor = ref<string | null>(null)
const certError = ref<CertificateErrorEvent | null>(null)
const dialer = ref<InstanceType<typeof DialerPane> | null>(null)

const pbxCount = computed(() => accounts.groups.length)
const registeredCount = computed(() => accounts.accounts.filter((a) => accounts.statusOf(a.id).state === 'registered').length)

function newAccount(): void {
  editing.value = accounts.newAccount()
}

async function trustHost(): Promise<void> {
  if (!certError.value) return
  const host = certError.value.host
  const settings = await window.iris.settings.load()
  settings.trustedHosts = [...new Set([...settings.trustedHosts, host])]
  await window.iris.settings.save(settings)
  log.add(null, 'warn', 'event', `Certificado de ${host} aceito manualmente`)
  certError.value = null
  // Refaz o registro das contas que usam esse host.
  for (const account of accounts.accounts) {
    let accountHost = ''
    try {
      accountHost = new URL(account.wssUrl).hostname
    } catch {
      continue
    }
    if (!account.simulated && accountHost === host) void accounts.register(account.id)
  }
}

// Atalhos de teclado (ver especificação, seção Interface).
function onKey(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return
  const selectedCall = calls.calls.find((c) => c.id === calls.selectedId && c.state !== 'ended')
  const key = event.key.toLowerCase()
  if (key === 'l') dialer.value?.focus()
  else if (key === 'enter' && calls.ringingIncoming[0]) void calls.answer(calls.ringingIncoming[0].id)
  else if (key === 'e' && selectedCall) void calls.hangup(selectedCall.id)
  else if (key === 'm' && selectedCall) calls.toggleMute(selectedCall.id)
  else if (key === 'h' && selectedCall) void calls.toggleHold(selectedCall.id)
  else if (/^[1-9]$/.test(key)) {
    const target = accounts.accounts[Number(key) - 1]
    if (target) accounts.selectedId = target.id
  } else return
  event.preventDefault()
}

let offCert: (() => void) | undefined
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  offCert = window.iris.onCertificateError((event) => {
    certError.value = event
    log.add(null, 'error', 'event', `Certificado TLS recusado para ${event.host}: ${event.error}`)
  })
  const info = await window.iris.appInfo()
  log.add(null, 'info', 'event', `Íris ${info.version} · Electron ${info.electron} · Chromium ${info.chrome} · ${info.platform}`)
  await accounts.load()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  offCert?.()
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <span class="brand">Íris</span>
      <span class="summary mono tabular">
        {{ accounts.accounts.length }} contas · {{ pbxCount }} PBX · {{ registeredCount }} registradas · {{ calls.active.length }} chamadas
      </span>
      <span class="spacer"></span>
      <button class="btn small" @click="accounts.registerAll()">Registrar todas</button>
      <button class="btn small" @click="accounts.unregisterAll()">Desregistrar todas</button>
      <button class="btn small" @click="showImportExport = true">Importar / Exportar</button>
    </header>

    <div v-if="certError" class="banner" role="alert">
      <span>
        O certificado TLS de <b class="mono">{{ certError.host }}</b> foi recusado ({{ certError.error }}). Se este PBX é
        seu e usa certificado autoassinado, você pode confiar nele.
      </span>
      <button class="btn small stop" @click="trustHost">Confiar neste host</button>
      <button class="btn small" @click="certError = null">Ignorar</button>
    </div>

    <div v-if="accounts.loaded && !accounts.encryptionAvailable" class="banner warn" role="status">
      Este sistema não oferece criptografia de senhas. As senhas ficam só na memória e precisam ser digitadas de novo
      depois de reiniciar o app.
    </div>

    <main class="columns">
      <AccountsPane @new="newAccount" @edit="(a) => (editing = a)" @health="(id) => (healthFor = id)" />

      <section class="center">
        <DialerPane ref="dialer" />
        <div class="calls-head">
          <span class="label">Chamadas</span>
          <span class="label tabular">{{ calls.active.length }} ativas</span>
        </div>
        <div class="calls">
          <CallCard v-for="call in calls.calls" :key="call.id" :call="call" />
          <p v-if="calls.calls.length === 0" class="empty">
            Nenhuma chamada. Escolha uma conta registrada e disque um número, ou use um dos atalhos acima.
          </p>
        </div>
      </section>

      <LogPane />
    </main>

    <AccountForm v-if="editing" :account="editing" @close="editing = null" />
    <ImportExportDialog v-if="showImportExport" @close="showImportExport = false" />
    <HealthDialog v-if="healthFor" :account-id="healthFor" @close="healthFor = null" />
  </div>
</template>

<style scoped>
.shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
.brand {
  font-weight: 700;
  letter-spacing: 0.01em;
}
.summary {
  color: var(--muted);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(240, 103, 94, 0.12);
  border-bottom: 1px solid rgba(240, 103, 94, 0.4);
}
.banner span {
  flex: 1;
}
.banner.warn {
  background: rgba(240, 177, 62, 0.1);
  border-bottom-color: rgba(240, 177, 62, 0.4);
}
.columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(380px, 1fr) minmax(340px, 0.9fr);
}
.center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--line);
}
.calls-head {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px 6px;
}
.calls {
  flex: 1;
  overflow: auto;
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty {
  color: var(--muted);
  margin: 8px 0;
}
</style>
