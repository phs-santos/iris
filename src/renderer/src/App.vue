<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Account, CertificateErrorEvent, UpdateChannel, UpdateInfo, WindowMode } from '@shared/types'
import { useAccountsStore } from './stores/accounts'
import { useCallsStore } from './stores/calls'
import { useLogStore } from './stores/log'
import AccountsPane from './components/AccountsPane.vue'
import DialerPane from './components/DialerPane.vue'
import CallCard from './components/CallCard.vue'
import LogPane from './components/LogPane.vue'
import AccountForm from './components/AccountForm.vue'
import HealthDialog from './components/HealthDialog.vue'
import SettingsDialog from './components/settings/SettingsDialog.vue'
import AiDialog from './components/AiDialog.vue'
import GuideDialog from './components/GuideDialog.vue'
import { useAiStore } from './stores/ai'
import ScenariosPane from './components/ScenariosPane.vue'
import PhoneView from './components/PhoneView.vue'
import { useScenariosStore } from './stores/scenarios'
import { useDevicesStore } from './stores/devices'
import { usePreferencesStore, type SettingsSection } from './stores/preferences'
import logoMark from './assets/logo-mark.svg'

const accounts = useAccountsStore()
const calls = useCallsStore()
const log = useLogStore()
const devices = useDevicesStore()
const scenarios = useScenariosStore()
const ai = useAiStore()
const prefs = usePreferencesStore()
const centerTab = ref<'phone' | 'scenarios'>('phone')
/** Sempre abre na Bancada (decisão do usuário em 04/10/2026); o Telefone vale até trocar de novo. */
const mode = ref<WindowMode>('bench')
const phone = ref<InstanceType<typeof PhoneView> | null>(null)

function setMode(next: WindowMode): void {
    mode.value = next
    void window.iris.setWindowMode(next)
}

const editing = ref<Account | null>(null)
/** Seção aberta da tela de Configurações; null com a tela fechada. */
const settingsAt = ref<SettingsSection | null>(null)
const showGuide = ref(false)
const update = ref<UpdateInfo | null>(null)
// O botão da barra avisa quando há versão nova para baixar ou já baixada (RF-35).
const updatePending = computed(() => ['available', 'ready'].includes(update.value?.status.state ?? ''))
const healthFor = ref<string | null>(null)
const certError = ref<CertificateErrorEvent | null>(null)
const dialer = ref<InstanceType<typeof DialerPane> | null>(null)

const pbxCount = computed(() => accounts.groups.length)
const registeredCount = computed(
    () => accounts.accounts.filter((a) => accounts.statusOf(a.id).state === 'registered').length
)

function newAccount(): void {
    editing.value = accounts.newAccount({ displayName: prefs.profile.name ?? '' })
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

/** Abre a tela já procurando: o resultado guardado pode ser de horas atrás (ex.: erro de quando não havia rede). */
function openUpdate(): void {
    settingsAt.value = 'update'
    if (['idle', 'up-to-date', 'error'].includes(update.value?.status.state ?? '')) void window.iris.update.check()
}

async function setUpdateChannel(channel: UpdateChannel): Promise<void> {
    await window.iris.update.setChannel(channel)
    update.value = await window.iris.update.info()
    void window.iris.update.check()
}

// Atalhos de teclado (ver especificação, seção Interface).
function onKey(event: KeyboardEvent): void {
    if (event.key === 'F1') {
        showGuide.value = true
        return event.preventDefault()
    }
    const mod = event.ctrlKey || event.metaKey
    if (!mod) return
    if (event.key === ',') {
        settingsAt.value ??= 'profile'
        return event.preventDefault()
    }
    const selectedCall = calls.calls.find((c) => c.id === calls.selectedId && c.state !== 'ended')
    const key = event.key.toLowerCase()
    if (key === 'l') {
        centerTab.value = 'phone'
        void nextTick(() => (mode.value === 'phone' ? phone.value : dialer.value)?.focus())
    } else if (key === 'enter' && calls.ringingIncoming[0]) void calls.answer(calls.ringingIncoming[0].id)
    else if (key === 'e' && selectedCall) void calls.hangup(selectedCall.id)
    else if (key === 'm' && selectedCall) calls.toggleMute(selectedCall.id)
    else if (key === 'h' && selectedCall) void calls.toggleHold(selectedCall.id)
    else if (/^[1-9]$/.test(key)) {
        const target = accounts.accounts[Number(key) - 1]
        if (target) accounts.selectedId = target.id
    } else return
    event.preventDefault()
}

// Ao trazer as senhas do formato antigo, o macOS pode pedir a senha de login uma última vez (RNF-07).
const VAULT_NOTICE_DELAY_MS = 1500
const vaultSlow = ref(false)
const waitingVault = computed(() => vaultSlow.value && accounts.migratingSecrets)
/** Espera a tela ser desenhada; o tempo limite cobre a janela que ainda não apareceu. */
const firstPaint = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        setTimeout(resolve, 500)
    })

