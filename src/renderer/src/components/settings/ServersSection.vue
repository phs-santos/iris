<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@renderer/i18n'
import { useServersStore } from '@renderer/stores/servers'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useToastsStore } from '@renderer/stores/toasts'
import { canDeleteServer, SIMULATED_SERVER_ID, type SipServer } from '@shared/servers'
import ServerDialog from '../ServerDialog.vue'
import Icon from '../icons/Icon.vue'

/**
 * Servidores (RF-51): lista com o simulado fixo em primeiro, e a janela de servidor para criar e editar.
 * Servidor em uso não se apaga: a linha diz quantas contas usam e o que fazer.
 */
const servers = useServersStore()
const accounts = useAccountsStore()
/** Janela aberta: `null` fechada, `'new'` para criar, ou o servidor sendo editado. */
const editing = ref<SipServer | 'new' | null>(null)
const confirmDelete = ref<string | null>(null)
/** Recusa de apagar, por servidor: a mensagem fica na linha dele. */
const refused = ref<{ id: string; text: string } | null>(null)

const isSimulatedServer = (s: SipServer): boolean => s.id === SIMULATED_SERVER_ID
const usage = (s: SipServer): number => servers.usersOf(s.id).length

function askDelete(server: SipServer): void {
    const check = canDeleteServer(server, accounts.accounts)
    if (!check.ok && check.reason === 'em-uso') {
        confirmDelete.value = null
        refused.value = {
            id: server.id,
            text: check.count === 1 ? t('serversSection.em_uso_1') : t('serversSection.em_uso_n', { n: check.count })
        }
        return
    }
    refused.value = null
    confirmDelete.value = server.id
}

async function remove(server: SipServer): Promise<void> {
    const result = await servers.remove(server.id)
    confirmDelete.value = null
    if (result.ok) useToastsStore().show(t('serversSection.apagado', { name: server.name }))
    // Uma conta pode ter passado a usar o servidor entre a pergunta e a confirmação.
    else askDelete(server)
}

const describe = (s: SipServer): string =>
    isSimulatedServer(s)
        ? t('serversSection.simulado_dica')
        : s.transport === 'ws'
          ? s.wssUrl
          : `${s.transport.toUpperCase()} · ${s.sipServer || s.domain}`
</script>

<template>
    <section class="set-section">
        <div class="set-head head-row">
            <div>
                <h3>{{ $t('serversSection.servidores') }}</h3>
                <p>{{ $t('serversSection.explicacao') }}</p>
            </div>
            <button class="btn small primary" @click="editing = 'new'">
                <Icon name="plus" />{{ $t('serversSection.novo') }}
            </button>
        </div>

        <ul class="set-group list">
            <li v-for="s in servers.all" :key="s.id" class="srv" :class="{ fixed: isSimulatedServer(s) }">
                <span class="glyph" aria-hidden="true"><Icon name="server" /></span>
                <span class="what">
                    <span class="name">
                        <b>{{ s.name }}</b>
                        <span v-if="isSimulatedServer(s)" class="pill neutral">{{ $t('serversSection.fixo') }}</span>
                    </span>
                    <small class="mono">{{ isSimulatedServer(s) ? '' : `${s.domain} · ` }}{{ describe(s) }}</small>
                    <small v-if="refused?.id === s.id" class="refused" role="alert">{{ refused.text }}</small>
                </span>
                <span class="uses tabular">{{
                    usage(s) === 1 ? $t('serversSection.uma_conta') : $t('serversSection.n_contas', { n: usage(s) })
                }}</span>
                <span v-if="!isSimulatedServer(s)" class="acts">
                    <template v-if="confirmDelete === s.id">
                        <button class="btn small stop" @click="remove(s)">{{ $t('serversSection.confirmar') }}</button>
                        <button class="btn small" @click="confirmDelete = null">
                            {{ $t('serversSection.cancelar') }}
                        </button>
                    </template>
                    <template v-else>
                        <button
                            class="btn small"
                            :aria-label="$t('serversSection.editar_nome', { name: s.name })"
                            @click="editing = s"
                        >
                            <Icon name="edit" />{{ $t('serversSection.editar') }}
                        </button>
                        <button
                            class="btn small ghost"
                            :aria-label="$t('serversSection.excluir_nome', { name: s.name })"
                            :title="$t('serversSection.excluir')"
                            @click="askDelete(s)"
                        >
                            <Icon name="trash" />
                        </button>
                    </template>
                </span>
            </li>
        </ul>

        <ServerDialog
            v-if="editing"
            :server="editing === 'new' ? undefined : editing"
            @close="editing = null"
            @saved="editing = null"
        />
    </section>
</template>

<style scoped>
.head-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
}
.head-row > div {
    flex: 1;
}
.btn .icon {
    width: 13px;
    height: 13px;
}
.list {
    list-style: none;
    margin: 0;
    padding: 0;
}
.srv {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
}
.srv:last-child {
    border-bottom: 0;
}
.srv.fixed {
    background: var(--panel-2);
}
.glyph {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: var(--radius-sm);
    background: var(--raise);
    color: var(--muted);
}
.glyph .icon {
    width: 14px;
    height: 14px;
}
.what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.name {
    display: flex;
    align-items: center;
    gap: 6px;
}
.what small {
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.what small.refused {
    color: var(--bad-text);
    white-space: normal;
    font-family: var(--sans);
}
.uses {
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
}
.acts {
    display: flex;
    gap: 4px;
}
</style>
