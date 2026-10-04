<script setup lang="ts">
import { t } from '@renderer/i18n'
import { useDialog } from '@renderer/lib/dialog'
import { computed, reactive, ref } from 'vue'
import type { Account } from '@shared/types'
import { useAccountsStore } from '@renderer/stores/accounts'
import { ACCOUNT_COLORS, describeStatus, validateAccount } from '@renderer/lib/accounts'
import { createEngine, isNativeAccount, type RegStatus } from '@renderer/sip'
import { useServersStore } from '@renderer/stores/servers'
import { applyServer, serverFromAccount } from '@shared/servers'

const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()

const isNew = !accounts.byId(props.account.id)
const form = reactive<Account>(JSON.parse(JSON.stringify(props.account)))
// Contas salvas antes do SIP puro (RF-39) não têm o campo: valem como WebSocket.
form.transport ??= 'ws'
const password = ref('')
const showAdvanced = ref(false)
const errors = ref<Record<string, string>>({})
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
const saving = ref(false)
const quickDialsText = ref(form.quickDials.map((q) => `${q.number} ${q.label}`).join('\n'))

/** SIP puro por UDP, TCP ou TLS (RF-39): some o que é só do WebRTC. */
const native = computed(() => isNativeAccount(form))

// ─── Servidores cadastrados (RF-51) ───
const servers = useServersStore()
/** Com servidor, os dados de conexão vêm dele e ficam travados aqui; mudam em Configurações → Servidores. */
const linked = computed(() => servers.byId(form.serverId))
const serverSaved = ref('')

function chooseServer(id: string): void {
    const server = servers.byId(id)
    if (server) Object.assign(form, applyServer(JSON.parse(JSON.stringify(form)), server))
    else delete form.serverId
}

/** Cadastra os dados de conexão desta conta como servidor, para as próximas contas escolherem. */
async function saveAsServer(): Promise<void> {
    const server = serverFromAccount(JSON.parse(JSON.stringify(form)), crypto.randomUUID())
    await servers.save(server)
    form.serverId = server.id
    serverSaved.value = t('accountForm.servidor_salvo', { name: server.name })
}

const title = computed(() =>
    isNew ? t('accountForm.nova_conta') : t('accountForm.editar', { name: props.account.name })
)

