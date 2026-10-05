<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { t } from '@renderer/i18n'
import { useServersStore } from '@renderer/stores/servers'
import { useToastsStore } from '@renderer/stores/toasts'
import { parseSipServer } from '@shared/sip-target'
import type { SipServer } from '@shared/servers'

/** Servidores cadastrados (RF-51): os dados de conexão de um PBX, usados por várias contas. */
const servers = useServersStore()
const editing = ref<SipServer | null>(null)
const form = reactive<SipServer>(blank())
const message = ref('')
const confirmDelete = ref<string | null>(null)

function blank(): SipServer {
    return {
        id: '',
        name: '',
        domain: '',
        transport: 'ws',
        wssUrl: '',
        sipServer: '',
        iceServers: '',
        preset: 'asterisk'
    }
}

function edit(server?: SipServer): void {
    Object.assign(form, blank(), server ? JSON.parse(JSON.stringify(server)) : { id: crypto.randomUUID() })
    editing.value = server ?? form
    message.value = ''
}

const error = computed(() => {
    if (!form.name.trim()) return t('serversSection.erro_nome')
    if (!form.domain.trim()) return t('serversSection.erro_dominio')
    if (form.transport === 'ws' && !/^wss?:\/\/.+/i.test(form.wssUrl.trim())) return t('serversSection.erro_wss')
    if (form.transport !== 'ws' && !parseSipServer(form.sipServer, form.domain, form.transport))
        return t('serversSection.erro_endereco')
    return ''
})

async function save(): Promise<void> {
    if (error.value) return
    const server: SipServer = {
        ...JSON.parse(JSON.stringify(form)),
        name: form.name.trim(),
        domain: form.domain.trim(),
        wssUrl: form.transport === 'ws' ? form.wssUrl.trim() : '',
        sipServer: form.transport === 'ws' ? '' : form.sipServer.trim(),
        srtp: form.transport !== 'ws' && form.srtp ? true : undefined
    }
    const changed = await servers.save(server)
    editing.value = null
    message.value = changed ? t('serversSection.contas_atualizadas', { n: changed }) : t('serversSection.salvo')
    useToastsStore().show(message.value)
}

async function remove(id: string): Promise<void> {
    await servers.remove(id)
    confirmDelete.value = null
    message.value = t('serversSection.apagado')
}

const describe = (s: SipServer): string =>
    s.transport === 'ws' ? s.wssUrl : `${s.transport.toUpperCase()} ${s.sipServer || s.domain}`
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('serversSection.servidores') }}</h3>
            <p>{{ $t('serversSection.explicacao') }}</p>
        </div>
        <div v-if="servers.servers.length" class="set-group">
            <div v-for="s in servers.servers" :key="s.id" class="set-row">
                <span class="what">
                    <b>{{ s.name }}</b>
                    <small class="mono">{{ s.domain }} · {{ describe(s) }}</small>
                    <small>{{ $t('serversSection.usado_por', { n: servers.usersOf(s.id).length }) }}</small>
                </span>
                <template v-if="confirmDelete === s.id">
                    <button class="btn small stop" @click="remove(s.id)">{{ $t('serversSection.confirmar') }}</button>
                    <button class="btn small" @click="confirmDelete = null">{{ $t('serversSection.cancelar') }}</button>
                </template>
                <template v-else>
                    <button
                        class="btn small"
                        :aria-label="$t('serversSection.editar_nome', { name: s.name })"
                        @click="edit(s)"
                    >
                        {{ $t('serversSection.editar') }}
                    </button>
                    <button
                        class="btn small"
                        :aria-label="$t('serversSection.excluir_nome', { name: s.name })"
                        @click="confirmDelete = s.id"
                    >
                        {{ $t('serversSection.excluir') }}
                    </button>
                </template>
            </div>
        </div>
        <p v-else-if="!editing" class="set-hint">{{ $t('serversSection.vazio') }}</p>
        <p v-if="confirmDelete" class="set-hint">{{ $t('serversSection.aviso_exclusao') }}</p>

        <form v-if="editing" class="set-group server-form" @submit.prevent="save">
            <label class="field">
                <span class="label">{{ $t('serversSection.nome') }}</span>
                <input v-model="form.name" class="input" :placeholder="$t('serversSection.nome_exemplo')" />
            </label>
            <label class="field">
                <span class="label">{{ $t('serversSection.dominio') }}</span>
                <input v-model="form.domain" class="input mono" :placeholder="$t('serversSection.dominio_exemplo')" />
            </label>
            <label class="field">
                <span class="label">{{ $t('serversSection.transporte') }}</span>
                <select v-model="form.transport" class="input">
                    <option value="ws">{{ $t('serversSection.ws') }}</option>
                    <option value="udp">{{ $t('serversSection.udp') }}</option>
                    <option value="tcp">{{ $t('serversSection.tcp') }}</option>
                    <option value="tls">{{ $t('serversSection.tls') }}</option>
                </select>
            </label>
            <label v-if="form.transport === 'ws'" class="field">
                <span class="label">{{ $t('serversSection.websocket') }}</span>
                <input v-model="form.wssUrl" class="input mono" :placeholder="$t('serversSection.wss_exemplo')" />
            </label>
            <label v-else class="field">
                <span class="label">{{ $t('serversSection.endereco') }}</span>
                <input
                    v-model="form.sipServer"
                    class="input mono"
                    :placeholder="$t('serversSection.endereco_exemplo')"
                />
            </label>
            <label class="field">
                <span class="label">{{ $t('serversSection.stun_turn') }}</span>
                <input v-model="form.iceServers" class="input mono" :placeholder="$t('serversSection.stun_exemplo')" />
            </label>
            <label class="field">
                <span class="label">{{ $t('serversSection.preset') }}</span>
                <select v-model="form.preset" class="input">
                    <option value="asterisk">{{ $t('serversSection.asterisk') }}</option>
                    <option value="kamailio">{{ $t('serversSection.kamailio') }}</option>
                    <option value="generic">{{ $t('serversSection.generico') }}</option>
                </select>
            </label>
            <label v-if="form.transport !== 'ws'" class="check">
                <input v-model="form.srtp" type="checkbox" /> {{ $t('serversSection.srtp') }}
            </label>
            <p v-if="error" class="bad">{{ error }}</p>
            <div class="actions">
                <button type="button" class="btn" @click="editing = null">{{ $t('serversSection.cancelar') }}</button>
                <button type="submit" class="btn primary" :disabled="Boolean(error)">
                    {{ $t('serversSection.salvar') }}
                </button>
            </div>
        </form>
        <button v-else class="btn" @click="edit()">{{ $t('serversSection.novo') }}</button>
        <p v-if="message" class="set-hint" role="status">{{ message }}</p>
    </section>
</template>

<style scoped>
.server-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 12px;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.check,
.bad,
.actions {
    grid-column: 1 / -1;
}
.bad {
    color: var(--bad);
    margin: 0;
}
.actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
.what small {
    display: block;
}
</style>
