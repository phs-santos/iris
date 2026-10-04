<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
import HistoryPane from './components/HistoryPane.vue'
import { useHistoryStore } from './stores/history'
import { useMonitorStore } from './stores/monitor'
import { useScenariosStore } from './stores/scenarios'
import { useDevicesStore } from './stores/devices'
import { usePreferencesStore, type SettingsSection } from './stores/preferences'
import logoMark from './assets/logo-mark.svg'
import { accountHost } from './lib/accounts'

const accounts = useAccountsStore()
const calls = useCallsStore()
const log = useLogStore()
const devices = useDevicesStore()
const scenarios = useScenariosStore()
const ai = useAiStore()
const prefs = usePreferencesStore()
const history = useHistoryStore()
const centerTab = ref<'phone' | 'scenarios' | 'history'>('phone')
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

// Estado geral para o ícone da bandeja (RF-33).
watch(
    () => ({
        accounts: accounts.accounts.length,
        registered: registeredCount.value,
        errors: accounts.accounts.filter((a) => accounts.statusOf(a.id).state === 'error').length,
        ringing: calls.ringingIncoming.length,
        calls: calls.active.length - calls.ringingIncoming.length
    }),
    (counts) => window.iris.setTray(counts),
    { deep: true }
)

function newAccount(): void {
    editing.value = accounts.newAccount({ displayName: prefs.profile.name ?? '' })
}

async function trustHost(): Promise<void> {
    if (!certError.value) return
    const host = certError.value.host
    const settings = await window.iris.settings.load()
    await window.iris.settings.update({ trustedHosts: [...new Set([...settings.trustedHosts, host])] })
    log.add(null, 'warn', 'event', t('app.certificado_de_aceito_manualmente', { host }))
    certError.value = null
    // Refaz o registro das contas que usam esse host.
    for (const account of accounts.accounts) {
        if (accountHost(account) === host) void accounts.register(account.id)
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
        log.add(
            null,
            'error',
            'event',
            t('app.certificado_tls_recusado_para', { host: event.host, error: event.error })
        )
    })
    offUpdate = window.iris.update.onStatus((status) => {
        if (!update.value) return
        const before = update.value.status.state
        update.value = { ...update.value, status }
        if (status.state === 'available' && before !== 'available')
            log.add(
                null,
                'info',
                'event',
                t('app.versao_disponivel_abra_atualizacao_para', { version: status.version })
            )
    })
    // Sem esperar e sem deixar um erro daqui parar o resto: as contas não dependem da atualização.
    void window.iris.update
        .info()
        .then((value) => (update.value = value))
        .catch((error) => log.add(null, 'warn', 'event', t('app.atualizacao_indisponivel', { message: error.message })))
    const info = await window.iris.appInfo()
    log.add(
        null,
        'info',
        'event',
        t('app.iris_electron_chromium', {
            version: info.version,
            electron: info.electron,
            chrome: info.chrome,
            platform: info.platform
        })
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
    useMonitorStore().start()
    await history.load()
    await accounts.refreshProblems()
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
            <span class="brand"><img class="brand-mark" :src="logoMark" alt="" />{{ $t('app.iris') }}</span>
            <span class="summary mono tabular">
                {{
                    $t('app.contas_pbx_registradas_chamadas', {
                        length: accounts.accounts.length,
                        pbxCount,
                        registeredCount,
                        length2: calls.active.length
                    })
                }}
            </span>
            <span class="spacer"></span>
            <button class="btn small" :title="$t('app.so_o_discador_e_a')" @click="setMode('phone')">
                {{ $t('app.modo_telefone') }}
            </button>
            <button v-if="updatePending" class="btn small primary" @click="openUpdate">
                {{ $t('app.atualizacao_disponivel') }}
            </button>
            <button class="btn small" @click="showGuide = true">{{ $t('app.guia') }}</button>
            <button class="btn small" :title="$t('app.configuracoes_ctrl_cmd')" @click="settingsAt = 'profile'">
                {{ $t('app.configuracoes') }}
            </button>
        </header>

        <div v-if="certError" class="banner" role="alert">
            <span>
                {{ $t('app.o_certificado_tls_de') }} <b class="mono">{{ certError.host }}</b>
                {{ $t('app.foi_recusado_se_este_pbx', { error: certError.error }) }}
            </span>
            <button class="btn small stop" @click="trustHost">{{ $t('app.confiar_neste_host') }}</button>
            <button class="btn small" @click="certError = null">{{ $t('app.ignorar') }}</button>
        </div>

        <div v-if="waitingVault" class="banner warn" role="status">
            {{ $t('app.trazendo_as_senhas_salvas_por') }}
        </div>

        <div v-if="accounts.secretsProblem" class="banner warn" role="status">
            <span>{{ accounts.secretsProblem }}</span>
            <button class="btn small" @click="accounts.secretsProblem = null">{{ $t('app.entendi') }}</button>
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
                <div class="center-tabs" role="tablist" :aria-label="$t('app.area_central')">
                    <button
                        role="tab"
                        class="ctab"
                        :class="{ on: centerTab === 'phone' }"
                        :aria-selected="centerTab === 'phone'"
                        @click="centerTab = 'phone'"
                    >
                        {{ $t('app.telefone') }}
                        <span v-if="calls.active.length" class="count tabular">{{ calls.active.length }}</span>
                    </button>
                    <button
                        role="tab"
                        class="ctab"
                        :class="{ on: centerTab === 'scenarios' }"
                        :aria-selected="centerTab === 'scenarios'"
                        @click="centerTab = 'scenarios'"
                    >
                        {{ $t('app.cenarios') }}
                        <span v-if="scenarios.running" class="count run">{{ $t('app.rodando') }}</span>
                    </button>
                    <button
                        role="tab"
                        class="ctab"
                        :class="{ on: centerTab === 'history' }"
                        :aria-selected="centerTab === 'history'"
                        @click="centerTab = 'history'"
                    >
                        {{ $t('app.historico') }}
                    </button>
                </div>
                <!-- Chamada recebida em destaque, acima de tudo, em qualquer aba (RF-10). -->
                <div
                    v-for="call in calls.ringingIncoming"
                    :key="call.id"
                    class="incoming"
                    role="region"
                    :aria-label="$t('app.chamada_recebida_de', { p: call.remoteName || call.remote })"
                >
                    <span class="ring-dot" aria-hidden="true"></span>
                    <span class="incoming-text">
                        <b>{{ call.remoteName || call.remote }}</b>
                        <span class="mono">{{ call.remote }} → {{ accounts.nameOf(call.accountId) }}</span>
                    </span>
                    <button class="btn go" @click="calls.answer(call.id)">{{ $t('app.atender') }}</button>
                    <button class="btn stop" @click="calls.reject(call.id)">{{ $t('app.recusar') }}</button>
                </div>
                <template v-if="centerTab === 'phone'">
                    <DialerPane ref="dialer" />
                    <div class="calls-head">
                        <span class="label">{{ $t('app.chamadas') }}</span>
                        <span class="label tabular">{{ $t('app.ativas', { length: calls.active.length }) }}</span>
                    </div>
                    <div class="calls">
                        <CallCard v-for="call in calls.calls" :key="call.id" :call="call" />
                        <p v-if="calls.calls.length === 0" class="empty">
                            {{ $t('app.nenhuma_chamada_escolha_uma_conta') }}
                        </p>
                    </div>
                </template>
                <HistoryPane v-else-if="centerTab === 'history'" @dialed="centerTab = 'phone'" />
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
