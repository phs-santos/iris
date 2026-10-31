<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { t } from '@renderer/i18n'
import { useDialog } from '@renderer/lib/dialog'
import { useServersStore } from '@renderer/stores/servers'
import { useToastsStore } from '@renderer/stores/toasts'
import { parseSipServer, defaultSipPort } from '@shared/sip-target'
import type { SipServer } from '@shared/servers'
import type { AccountTransport } from '@shared/sip-target'
import type { DtmfMode } from '@shared/types'
import Icon from './icons/Icon.vue'

/**
 * Janela de servidor (RF-51): os dados de conexão de um PBX, escritos uma vez e usados por várias contas.
 * Abre do cadastro de conta ("+ Novo servidor…", e volta com ele escolhido) e de Ajustes → Servidores.
 */
const props = defineProps<{ server?: SipServer }>()
const emit = defineEmits<{ close: []; saved: [server: SipServer] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const servers = useServersStore()

const isNew = !props.server
const form = reactive<SipServer>(
    props.server
        ? JSON.parse(JSON.stringify(props.server))
        : {
              id: crypto.randomUUID(),
              name: '',
              domain: '',
              transport: 'udp',
              wssUrl: '',
              sipServer: '',
              iceServers: '',
              preset: 'asterisk'
          }
)
// WebSocket precisa do endereço WSS, que fica em Avançado: abre junto.
const showAdvanced = ref(form.transport === 'ws')
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)

const transports: Array<{ id: AccountTransport; name: string }> = [
    { id: 'udp', name: 'UDP' },
    { id: 'tcp', name: 'TCP' },
    { id: 'tls', name: 'TLS' },
    { id: 'ws', name: t('serverDialog.websocket') }
]
const native = computed(() => form.transport !== 'ws')

function setTransport(id: AccountTransport): void {
    form.transport = id
    testResult.value = null
    if (id === 'ws') showAdvanced.value = true
}

const dtmf = computed<DtmfMode>({
    get: () => form.dtmfMode ?? 'auto',
    set: (mode) => (form.dtmfMode = mode === 'auto' ? undefined : mode)
})

/** Resumo do Avançado fechado: o que vale sem abrir. */
const summary = computed(() =>
    [
        native.value && form.srtp ? t('serverDialog.resumo_srtp') : '',
        form.dtmfMode === 'sip-info'
            ? t('serverDialog.resumo_info')
            : form.dtmfMode === 'rtp-event'
              ? t('serverDialog.resumo_rtp')
              : '',
        !native.value && form.wssUrl ? form.wssUrl : ''
    ]
        .filter(Boolean)
        .join(' · ')
)

function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = t('serverDialog.erro_nome')
    if (!form.domain.trim()) e.domain = t('serverDialog.erro_dominio')
    else if (native.value && !parseSipServer('', form.domain.trim(), form.transport as 'udp'))
        e.domain = t('serverDialog.erro_dominio_puro')
    if (
        native.value &&
        form.domain.trim() &&
        !parseSipServer(form.sipServer, form.domain.trim(), form.transport as 'udp')
    )
        e.sipServer = t('serverDialog.erro_endereco')
    if (!native.value && !/^wss?:\/\/.+/i.test(form.wssUrl.trim())) {
        e.wssUrl = t('serverDialog.erro_wss')
        showAdvanced.value = true
    }
    errors.value = e
    return Object.keys(e).length === 0
}

function clean(): SipServer {
    return {
        ...JSON.parse(JSON.stringify(form)),
        name: form.name.trim(),
        domain: form.domain.trim(),
        wssUrl: native.value ? '' : form.wssUrl.trim(),
        sipServer: native.value ? form.sipServer.trim() : '',
        iceServers: form.iceServers.trim(),
        srtp: native.value && form.srtp ? true : undefined
    }
}

/** OPTIONS sem conta, direto ao PBX: diz se ele responde e em quanto tempo. */
async function test(): Promise<void> {
    testResult.value = null
    if (!validate()) return
    testing.value = true
    const server = clean()
    try {
        const ms = await window.iris.sip.probe(server.domain, server.transport as 'udp', server.sipServer)
        testResult.value = { ok: true, text: t('serverDialog.respondeu', { ms }) }
    } catch (error) {
        // O erro do IPC chega com o prefixo do Electron; só a última parte interessa.
        const text = String((error as Error).message).replace(/^.*Error: /, '')
        testResult.value = { ok: false, text: t('serverDialog.nao_respondeu', { p: text }) }
    } finally {
        testing.value = false
    }
}

async function save(): Promise<void> {
    if (!validate()) return
    saving.value = true
    try {
        const server = clean()
        const changed = await servers.save(server)
        useToastsStore().show(
            changed
                ? t('serverDialog.contas_atualizadas', { n: changed })
                : t('serverDialog.salvo', { name: server.name })
        )
        emit('saved', server)
    } finally {
        saving.value = false
    }
}

const portHint = computed(() =>
    native.value ? t('serverDialog.endereco_padrao', { port: defaultSipPort(form.transport as 'udp') }) : ''
)
</script>

