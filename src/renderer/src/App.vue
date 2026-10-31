<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Account, CertificateErrorEvent, UpdateChannel, UpdateInfo } from '@shared/types'
import { useAccountsStore } from './stores/accounts'
import { useCallsStore } from './stores/calls'
import { useLogStore } from './stores/log'
import IconRail from './components/shell/IconRail.vue'
import AccountPicker from './components/shell/AccountPicker.vue'
import DialPanel from './components/shell/DialPanel.vue'
import CallsPanel from './components/shell/CallsPanel.vue'
import DebugDrawer from './components/shell/DebugDrawer.vue'
import AccountForm from './components/AccountForm.vue'
import SettingsDialog from './components/settings/SettingsDialog.vue'
import GuideDialog from './components/GuideDialog.vue'
import ToastStack from './components/ToastStack.vue'
import ContactsDialog from './components/ContactsDialog.vue'
import { useContactsStore } from './stores/contacts'
import { useServersStore } from './stores/servers'
import { useTagsStore } from './stores/tags'
import { useDevicesStore } from './stores/devices'
import { useDebugStore } from './stores/debug'
import { usePreferencesStore, type SettingsSection } from './stores/preferences'
import { accountHost } from './lib/accounts'

const accounts = useAccountsStore()
const calls = useCallsStore()
const log = useLogStore()
const devices = useDevicesStore()
const prefs = usePreferencesStore()
const editing = ref<Account | null>(null)
/** Seção aberta da tela de Configurações; null com a tela fechada. */
const settingsAt = ref<SettingsSection | null>(null)
const showGuide = ref(false)
const update = ref<UpdateInfo | null>(null)
// O botão da barra avisa quando há versão nova para baixar ou já baixada (RF-35).
const updatePending = computed(() => ['available', 'ready'].includes(update.value?.status.state ?? ''))
const certError = ref<CertificateErrorEvent | null>(null)
const dialer = ref<InstanceType<typeof DialPanel> | null>(null)
const rail = ref<InstanceType<typeof IconRail> | null>(null)
const pickerOpen = ref(false)
/** Janela de contatos aberta: a conta e, vindo de "+ Salvar como contato", o número ou nome digitado. */
const contactsFor = ref<{ accountId: string; prefill?: string } | null>(null)
const debug = useDebugStore()

/** Fecha o seletor e devolve o foco ao avatar, de onde ele foi aberto (RNF-12). */
function closePicker(): void {
    pickerOpen.value = false
    void nextTick(() => rail.value?.focusAvatar())
}

/**
 * Clicar fora do seletor fecha ele, e o clique continua valendo para o que foi clicado (Atender, Ligar...).
 * Por isso é um ouvinte na fase de captura, sem impedir o evento, e não um fundo clicável. O avatar fica de
 * fora: o clique dele já abre e fecha o seletor.
 */
function onPointerOutside(event: PointerEvent): void {
    const target = event.target as Element | null
    if (target?.closest('.picker, [aria-haspopup="dialog"].me')) return
    pickerOpen.value = false
}
watch(pickerOpen, (open) => {
    if (open) document.addEventListener('pointerdown', onPointerOutside, true)
    else document.removeEventListener('pointerdown', onPointerOutside, true)
})

/** Ações do seletor que abrem uma janela: o seletor fecha antes. */
function fromPicker(open: () => void): void {
    pickerOpen.value = false
    open()
}

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
    editing.value = accounts.newAccount()
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

/**
 * Ajustes abrem em Áudio, a primeira seção. Com uma versão nova para baixar ou já baixada (o ponto no ícone de
 * Ajustes), abrem direto em Atualização, que é o que o aviso chamou.
 */
function openSettings(): void {
    if (updatePending.value) openUpdate()
    else settingsAt.value = 'audio'
}

/** O Guia fica no pé dos Ajustes: abre no lugar deles. */
function openGuide(): void {
    settingsAt.value = null
    showGuide.value = true
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
        if (!settingsAt.value) openSettings()
        return event.preventDefault()
    }
    const selectedCall = calls.calls.find((c) => c.id === calls.selectedId && c.state !== 'ended')
    const key = event.key.toLowerCase()
    if (key === 'l') dialer.value?.focus()
    else if (key === 'enter' && calls.ringingIncoming[0]) void calls.answer(calls.ringingIncoming[0].id)
    else if (key === 'e' && selectedCall) void calls.hangup(selectedCall.id)
    else if (key === 'm' && selectedCall) calls.toggleMute(selectedCall.id)
    else if (key === 'h' && selectedCall) void calls.toggleHold(selectedCall.id)
    else if (/^[1-9]$/.test(key)) {
        const target = accounts.accounts[Number(key) - 1]
        if (target) accounts.setCurrent(target.id)
    } else return
    event.preventDefault()
}

