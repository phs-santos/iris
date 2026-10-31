<script setup lang="ts">
import { t } from '@renderer/i18n'
import { useDialog } from '@renderer/lib/dialog'
import { computed, reactive, ref } from 'vue'
import type { Account, DtmfMode } from '@shared/types'
import { useAccountsStore } from '@renderer/stores/accounts'
import { ACCOUNT_COLORS, describeStatus, validateAccount } from '@renderer/lib/accounts'
import { createEngine, type RegStatus } from '@renderer/sip'
import { useServersStore } from '@renderer/stores/servers'
import { applyServer, defaultServerId, isSimulated, type SipServer } from '@shared/servers'
import { defaultSipPort, type AccountTransport } from '@shared/sip-target'
import { ringer } from '@renderer/sip/audio'
import { DEFAULT_RINGTONE, RINGTONE_IDS, type RingtoneId } from '@shared/ringtones'
import ServerDialog from './ServerDialog.vue'
import TagsField from './TagsField.vue'
import Icon from './icons/Icon.vue'

/**
 * Cadastro de conta: à vista só nome, etiquetas, servidor, ramal e senha. O resto fica em "Avançado", fechado,
 * com um resumo do que vale. A conexão vem do servidor escolhido; transporte, endereço, WSS e STUN/TURN podem
 * ser trocados aqui, e vazio quer dizer "o do servidor".
 */
const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const servers = useServersStore()