<template>
    <div class="overlay nested" @click.self="emit('close')">
        <form
            ref="dialogEl"
            class="dialog server-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="server-title"
            tabindex="-1"
            novalidate
            @submit.prevent="save"
        >
            <header>
                <span class="glyph" aria-hidden="true"><Icon name="server" /></span>
                <h2 id="server-title">
                    {{ isNew ? $t('serverDialog.novo') : $t('serverDialog.editar', { name: props.server?.name }) }}
                </h2>
                <button
                    type="button"
                    class="btn small ghost"
                    :aria-label="$t('serverDialog.fechar')"
                    @click="emit('close')"
                >
                    <Icon name="close" />
                </button>
            </header>

            <div class="form-grid">
                <label class="lbl" for="srv-name"
                    >{{ $t('serverDialog.nome') }}<span class="req" aria-hidden="true">*</span></label
                >
                <div>
                    <input
                        id="srv-name"
                        v-model="form.name"
                        class="input"
                        required
                        :aria-invalid="Boolean(errors.name)"
                        :aria-describedby="errors.name ? 'srv-name-err' : undefined"
                        :placeholder="$t('serverDialog.nome_exemplo')"
                    />
                    <small v-if="errors.name" id="srv-name-err" class="field-error">{{ errors.name }}</small>
                </div>

                <label class="lbl" for="srv-domain"
                    >{{ $t('serverDialog.dominio') }}<span class="req" aria-hidden="true">*</span></label
                >
                <div>
                    <input
                        id="srv-domain"
                        v-model="form.domain"
                        class="input mono"
                        required
                        :aria-invalid="Boolean(errors.domain)"
                        :aria-describedby="errors.domain ? 'srv-domain-err' : undefined"
                        :placeholder="$t('serverDialog.dominio_exemplo')"
                    />
                    <small v-if="errors.domain" id="srv-domain-err" class="field-error">{{ errors.domain }}</small>
                </div>

                <span id="srv-transport" class="lbl">{{ $t('serverDialog.transporte') }}</span>
                <div class="segmented" role="radiogroup" aria-labelledby="srv-transport">
                    <button
                        v-for="tr in transports"
                        :key="tr.id"
                        type="button"
                        role="radio"
                        :aria-checked="form.transport === tr.id"
                        @click="setTransport(tr.id)"
                    >
                        {{ tr.name }}
                    </button>
                </div>

                <template v-if="native">
                    <label class="lbl" for="srv-address">{{ $t('serverDialog.endereco') }}</label>
                    <div>
                        <input
                            id="srv-address"
                            v-model="form.sipServer"
                            class="input mono"
                            :aria-invalid="Boolean(errors.sipServer)"
                            :aria-describedby="errors.sipServer ? 'srv-address-err' : undefined"
                            :placeholder="portHint"
                        />
                        <small v-if="errors.sipServer" id="srv-address-err" class="field-error">{{
                            errors.sipServer
                        }}</small>
                    </div>
                </template>
            </div>

            <button
                type="button"
                class="disclosure"
                :aria-expanded="showAdvanced"
                aria-controls="srv-advanced"
                @click="showAdvanced = !showAdvanced"
            >
                <Icon name="chevron" />
                {{ $t('serverDialog.avancado') }}
                <span v-if="!showAdvanced" class="summary">{{ summary }}</span>
            </button>
            <div v-show="showAdvanced" id="srv-advanced" class="form-grid">
                <template v-if="!native">
                    <label class="lbl" for="srv-wss"
                        >{{ $t('serverDialog.wss') }}<span class="req" aria-hidden="true">*</span></label
                    >
                    <div>
                        <input
                            id="srv-wss"
                            v-model="form.wssUrl"
                            class="input mono"
                            :aria-invalid="Boolean(errors.wssUrl)"
                            :aria-describedby="errors.wssUrl ? 'srv-wss-err' : undefined"
                            :placeholder="$t('serverDialog.wss_exemplo')"
                        />
                        <small v-if="errors.wssUrl" id="srv-wss-err" class="field-error">{{ errors.wssUrl }}</small>
                    </div>
                    <label class="lbl" for="srv-ice">{{ $t('serverDialog.stun_turn') }}</label>
                    <input
                        id="srv-ice"
                        v-model="form.iceServers"
                        class="input mono"
                        :placeholder="$t('serverDialog.stun_exemplo')"
                    />
                </template>
                <span id="srv-dtmf" class="lbl">{{ $t('serverDialog.dtmf') }}</span>
                <div class="segmented" role="radiogroup" aria-labelledby="srv-dtmf">
                    <button type="button" role="radio" :aria-checked="dtmf === 'auto'" @click="dtmf = 'auto'">
                        {{ $t('serverDialog.dtmf_auto') }}
                    </button>
                    <button type="button" role="radio" :aria-checked="dtmf === 'rtp-event'" @click="dtmf = 'rtp-event'">
                        {{ $t('serverDialog.dtmf_rtp') }}
                    </button>
                    <button type="button" role="radio" :aria-checked="dtmf === 'sip-info'" @click="dtmf = 'sip-info'">
                        {{ $t('serverDialog.dtmf_info') }}
                    </button>
                </div>
                <label v-if="native" class="check-line full">
                    <input v-model="form.srtp" type="checkbox" />
                    {{ $t('serverDialog.srtp') }}
                </label>
                <p class="field-note full">{{ $t('serverDialog.vale_para_contas') }}</p>
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
                    <template v-else-if="!native">{{ $t('serverDialog.teste_so_sip') }}</template>
                </span>
                <span class="acts">
                    <button type="button" class="btn" :disabled="testing || !native" @click="test">
                        {{ testing ? $t('serverDialog.testando') : $t('serverDialog.testar') }}
                    </button>
                    <button type="submit" class="btn primary" :disabled="saving">
                        {{ $t('serverDialog.salvar') }}
                    </button>
                </span>
            </footer>
        </form>
    </div>
</template>

<style scoped>
.nested {
    z-index: 60;
}
.server-dialog {
    width: min(520px, 100%);
}
.glyph {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    background: var(--selected);
    color: var(--accent-text);
}
.glyph .icon {
    width: 14px;
    height: 14px;
}
header .btn .icon {
    width: 14px;
    height: 14px;
}
.segmented {
    justify-self: start;
}
</style>