/** Espera a tela ser desenhada; o tempo limite cobre a janela que ainda não apareceu. */
const firstPaint = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        setTimeout(resolve, 500)
    })

let offCert: (() => void) | undefined
let offNotification: (() => void) | undefined
let offUpdate: (() => void) | undefined
onMounted(async () => {
    window.addEventListener('keydown', onKey)
    // Atender e Recusar na notificação de chamada recebida.
    offNotification = window.iris.onNotificationAction((callId, action) => {
        if (action === 'answer') void calls.answer(callId)
        else if (action === 'reject') void calls.reject(callId)
        else calls.selectedId = callId
    })
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
    await accounts.load()
    await useContactsStore().load()
    await useServersStore().load()
    // O seletor de contas filtra por etiqueta.
    await useTagsStore().load()
    await accounts.refreshProblems()
})
onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('pointerdown', onPointerOutside, true)
    offCert?.()
    offNotification?.()
    offUpdate?.()
})
</script>

<template>
    <div class="shell">
        <div v-if="certError" class="banner" role="alert">
            <span>
                {{ $t('app.o_certificado_tls_de') }} <b class="mono">{{ certError.host }}</b>
                {{ $t('app.foi_recusado_se_este_pbx', { error: certError.error }) }}
            </span>
            <button class="btn small stop" @click="trustHost">{{ $t('app.confiar_neste_host') }}</button>
            <button class="btn small" @click="certError = null">{{ $t('app.ignorar') }}</button>
        </div>

        <div v-if="accounts.secretsProblem" class="banner warn" role="status">
            <span>{{ accounts.secretsProblem }}</span>
            <button class="btn small" @click="accounts.secretsProblem = null">{{ $t('app.entendi') }}</button>
        </div>

        <!-- Barra de ícones | discar | chamadas | depuração (recolhida numa tira ou aberta). -->
        <main class="workspace">
            <IconRail
                ref="rail"
                :picker-open="pickerOpen"
                :update-pending="updatePending"
                @picker="pickerOpen = !pickerOpen"
                @settings="openSettings"
            />

            <section class="col dial-col" :aria-label="$t('app.discar')">
                <DialPanel
                    ref="dialer"
                    @save-contact="(id, text) => (contactsFor = { accountId: id, prefill: text })"
                />
            </section>

            <section class="col calls-col" :aria-label="$t('app.chamadas')">
                <CallsPanel
                    @save-contact="(id, number) => (contactsFor = { accountId: id, prefill: number })"
                    @contacts="(id) => (contactsFor = { accountId: id })"
                />
            </section>

            <DebugDrawer />

            <template v-if="pickerOpen">
                <div class="shade" aria-hidden="true"></div>
                <AccountPicker
                    @close="closePicker"
                    @new="fromPicker(newAccount)"
                    @edit="(a) => fromPicker(() => (editing = a))"
                    @health="(id) => fromPicker(() => debug.show('health', id))"
                    @contacts="(id) => fromPicker(() => (contactsFor = { accountId: id }))"
                />
            </template>
        </main>

        <AccountForm v-if="editing" :account="editing" @close="editing = null" />
        <ContactsDialog
            v-if="contactsFor"
            :account-id="contactsFor.accountId"
            :prefill="contactsFor.prefill"
            @close="contactsFor = null"
        />
        <GuideDialog v-if="showGuide" @close="showGuide = false" />
        <ToastStack />
        <SettingsDialog
            v-if="settingsAt"
            :section="settingsAt"
            :update="update"
            @close="settingsAt = null"
            @channel="setUpdateChannel"
            @guide="openGuide"
        />
    </div>
</template>

<style scoped>
.shell {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    background: var(--bad-soft);
    border-bottom: 1px solid color-mix(in srgb, var(--bad) 35%, transparent);
}
.banner span {
    flex: 1;
}
.banner.warn {
    background: var(--warn-soft);
    border-bottom-color: color-mix(in srgb, var(--warn) 35%, transparent);
}

/* Quatro áreas fixas; só a de chamadas cresce. */
.workspace {
    position: relative;
    flex: 1;
    min-height: 0;
    display: grid;
    /* A última coluna é a gaveta de depuração, com o tamanho dela (tira ou aberta). */
    grid-template-columns: 60px 260px minmax(0, 1fr) auto;
}
.col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel);
}
.dial-col {
    border-right: 1px solid var(--line);
    overflow: auto;
}
/* Fundo do seletor de contas: um véu leve; clicar nele fecha. */
/* Só visual: o clique passa para o que está por baixo (ver onPointerOutside). */
.shade {
    position: absolute;
    inset: 0;
    z-index: 20;
    pointer-events: none;
    background: var(--shade);
}
@media (prefers-reduced-motion: no-preference) {
    .shade {
        animation: fade-in 140ms ease-out;
    }
}
@keyframes fade-in {
    from {
        opacity: 0;
    }
}
</style>
