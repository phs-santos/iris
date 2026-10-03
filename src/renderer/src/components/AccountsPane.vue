<script setup lang="ts">
import type { Account } from '@shared/types'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useAiStore } from '@renderer/stores/ai'
import { useCallsStore } from '@renderer/stores/calls'
import { describeStatus } from '@renderer/lib/accounts'
import { ref } from 'vue'

const emit = defineEmits<{ new: []; edit: [account: Account]; health: [id: string] }>()
const accounts = useAccountsStore()
const ai = useAiStore()
const calls = useCallsStore()
const confirmDelete = ref<string | null>(null)

function callsOf(id: string): number {
    return calls.active.filter((c) => c.accountId === id).length
}

function toggle(account: Account): void {
    const state = accounts.statusOf(account.id).state
    if (state === 'disconnected' || state === 'error') void accounts.register(account.id)
    else void accounts.unregister(account.id)
}

async function remove(id: string): Promise<void> {
    confirmDelete.value = null
    await accounts.remove(id)
}
</script>

<template>
    <aside class="pane">
        <div class="head">
            <span class="label">Contas</span>
            <button class="btn small ghost" @click="emit('new')">+ Nova</button>
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
                            </div>
                        </div>
                        <div class="tags">
                            <span v-if="callsOf(account.id)" class="tag busy" title="Chamadas ativas">{{
                                callsOf(account.id)
                            }}</span>
                            <span v-if="account.autoAnswer.enabled" class="tag" title="Auto-atender">AA</span>
                            <span v-if="account.simulated" class="tag" title="PBX simulado">SIM</span>
                        </div>
                    </button>

                    <div v-if="accounts.selectedId === account.id" class="actions" @click.stop>
                        <button class="btn small" @click="toggle(account)">
                            {{
                                ['disconnected', 'error'].includes(accounts.statusOf(account.id).state)
                                    ? 'Registrar'
                                    : 'Desregistrar'
                            }}
                        </button>
                        <button class="btn small" @click="emit('edit', account)">Editar</button>
                        <button class="btn small" @click="emit('health', account.id)">Saúde</button>
                        <button
                            v-if="accounts.statusOf(account.id).state === 'error'"
                            class="btn small"
                            @click="ai.explainAccount(account.id)"
                        >
                            Por que falhou?
                        </button>
                        <button class="btn small" @click="accounts.duplicate(account.id)">Duplicar</button>
                        <button
                            v-if="confirmDelete !== account.id"
                            class="btn small"
                            @click="confirmDelete = account.id"
                        >
                            Excluir
                        </button>
                        <template v-else>
                            <button class="btn small stop" @click="remove(account.id)">Confirmar exclusão</button>
                            <button class="btn small" @click="confirmDelete = null">Cancelar</button>
                        </template>
                    </div>
                </div>
            </section>

            <p v-if="accounts.loaded && accounts.accounts.length === 0" class="empty">
                Nenhuma conta ainda. Clique em <b>+ Nova</b> para cadastrar o primeiro ramal.
            </p>
        </div>
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
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.empty {
    color: var(--muted);
    padding: 8px;
}
</style>
