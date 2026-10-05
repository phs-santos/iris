<script setup lang="ts">
import { t } from '@renderer/i18n'
import type { Account } from '@shared/types'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useAiStore } from '@renderer/stores/ai'
import { useCallsStore } from '@renderer/stores/calls'
import { describeStatus, explainRegError } from '@renderer/lib/accounts'
import { ref } from 'vue'
import MenuButton from './MenuButton.vue'
import SipRequestDialog from './SipRequestDialog.vue'
import LoadDialog from './LoadDialog.vue'
import type { PresenceState } from '@shared/presence'
import { useLogStore } from '@renderer/stores/log'

const emit = defineEmits<{ new: []; edit: [account: Account]; health: [id: string] }>()
const accounts = useAccountsStore()
const ai = useAiStore()
const calls = useCallsStore()
const confirmDelete = ref<string | null>(null)
const log = useLogStore()
/** Conta com a tela de pedido SIP manual aberta (RF-45). */
const requestFor = ref<string | null>(null)
/** Conta com a tela do teste de carga aberta (RF-42). */
const loadFor = ref<string | null>(null)

function callsOf(id: string): number {
    return calls.active.filter((c) => c.accountId === id).length
}

function toggle(account: Account): void {
    const state = accounts.statusOf(account.id).state
    if (state === 'disconnected' || state === 'error') void accounts.register(account.id)
    else void accounts.unregister(account.id)
}

const presenceLabel = (state: PresenceState): string =>
    ({
        idle: t('accountsPane.blf_livre'),
        ringing: t('accountsPane.blf_tocando'),
        busy: t('accountsPane.blf_ocupado'),
        unknown: t('accountsPane.blf_sem_noticia')
    })[state]

/** Ações menos usadas ficam no menu ⋯, para a conta escolhida não virar uma parede de botões. */
function moreActions(account: Account): Array<{ label: string; action: () => void; danger?: boolean }> {
    const engine = accounts.engineOf(account.id)
    const exportPcap = async (withRtp: boolean): Promise<void> => {
        const path = await engine?.exportCapture?.(withRtp).catch((error: Error) => {
            log.add(account.id, 'error', 'event', t('accountsPane.pcap_falhou', { message: error.message }))
            return null
        })
        if (path) log.add(account.id, 'info', 'event', t('accountsPane.pcap_salvo', { path }))
    }
    return [
        { label: t('accountsPane.saude'), action: () => emit('health', account.id) },
        { label: t('accountsPane.duplicar'), action: () => void accounts.duplicate(account.id) },
        // Só com a conta registrada num motor que sabe fazer isso (RF-44, RF-45).
        ...(engine?.request
            ? [{ label: t('accountsPane.requisicao_sip'), action: () => (requestFor.value = account.id) }]
            : []),
        ...(engine?.loadTest
            ? [{ label: t('accountsPane.teste_de_carga'), action: () => (loadFor.value = account.id) }]
            : []),
        ...(engine?.exportCapture
            ? [
                  { label: t('accountsPane.exportar_pcap'), action: () => void exportPcap(false) },
                  { label: t('accountsPane.exportar_pcap_com_audio'), action: () => void exportPcap(true) }
              ]
            : []),
        { label: t('accountsPane.excluir'), action: () => (confirmDelete.value = account.id), danger: true }
    ]
}

const allActions = [
    { label: t('accountsPane.registrar_todas'), action: () => void accounts.registerAll() },
    { label: t('accountsPane.desregistrar_todas'), action: () => void accounts.unregisterAll() }
]

async function remove(id: string): Promise<void> {
    confirmDelete.value = null
    await accounts.remove(id)
}
</script>