let offCert: (() => void) | undefined
let offUpdate: (() => void) | undefined
onMounted(async () => {
    window.addEventListener('keydown', onKey)
    offCert = window.iris.onCertificateError((event) => {
        certError.value = event
        log.add(null, 'error', 'event', `Certificado TLS recusado para ${event.host}: ${event.error}`)
    })
    offUpdate = window.iris.update.onStatus((status) => {
        if (!update.value) return
        const before = update.value.status.state
        update.value = { ...update.value, status }
        if (status.state === 'available' && before !== 'available')
            log.add(null, 'info', 'event', `Versão ${status.version} disponível. Abra "Atualização" para baixar.`)
    })
    // Sem esperar e sem deixar um erro daqui parar o resto: as contas não dependem da atualização.
    void window.iris.update
        .info()
        .then((value) => (update.value = value))
        .catch((error) => log.add(null, 'warn', 'event', `Atualização indisponível: ${error.message}`))
    const info = await window.iris.appInfo()
    log.add(
        null,
        'info',
        'event',
        `Íris ${info.version} · Electron ${info.electron} · Chromium ${info.chrome} · ${info.platform}`
    )
    await prefs.load()
    await devices.load()
    // As contas leem as senhas: a interface aparece antes, com um aviso se demorar.
    await firstPaint()
    setTimeout(() => (vaultSlow.value = true), VAULT_NOTICE_DELAY_MS)
    await accounts.load()
    const main = prefs.profile.mainAccountId
    if (main && accounts.accounts.some((a) => a.id === main)) accounts.selectedId = main
    await scenarios.load()
})
onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    offCert?.()
    offUpdate?.()
})
</script>