async function effectivePassword(): Promise<string> {
    if (password.value) return password.value
    return isNew ? '' : ((await window.iris.secrets.get(form.id)) ?? '')
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
                ? { ok: true, text: t('accountForm.registrou_com_sucesso_a_conexao') }
                : { ok: false, text: t('accountForm.falhou', { p: describeStatus(status) }) }
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
    <div class="overlay" @click.self="emit('close')">
        <form
            ref="dialogEl"
            class="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
            tabindex="-1"
            @submit.prevent="save(true)"
        >
            <header>
                <span class="swatch" :style="{ background: form.color }"></span>
                <h2 id="account-title">{{ title }}</h2>
                <button
                    type="button"
                    class="btn small ghost"
                    :aria-label="$t('accountForm.fechar')"
                    @click="emit('close')"
                >
                    ✕
                </button>
            </header>

            <div class="body">
                <div v-if="!form.simulated" class="server">
                    <label class="field">
                        <span class="label">{{ $t('accountForm.servidor') }}</span>
                        <select
                            class="input"
                            :value="form.serverId ?? ''"
                            @change="chooseServer(($event.target as HTMLSelectElement).value)"
                        >
                            <option value="">{{ $t('accountForm.servidor_manual') }}</option>
                            <option v-for="srv in servers.servers" :key="srv.id" :value="srv.id">
                                {{ srv.name }} · {{ srv.domain }} · {{ srv.transport.toUpperCase() }}
                            </option>
                        </select>
                    </label>
                    <small v-if="linked" class="note">{{
                        $t('accountForm.servidor_ligado', { name: linked.name })
                    }}</small>
                    <button
                        v-else
                        type="button"
                        class="btn small"
                        :disabled="!form.domain.trim()"
                        @click="saveAsServer"
                    >
                        {{ $t('accountForm.salvar_como_servidor') }}
                    </button>
                    <small v-if="serverSaved" class="note" role="status">{{ serverSaved }}</small>
                </div>
                <div class="grid">
                    <label class="field">
                        <span class="label">{{ $t('accountForm.nome') }}</span>
                        <input
                            v-model="form.name"
                            class="input"
                            :class="{ invalid: errors.name }"
                            :placeholder="$t('accountForm.suporte_1001')"
                        />
                        <small v-if="errors.name">{{ errors.name }}</small>
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('accountForm.ramal') }}</span>
                        <input
                            v-model="form.extension"
                            class="input mono"
                            :class="{ invalid: errors.extension }"
                            placeholder="1001"
                        />
                        <small v-if="errors.extension">{{ errors.extension }}</small>
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('accountForm.dominio_sip') }}</span>
                        <input
                            v-model="form.domain"
                            :disabled="Boolean(linked)"
                            class="input mono"
                            :class="{ invalid: errors.domain }"
                            :placeholder="$t('accountForm.pbx_empresa_com')"
                        />
                        <small v-if="errors.domain">{{ errors.domain }}</small>
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('accountForm.senha') }}</span>
                        <input
                            v-model="password"
                            type="password"
                            class="input mono"
                            :class="{ invalid: errors.password }"
                            :placeholder="isNew ? '' : $t('accountForm.mantida_digite_para_trocar')"
                            autocomplete="new-password"
                        />
                        <small v-if="errors.password">{{ errors.password }}</small>
                    </label>
                    <label class="field wide">
                        <span class="label">{{ $t('accountForm.transporte') }}</span>
                        <select v-model="form.transport" class="input" :disabled="form.simulated || Boolean(linked)">
                            <option value="ws">{{ $t('accountForm.websocket_seguro_webrtc') }}</option>
                            <option value="udp">{{ $t('accountForm.sip_por_udp') }}</option>
                            <option value="tcp">{{ $t('accountForm.sip_por_tcp') }}</option>
                            <option value="tls">{{ $t('accountForm.sip_por_tls') }}</option>
                        </select>
                        <small v-if="native" class="note">
                            {{ $t('accountForm.sip_puro_sem_webrtc_por') }}
                        </small>
                    </label>
                    <label v-if="native" class="field wide">
                        <span class="label">{{ $t('accountForm.servidor_sip_host_e_porta') }}</span>
                        <input
                            v-model="form.sipServer"
                            :disabled="Boolean(linked)"
                            class="input mono"
                            :class="{ invalid: errors.sipServer }"
                            :placeholder="
                                $t('accountForm.igual_ao_dominio_porta', { p: form.transport === 'tls' ? 5061 : 5060 })
                            "
                        />
                        <small v-if="errors.sipServer">{{ errors.sipServer }}</small>
                    </label>
                    <label v-else class="field wide">
                        <span class="label">{{ $t('accountForm.websocket_wss') }}</span>
                        <input
                            v-model="form.wssUrl"
                            :disabled="Boolean(linked)"
                            class="input mono"
                            :class="{ invalid: errors.wssUrl }"
                            :placeholder="$t('accountForm.wss_pbx_empresa_com_8089')"
                        />
                        <small v-if="errors.wssUrl">{{ errors.wssUrl }}</small>
                    </label>
                </div>

                <div class="toggles">
                    <label class="check">
                        <input v-model="form.simulated" type="checkbox" /> {{ $t('accountForm.pbx_simulado_sem_rede') }}
                    </label>
                    <label class="check">
                        <input v-model="form.autoRegister" type="checkbox" />
                        {{ $t('accountForm.registrar_ao_abrir_o_app') }}
                    </label>
                    <label class="check">
                        <input v-model="form.autoAnswer.enabled" type="checkbox" />
                        {{ $t('accountForm.auto_atender_apos') }}
                        <input
                            v-model.number="form.autoAnswer.delayMs"
                            type="number"
                            min="0"
                            max="10000"
                            step="250"
                            class="input mono ms"
                            :disabled="!form.autoAnswer.enabled"
                            :aria-label="$t('accountForm.atraso_do_auto_atender_em')"
                        />
                        {{ $t('accountForm.ms') }}
                    </label>
                    <label v-if="native" class="check">
                        <input v-model="form.srtp" type="checkbox" :disabled="Boolean(linked)" />
                        {{ $t('accountForm.audio_cifrado') }}
                    </label>
                    <label class="check">
                        <input v-model="form.rawSipLog" type="checkbox" />
                        {{ $t('accountForm.mostrar_sip_bruto_no_log') }}
                    </label>
                </div>

                <button type="button" class="btn small ghost toggle-adv" @click="showAdvanced = !showAdvanced">
                    {{ $t('accountForm.avancado', { p: showAdvanced ? '▾' : '▸' }) }}
                </button>

                <div v-if="showAdvanced" class="grid">
                    <label v-if="!native" class="field">
                        <span class="label">{{ $t('accountForm.preset') }}</span>
                        <select v-model="form.preset" class="input" :disabled="Boolean(linked)">
                            <option value="asterisk">{{ $t('accountForm.asterisk') }}</option>
                            <option value="kamailio">{{ $t('accountForm.kamailio') }}</option>
                            <option value="generic">{{ $t('accountForm.generico') }}</option>
                        </select>
                    </label>
                    <label v-if="!native" class="field">
                        <span class="label">{{ $t('accountForm.biblioteca_sip') }}</span>
                        <select v-model="form.provider" class="input">
                            <option value="sipjs">{{ $t('accountForm.sip_js_padrao') }}</option>
                            <option value="jssip">{{ $t('accountForm.jssip') }}</option>
                        </select>
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('accountForm.usuario_de_autenticacao') }}</span>
                        <input
                            v-model="form.authUsername"
                            class="input mono"
                            :placeholder="$t('accountForm.igual_ao_ramal')"
                        />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('accountForm.nome_de_exibicao') }}</span>
                        <input
                            v-model="form.displayName"
                            class="input"
                            :placeholder="$t('accountForm.igual_ao_ramal')"
                        />
                    </label>
                    <label v-if="!native" class="field">
                        <span class="label">{{ $t('accountForm.modo_dtmf') }}</span>
                        <select v-model="form.dtmfMode" class="input">
                            <option value="auto">{{ $t('accountForm.automatico') }}</option>
                            <option value="sip-info">{{ $t('accountForm.sip_info') }}</option>
                            <option value="rtp-event">{{ $t('accountForm.rtp_rfc_4733') }}</option>
                        </select>
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('accountForm.cor') }}</span>
                        <div class="colors">
                            <button
                                v-for="color in ACCOUNT_COLORS"
                                :key="color"
                                type="button"
                                class="color"
                                :class="{ on: form.color === color }"
                                :style="{ background: color }"
                                :aria-label="$t('accountForm.cor_2', { color })"
                                @click="form.color = color"
                            ></button>
                        </div>
                    </label>
                    <label v-if="native || form.simulated" class="field wide">
                        <span class="label">{{ $t('accountForm.blf_ramais') }}</span>
                        <input v-model="form.blf" class="input mono" :placeholder="$t('accountForm.blf_exemplo')" />
                    </label>
                    <label class="field wide">
                        <span class="label">{{ $t('accountForm.stun_turn_separados_por_virgula') }}</span>
                        <input
                            v-model="form.iceServers"
                            :disabled="Boolean(linked)"
                            class="input mono"
                            :placeholder="$t('accountForm.stun_stun_l_google_com')"
                        />
                    </label>
                    <label class="field wide">
                        <span class="label">{{ $t('accountForm.atalhos_de_discagem_um_por') }}</span>
                        <textarea
                            v-model="quickDialsText"
                            class="input mono"
                            rows="3"
                            :placeholder="$t('accountForm.t_8000_ura_97_correio_de')"
                        ></textarea>
                    </label>
                </div>

                <p v-if="testResult" class="result" :class="testResult.ok ? 'ok' : 'bad'">{{ testResult.text }}</p>
            </div>

            <footer>
                <button type="button" class="btn" :disabled="testing" @click="testConnection">
                    {{ testing ? $t('accountForm.testando') : $t('accountForm.testar_conexao') }}
                </button>
                <span class="spacer"></span>
                <button type="button" class="btn" :disabled="saving" @click="save(false)">
                    {{ $t('accountForm.salvar') }}
                </button>
                <button type="submit" class="btn primary" :disabled="saving">
                    {{ $t('accountForm.salvar_e_registrar') }}
                </button>
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
.field small.note {
    color: var(--muted);
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
.server {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
}
.server .field {
    flex: 1;
    min-width: 240px;
}
</style>