<template>
    <aside class="pane">
        <div class="head">
            <span class="label">{{ $t('accountsPane.contas') }}</span>
            <span class="head-actions">
                <MenuButton :label="$t('accountsPane.acoes_de_todas_as_contas')" text="Todas" :items="allActions" />
                <button class="btn small ghost" @click="emit('new')">{{ $t('accountsPane.nova') }}</button>
            </span>
        </div>

        <div class="list">
            <section v-for="group in accounts.groups" :key="group.domain" class="group">
                <div class="pbx mono">{{ group.domain }}</div>
                <div
                    v-for="account in group.accounts"
                    :key="account.id"
                    class="acc"
                    :class="{ sel: accounts.selectedId === account.id }"
                    @click="accounts.selectedId = account.id"
                >
                    <!-- Só a linha é botão; as ações ficam ao lado, não dentro dele (RNF-12). -->
                    <button
                        type="button"
                        class="row"
                        :aria-pressed="accounts.selectedId === account.id"
                        :aria-label="`${account.name}, ${account.extension}, ${describeStatus(accounts.statusOf(account.id))}`"
                        @click.stop="accounts.selectedId = account.id"
                    >
                        <span class="dot" :class="accounts.statusOf(account.id).state"></span>
                        <span class="swatch" :style="{ background: account.color }"></span>
                        <div class="info">
                            <div class="name">{{ account.name }}</div>
                            <div class="status mono">
                                {{ account.extension }} · {{ describeStatus(accounts.statusOf(account.id)) }}
                                <template v-if="accounts.retryOf(account.id)">
                                    {{
                                        $t('accountsPane.tentando_de_novo', {
                                            p: accounts.retryOf(account.id)?.attempt,
                                            p2: accounts.retryOf(account.id)?.max
                                                ? ` de ${accounts.retryOf(account.id)?.max}`
                                                : ''
                                        })
                                    }}
                                </template>
                            </div>
                        </div>
                        <div class="tags">
                            <span
                                v-if="callsOf(account.id)"
                                class="tag busy"
                                :title="$t('accountsPane.chamadas_ativas')"
                                >{{ callsOf(account.id) }}</span
                            >
                            <span
                                v-if="account.autoAnswer.enabled"
                                class="tag"
                                :title="$t('accountsPane.auto_atender')"
                                >{{ $t('accountsPane.aa') }}</span
                            >
                            <span v-if="account.simulated" class="tag" :title="$t('accountsPane.pbx_simulado')">{{
                                $t('accountsPane.sim')
                            }}</span>
                        </div>
                    </button>

                    <div v-if="accounts.presenceOf(account).length || accounts.mwiOf(account.id)?.waiting" class="blf">
                        <span
                            v-for="p in accounts.presenceOf(account)"
                            :key="p.extension"
                            class="lamp mono"
                            :class="p.state"
                            :title="presenceLabel(p.state)"
                        >
                            {{ p.extension }}<span class="sr-only"> {{ presenceLabel(p.state) }}</span>
                        </span>
                        <span v-if="accounts.mwiOf(account.id)?.waiting" class="lamp mwi">
                            {{ $t('accountsPane.correio', { n: accounts.mwiOf(account.id)?.newMessages ?? 0 }) }}
                        </span>
                    </div>

                    <div
                        v-if="explainRegError(accounts.statusOf(account.id))"
                        class="problem"
                        role="status"
                        @click.stop
                    >
                        <b>{{ explainRegError(accounts.statusOf(account.id))?.title }}</b>
                        <span>{{ explainRegError(accounts.statusOf(account.id))?.hint }}</span>
                        <button class="btn small" @click="ai.explainAccount(account.id)">
                            {{ $t('accountsPane.por_que_falhou') }}
                        </button>
                    </div>

                    <div v-if="accounts.selectedId === account.id" class="actions" @click.stop>
                        <button class="btn small" @click="toggle(account)">
                            {{
                                ['disconnected', 'error'].includes(accounts.statusOf(account.id).state)
                                    ? $t('accountsPane.registrar')
                                    : $t('accountsPane.desregistrar')
                            }}
                        </button>
                        <button class="btn small" @click="emit('edit', account)">
                            {{ $t('accountsPane.editar') }}
                        </button>
                        <MenuButton
                            v-if="confirmDelete !== account.id"
                            :label="$t('accountsPane.mais_acoes_de', { name: account.name })"
                            :items="moreActions(account)"
                        />
                        <template v-else>
                            <button class="btn small stop" @click="remove(account.id)">
                                {{ $t('accountsPane.confirmar_exclusao') }}
                            </button>
                            <button class="btn small" @click="confirmDelete = null">
                                {{ $t('accountsPane.cancelar') }}
                            </button>
                        </template>
                    </div>
                </div>
            </section>

            <p v-if="accounts.loaded && accounts.accounts.length === 0" class="empty">
                {{ $t('accountsPane.nenhuma_conta_ainda_clique_em') }} <b>{{ $t('accountsPane.nova') }}</b>
                {{ $t('accountsPane.para_cadastrar_o_primeiro_ramal') }}
            </p>
        </div>
        <SipRequestDialog v-if="requestFor" :account-id="requestFor" @close="requestFor = null" />
        <LoadDialog v-if="loadFor" :account-id="loadFor" @close="loadFor = null" />
    </aside>
</template>

<style scoped>
.pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--panel);
}
.head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 6px;
}
.list {
    flex: 1;
    overflow: auto;
    padding: 0 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.pbx {
    font-size: 11px;
    color: var(--muted);
    padding: 4px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
}
.acc {
    padding: 8px;
    border-radius: 7px;
    border: 1px solid transparent;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.acc:hover {
    background: var(--panel-2);
}
.acc.sel {
    background: var(--panel-2);
    border-color: var(--line);
}
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
}
.swatch {
    width: 3px;
    height: 26px;
    border-radius: 2px;
    flex: none;
}
.info {
    min-width: 0;
    flex: 1;
}
.name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.status {
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.tags {
    display: flex;
    gap: 4px;
}
.tag {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0 5px;
}
.tag.busy {
    color: #6fe0a6;
    border-color: rgba(63, 207, 134, 0.5);
}
.head-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}
.problem {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(240, 103, 94, 0.4);
    background: rgba(240, 103, 94, 0.1);
    font-size: 12px;
    cursor: default;
}
.problem b {
    color: var(--bad-text);
}
.problem span {
    color: var(--fg);
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.empty {
    color: var(--muted);
    padding: 8px;
}
.blf {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 10px 8px 34px;
}
.lamp {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 9px;
    border: 1px solid var(--line);
    color: var(--muted);
}
.lamp.idle {
    border-color: color-mix(in srgb, var(--ok) 55%, var(--line));
    color: var(--fg);
}
.lamp.ringing {
    border-color: var(--warn);
    color: var(--warn);
}
.lamp.busy {
    border-color: var(--bad);
    background: color-mix(in srgb, var(--bad) 18%, transparent);
    color: var(--fg);
}
.lamp.mwi {
    border-color: var(--accent);
    color: var(--fg);
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
}
</style>