<template>
    <div class="shell">
        <header v-if="mode === 'bench'" class="topbar">
            <span class="brand"><img class="brand-mark" :src="logoMark" alt="" />Íris</span>
            <span class="summary mono tabular">
                {{ accounts.accounts.length }} contas · {{ pbxCount }} PBX · {{ registeredCount }} registradas ·
                {{ calls.active.length }} chamadas
            </span>
            <span class="spacer"></span>
            <button class="btn small" title="Só o discador e a chamada, numa janela estreita" @click="setMode('phone')">
                Modo Telefone
            </button>
            <button v-if="updatePending" class="btn small primary" @click="openUpdate">Atualização disponível</button>
            <button class="btn small" @click="showGuide = true">Guia</button>
            <button class="btn small" title="Configurações (Ctrl/Cmd+,)" @click="settingsAt = 'profile'">
                Configurações
            </button>
        </header>

        <div v-if="certError" class="banner" role="alert">
            <span>
                O certificado TLS de <b class="mono">{{ certError.host }}</b> foi recusado ({{ certError.error }}). Se
                este PBX é seu e usa certificado autoassinado, você pode confiar nele.
            </span>
            <button class="btn small stop" @click="trustHost">Confiar neste host</button>
            <button class="btn small" @click="certError = null">Ignorar</button>
        </div>

        <div v-if="waitingVault" class="banner warn" role="status">
            Trazendo as senhas salvas por uma versão anterior. Se o sistema pedir a senha de login (no macOS, o pedido
            das Chaves), digite e confirme; isso acontece só uma vez. As contas aparecem em seguida.
        </div>

        <div v-if="accounts.secretsProblem" class="banner warn" role="status">
            <span>{{ accounts.secretsProblem }}</span>
            <button class="btn small" @click="accounts.secretsProblem = null">Entendi</button>
        </div>

        <PhoneView
            v-if="mode === 'phone'"
            ref="phone"
            class="phone-mode"
            @bench="setMode('bench')"
            @settings="settingsAt = 'profile'"
        />
        <main v-else class="columns">
            <AccountsPane @new="newAccount" @edit="(a) => (editing = a)" @health="(id) => (healthFor = id)" />

            <section class="center">
                <div class="center-tabs" role="tablist" aria-label="Área central">
                    <button
                        role="tab"
                        class="ctab"
                        :class="{ on: centerTab === 'phone' }"
                        :aria-selected="centerTab === 'phone'"
                        @click="centerTab = 'phone'"
                    >
                        Telefone
                        <span v-if="calls.active.length" class="count tabular">{{ calls.active.length }}</span>
                    </button>
                    <button
                        role="tab"
                        class="ctab"
                        :class="{ on: centerTab === 'scenarios' }"
                        :aria-selected="centerTab === 'scenarios'"
                        @click="centerTab = 'scenarios'"
                    >
                        Cenários
                        <span v-if="scenarios.running" class="count run">rodando</span>
                    </button>
                </div>
                <!-- Chamada recebida em destaque, acima de tudo, em qualquer aba (RF-10). -->
                <div
                    v-for="call in calls.ringingIncoming"
                    :key="call.id"
                    class="incoming"
                    role="region"
                    :aria-label="`Chamada recebida de ${call.remoteName || call.remote}`"
                >
                    <span class="ring-dot" aria-hidden="true"></span>
                    <span class="incoming-text">
                        <b>{{ call.remoteName || call.remote }}</b>
                        <span class="mono">{{ call.remote }} → {{ accounts.nameOf(call.accountId) }}</span>
                    </span>
                    <button class="btn go" @click="calls.answer(call.id)">Atender</button>
                    <button class="btn stop" @click="calls.reject(call.id)">Recusar</button>
                </div>
                <template v-if="centerTab === 'phone'">
                    <DialerPane ref="dialer" />
                    <div class="calls-head">
                        <span class="label">Chamadas</span>
                        <span class="label tabular">{{ calls.active.length }} ativas</span>
                    </div>
                    <div class="calls">
                        <CallCard v-for="call in calls.calls" :key="call.id" :call="call" />
                        <p v-if="calls.calls.length === 0" class="empty">
                            Nenhuma chamada. Escolha uma conta registrada e disque um número, ou use um dos atalhos
                            acima.
                        </p>
                    </div>
                </template>
                <ScenariosPane v-else />
            </section>

            <LogPane />
        </main>

        <AccountForm v-if="editing" :account="editing" @close="editing = null" />
        <HealthDialog v-if="healthFor" :account-id="healthFor" @close="healthFor = null" />
        <GuideDialog v-if="showGuide" @close="showGuide = false" />
        <AiDialog v-if="ai.ask" :ask="ai.ask" @close="ai.ask = null" />
        <SettingsDialog
            v-if="settingsAt"
            :section="settingsAt"
            :update="update"
            @close="settingsAt = null"
            @channel="setUpdateChannel"
        />
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
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    letter-spacing: 0.01em;
}
.brand-mark {
    height: 14px;
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
.phone-mode {
    flex: 1;
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
.incoming {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--accent) 14%, var(--panel));
}
.incoming-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
}
.incoming-text .mono {
    font-size: 11px;
    color: var(--muted);
}
.ring-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    flex: none;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent);
}
@media (prefers-reduced-motion: no-preference) {
    .ring-dot {
        animation: pulse 1.2s ease-in-out infinite;
    }
}
.center-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 14px 0;
    border-bottom: 1px solid var(--line);
}
.ctab {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    padding: 6px 12px 8px;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    display: inline-flex;
    gap: 6px;
    align-items: center;
}
.ctab.on {
    color: var(--fg);
    border-bottom-color: var(--accent);
}
.count {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--raise);
    color: var(--fg);
}
.count.run {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
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