/** Servidor da última conta salva: a próxima conta nova já vem com ele. */
const LAST_SERVER_KEY = 'iris.ultimo-servidor'
function readLastServer(): string | null {
    try {
        return localStorage.getItem(LAST_SERVER_KEY)
    } catch {
        return null
    }
}
function rememberServer(id: string): void {
    try {
        localStorage.setItem(LAST_SERVER_KEY, id)
    } catch {
        // sem armazenamento local, a próxima conta só não vem com ele escolhido
    }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const isNew = !accounts.byId(props.account.id)
const form = reactive<Account>(clone(props.account))
form.tagIds ??= []
const password = ref('')
const errors = ref<Record<string, string>>({})
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
const saving = ref(false)
const showAdvanced = ref(false)

// Campos que, vazios, valem o do servidor. Guardam só o que a conta muda.
const address = ref('')
const wss = ref('')
const ice = ref('')

const linked = computed<SipServer | undefined>(() => servers.byId(form.serverId))
const simulated = computed(() => isSimulated(form))
const native = computed(() => form.transport !== 'ws')

function chooseServer(id: string): void {
    const server = servers.byId(id)
    if (!server) return
    Object.assign(form, applyServer(clone(form), server))
    // O DTMF do servidor vale como padrão das contas novas dele (Ajustes → Servidores → Avançado).
    if (server.dtmfMode && isNew) form.dtmfMode = server.dtmfMode
    address.value = ''
    wss.value = ''
    ice.value = ''
    errors.value = { ...errors.value, serverId: '', domain: '' }
}

// Conta nova vem com o servidor da última conta salva (ou o primeiro, ou o simulado). Conta que já existe
// mostra no Avançado só o que difere do servidor dela.
if (isNew && !linked.value) chooseServer(defaultServerId(servers.servers, readLastServer()))
else if (linked.value) {
    const s = linked.value
    if ((form.sipServer ?? '') !== s.sipServer) address.value = form.sipServer ?? ''
    if (form.wssUrl !== s.wssUrl) wss.value = form.wssUrl
    if (form.iceServers !== s.iceServers) ice.value = form.iceServers
}

// ─── Servidor: a lista termina em "+ Novo servidor…" ───
const NEW_SERVER = '__novo__'
const serverDialog = ref<'new' | null>(null)
const serverSelect = ref<HTMLSelectElement | null>(null)
const serverLabel = (s: SipServer): string =>
    isSimulated({ serverId: s.id })
        ? s.name
        : `${s.name} · ${s.transport === 'ws' ? t('accountForm.websocket') : s.transport.toUpperCase()}`

function onServerChange(event: Event): void {
    const select = event.target as HTMLSelectElement
    if (select.value === NEW_SERVER) {
        // Volta a mostrar o escolhido até a janela de servidor dizer qual ficou.
        select.value = form.serverId
        serverDialog.value = 'new'
    } else chooseServer(select.value)
}
function onServerSaved(server: SipServer): void {
    serverDialog.value = null
    chooseServer(server.id)
    serverSelect.value?.focus()
}

// ─── Avançado ───
const transports = computed<Array<{ id: AccountTransport; name: string }>>(() => [
    { id: 'udp', name: 'UDP' },
    { id: 'tcp', name: 'TCP' },
    { id: 'tls', name: 'TLS' },
    { id: 'ws', name: t('accountForm.websocket') }
])
const dtmf = computed<'rtp' | 'info'>({
    get: () => (form.dtmfMode === 'sip-info' ? 'info' : 'rtp'),
    set: (v) => (form.dtmfMode = (v === 'info' ? 'sip-info' : 'rtp-event') as DtmfMode)
})
/** Toque desta conta (RF-55). O clássico não é gravado: é o que vale sem o campo. */
const ringtone = computed<RingtoneId>({
    get: () => form.ringtone ?? DEFAULT_RINGTONE,
    set: (id) => {
        if (id === DEFAULT_RINGTONE) delete form.ringtone
        else form.ringtone = id
    }
})
const ringtoneName = (id: RingtoneId): string =>
    ({
        classico: t('accountForm.toque_classico'),
        digital: t('accountForm.toque_digital'),
        suave: t('accountForm.toque_suave'),
        sino: t('accountForm.toque_sino'),
        nenhum: t('accountForm.toque_nenhum')
    })[id]
/** Atender sozinho: a tela fala em segundos (0 a 10); a conta guarda milissegundos. */
const autoDelay = computed<number>({
    get: () => Math.round(form.autoAnswer.delayMs / 100) / 10,
    set: (s) => (form.autoAnswer.delayMs = Math.round(Math.min(10, Math.max(0, Number(s) || 0)) * 1000))
})

/** O que vale no Avançado, para ler sem abrir. */
const summary = computed(() => {
    const parts: string[] = []
    if (!simulated.value) {
        parts.push(transports.value.find((x) => x.id === form.transport)!.name)
        if (native.value && form.srtp) parts.push(t('accountForm.resumo_srtp'))
    }
    parts.push(dtmf.value === 'info' ? t('accountForm.resumo_info') : t('accountForm.resumo_rtp'))
    if (form.autoAnswer.enabled) parts.push(t('accountForm.resumo_atende', { s: autoDelay.value }))
    parts.push(ringtoneName(ringtone.value))
    return parts.join(' · ')
})

const addressHint = computed(() => {
    const s = linked.value
    if (s && s.transport === form.transport && s.sipServer) return s.sipServer
    return t('accountForm.igual_ao_dominio', {
        p: native.value ? defaultSipPort(form.transport as 'udp') : ''
    })
})

// ─── Salvar e testar ───
const title = computed(() =>
    isNew ? t('accountForm.nova_conta') : t('accountForm.editar', { name: props.account.name })
)

/** A conta como vai ser gravada: o que ficou vazio no Avançado vem do servidor. */
function build(): Account {
    const copy = clone(form)
    const s = linked.value
    const same = s?.transport === copy.transport
    copy.name = copy.name.trim()
    copy.extension = copy.extension.trim()
    copy.sipServer = native.value ? address.value.trim() || (same ? (s?.sipServer ?? '') : '') : ''
    copy.wssUrl = native.value ? '' : wss.value.trim() || (same ? (s?.wssUrl ?? '') : '')
    copy.iceServers = ice.value.trim() || (s?.iceServers ?? '')
    copy.srtp = native.value && form.srtp ? true : undefined
    if (!native.value) delete copy.srtp
    return copy
}

async function effectivePassword(): Promise<string> {
    if (password.value) return password.value
    return isNew ? '' : ((await window.iris.secrets.get(form.id)) ?? '')
}

async function validate(account: Account): Promise<boolean> {
    const found = validateAccount(account, await effectivePassword())
    if (!linked.value) found.serverId = t('accountForm.valida_servidor')
    // O domínio vem do servidor: o erro dele aparece no campo Servidor.
    if (found.domain && !found.serverId) found.serverId = found.domain
    delete found.domain
    errors.value = found
    if (found.sipServer || found.wssUrl) showAdvanced.value = true
    return Object.keys(found).length === 0
}

/** Registra com os dados do formulário, mostra o resultado e desregistra (RF-05). */
async function testConnection(): Promise<void> {
    testResult.value = null
    const account = build()
    if (!(await validate(account))) return
    testing.value = true
    const started = performance.now()
    const engine = createEngine(account, await effectivePassword())
    try {
        const status = await new Promise<RegStatus>((resolve) => {
            const timer = setTimeout(
                () => resolve({ state: 'error', reason: t('accountForm.sem_resposta_do_pbx_em') }),
                10_000
            )
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
                ? { ok: true, text: t('accountForm.registrou_em', { ms: Math.round(performance.now() - started) }) }
                : { ok: false, text: t('accountForm.falhou', { p: describeStatus(status) }) }
    } finally {
        await engine.dispose()
        testing.value = false
    }
}

/** Salva e registra (ou registra de novo, com os dados novos). */
async function save(): Promise<void> {
    const account = build()
    if (!(await validate(account))) return
    saving.value = true
    try {
        await accounts.save(account, password.value ? password.value : isNew ? '' : undefined)
        rememberServer(account.serverId)
        if (accounts.statusOf(account.id).state === 'disconnected') await accounts.register(account.id)
        emit('close')
    } finally {
        saving.value = false
    }
}

const describedBy = (field: string): string | undefined => (errors.value[field] ? `acc-${field}-err` : undefined)
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <form
            ref="dialogEl"
            class="dialog account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
            tabindex="-1"
            novalidate
            @submit.prevent="save"
        >
            <header>
                <span class="swatch" :style="{ background: form.color }" aria-hidden="true"></span>
                <h2 id="account-title">{{ title }}</h2>
                <button
                    type="button"
                    class="btn small ghost"
                    :aria-label="$t('accountForm.fechar')"
                    @click="emit('close')"
                >
                    <Icon name="close" />
                </button>
            </header>

            <div class="form-grid">
                <label class="lbl" for="acc-name"
                    >{{ $t('accountForm.nome') }}<span class="req" aria-hidden="true">*</span></label
                >
                <div>
                    <input
                        id="acc-name"
                        v-model="form.name"
                        class="input"
                        required
                        :aria-invalid="Boolean(errors.name)"
                        :aria-describedby="describedBy('name')"
                        :placeholder="$t('accountForm.nome_exemplo')"
                    />
                    <small v-if="errors.name" id="acc-name-err" class="field-error">{{ errors.name }}</small>
                </div>

                <span id="acc-tags" class="lbl top">{{ $t('accountForm.etiquetas') }}</span>
                <TagsField v-model="form.tagIds" labelledby="acc-tags" />

                <label class="lbl" for="acc-server"
                    >{{ $t('accountForm.servidor') }}<span class="req" aria-hidden="true">*</span></label
                >
                <div>
                    <select
                        id="acc-server"
                        ref="serverSelect"
                        class="input"
                        required
                        :value="form.serverId"
                        :aria-invalid="Boolean(errors.serverId)"
                        :aria-describedby="describedBy('serverId')"
                        @change="onServerChange"
                    >
                        <option v-if="!linked" value="" disabled>{{ $t('accountForm.escolha_servidor') }}</option>
                        <option v-for="srv in servers.all" :key="srv.id" :value="srv.id">
                            {{ serverLabel(srv) }}
                        </option>
                        <option :value="NEW_SERVER">{{ $t('accountForm.novo_servidor') }}</option>
                    </select>
                    <small v-if="errors.serverId" id="acc-serverId-err" class="field-error">{{
                        errors.serverId
                    }}</small>
                    <small v-else-if="linked && !simulated" class="field-note mono">{{ linked.domain }}</small>
                    <small v-else-if="simulated" class="field-note">{{ $t('accountForm.simulado_nota') }}</small>
                </div>

                <label class="lbl" for="acc-ext"
                    >{{ $t('accountForm.ramal') }}<span class="req" aria-hidden="true">*</span></label
                >
                <div>
                    <input
                        id="acc-ext"
                        v-model="form.extension"
                        class="input mono"
                        required
                        :aria-invalid="Boolean(errors.extension)"
                        :aria-describedby="describedBy('extension')"
                        placeholder="1001"
                    />
                    <small v-if="errors.extension" id="acc-extension-err" class="field-error">{{
                        errors.extension
                    }}</small>
                </div>

                <label class="lbl" for="acc-pass"
                    >{{ $t('accountForm.senha') }}<span class="req" aria-hidden="true">*</span></label
                >
                <div>
                    <input
                        id="acc-pass"
                        v-model="password"
                        type="password"
                        class="input mono"
                        required
                        :aria-invalid="Boolean(errors.password)"
                        :aria-describedby="describedBy('password')"
                        :placeholder="isNew ? '' : $t('accountForm.mantida_digite_para_trocar')"
                        autocomplete="new-password"
                    />
                    <small v-if="errors.password" id="acc-password-err" class="field-error">{{
                        errors.password
                    }}</small>
                </div>
            </div>

            <button
                type="button"
                class="disclosure"
                :aria-expanded="showAdvanced"
                aria-controls="acc-advanced"
                @click="showAdvanced = !showAdvanced"
            >
                <Icon name="chevron" />
                {{ $t('accountForm.avancado') }}
                <span v-if="!showAdvanced" class="summary">{{ summary }}</span>
            </button>

            <div v-show="showAdvanced" id="acc-advanced" class="form-grid">
                <template v-if="!simulated">
                    <span id="acc-transport" class="lbl">{{ $t('accountForm.transporte') }}</span>
                    <div class="row">
                        <div class="segmented" role="radiogroup" aria-labelledby="acc-transport">
                            <button
                                v-for="tr in transports"
                                :key="tr.id"
                                type="button"
                                role="radio"
                                :aria-checked="form.transport === tr.id"
                                @click="form.transport = tr.id"
                            >
                                {{ tr.name }}
                            </button>
                        </div>
                        <small v-if="linked && linked.transport !== form.transport" class="field-note">{{
                            $t('accountForm.transporte_diferente')
                        }}</small>
                    </div>

                    <label class="lbl" for="acc-auth">{{ $t('accountForm.usuario_de_autenticacao') }}</label>
                    <input
                        id="acc-auth"
                        v-model="form.authUsername"
                        class="input mono"
                        :placeholder="$t('accountForm.igual_ao_ramal')"
                    />

                    <template v-if="native">
                        <label class="lbl" for="acc-address">{{ $t('accountForm.endereco') }}</label>
                        <div>
                            <input
                                id="acc-address"
                                v-model="address"
                                class="input mono"
                                :aria-invalid="Boolean(errors.sipServer)"
                                :aria-describedby="describedBy('sipServer')"
                                :placeholder="addressHint"
                            />
                            <small v-if="errors.sipServer" id="acc-sipServer-err" class="field-error">{{
                                errors.sipServer
                            }}</small>
                        </div>
                    </template>
                    <template v-else>
                        <label class="lbl" for="acc-wss">{{ $t('accountForm.wss') }}</label>
                        <div>
                            <input
                                id="acc-wss"
                                v-model="wss"
                                class="input mono"
                                :aria-invalid="Boolean(errors.wssUrl)"
                                :aria-describedby="describedBy('wssUrl')"
                                :placeholder="
                                    (linked?.transport === 'ws' && linked.wssUrl) || $t('accountForm.wss_exemplo')
                                "
                            />
                            <small v-if="errors.wssUrl" id="acc-wssUrl-err" class="field-error">{{
                                errors.wssUrl
                            }}</small>
                        </div>
                        <label class="lbl" for="acc-ice">{{ $t('accountForm.stun_turn') }}</label>
                        <input
                            id="acc-ice"
                            v-model="ice"
                            class="input mono"
                            :placeholder="linked?.iceServers || $t('accountForm.stun_exemplo')"
                        />
                    </template>
                </template>

                <label class="lbl" for="acc-display">{{ $t('accountForm.nome_de_exibicao') }}</label>
                <input
                    id="acc-display"
                    v-model="form.displayName"
                    class="input"
                    :placeholder="$t('accountForm.igual_ao_ramal')"
                />

                <span id="acc-dtmf" class="lbl">{{ $t('accountForm.dtmf') }}</span>
                <div class="segmented" role="radiogroup" aria-labelledby="acc-dtmf">
                    <button type="button" role="radio" :aria-checked="dtmf === 'rtp'" @click="dtmf = 'rtp'">
                        {{ $t('accountForm.dtmf_rtp') }}
                    </button>
                    <button type="button" role="radio" :aria-checked="dtmf === 'info'" @click="dtmf = 'info'">
                        {{ $t('accountForm.dtmf_info') }}
                    </button>
                </div>

                <div class="full checks">
                    <label class="check-line">
                        <input v-model="form.autoRegister" type="checkbox" />
                        {{ $t('accountForm.registrar_ao_abrir') }}
                    </label>
                    <label v-if="native && !simulated" class="check-line">
                        <input v-model="form.srtp" type="checkbox" />
                        {{ $t('accountForm.audio_cifrado') }}
                    </label>
                    <label v-if="!native && !simulated" class="check-line" :title="$t('accountForm.early_media_dica')">
                        <input v-model="form.earlyMedia" type="checkbox" />
                        {{ $t('accountForm.early_media') }}
                    </label>
                    <span class="check-line wide">
                        <label class="check-line">
                            <input v-model="form.autoAnswer.enabled" type="checkbox" />
                            {{ $t('accountForm.atender_sozinho') }}
                        </label>
                        <input
                            v-model.number="autoDelay"
                            type="number"
                            min="0"
                            max="10"
                            step="0.5"
                            class="input mono secs"
                            :disabled="!form.autoAnswer.enabled"
                            :aria-label="$t('accountForm.atraso_segundos')"
                        />
                        <span class="field-note">{{ $t('accountForm.segundos') }}</span>
                    </span>
                </div>

                <label class="lbl" for="acc-ring">{{ $t('accountForm.toque') }}</label>
                <span class="row">
                    <select id="acc-ring" v-model="ringtone" class="input ring">
                        <option v-for="id in RINGTONE_IDS" :key="id" :value="id">{{ ringtoneName(id) }}</option>
                    </select>
                    <button
                        type="button"
                        class="btn small"
                        :disabled="ringtone === 'nenhum'"
                        @click="ringer.preview(ringtone)"
                    >
                        {{ $t('accountForm.ouvir') }}
                    </button>
                </span>

                <span id="acc-color" class="lbl">{{ $t('accountForm.cor') }}</span>
                <div class="colors" role="radiogroup" aria-labelledby="acc-color">
                    <button
                        v-for="color in ACCOUNT_COLORS"
                        :key="color"
                        type="button"
                        role="radio"
                        class="color"
                        :aria-checked="form.color === color"
                        :style="{ background: color }"
                        :aria-label="$t('accountForm.cor_n', { color })"
                        @click="form.color = color"
                    ></button>
                </div>
            </div>

            <footer class="split-foot">
                <span
                    class="test-result"
                    :class="testResult ? (testResult.ok ? 'ok' : 'bad') : ''"
                    role="status"
                    aria-live="polite"
                >
                    <template v-if="testResult">
                        <i class="dot" :class="testResult.ok ? 'registered' : 'error'" aria-hidden="true"></i>
                        {{ testResult.text }}
                    </template>
                    <template v-else-if="testing">{{ $t('accountForm.testando') }}</template>
                </span>
                <span class="acts">
                    <button type="button" class="btn" :disabled="testing" @click="testConnection">
                        {{ $t('accountForm.testar') }}
                    </button>
                    <button type="submit" class="btn primary" :disabled="saving">
                        {{ $t('accountForm.salvar') }}
                    </button>
                </span>
            </footer>
        </form>

        <ServerDialog v-if="serverDialog" @close="serverDialog = null" @saved="onServerSaved" />
    </div>
</template>

<style scoped>
.account-dialog {
    width: min(560px, 100%);
}
.swatch {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}
header .btn .icon {
    width: 14px;
    height: 14px;
}
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
}
.segmented {
    justify-self: start;
}
.checks {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    gap: 2px 18px;
}
.checks .wide {
    grid-column: 1 / -1;
}
.secs {
    width: 58px;
    padding: 2px 6px;
}
.ring {
    flex: 1;
    min-width: 0;
}
.colors {
    display: flex;
    gap: 7px;
    padding: 3px 0;
}
.color {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 0;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
}
/* Escolhida: anel em volta, não só a cor (RNF-12). */
.color[aria-checked='true'] {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
}
</style>
