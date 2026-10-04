<script setup lang="ts">
import { ref } from 'vue'
import { formatDuration, type HistoryEntry } from '@shared/history'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useHistoryStore } from '@renderer/stores/history'
import LadderDialog from './LadderDialog.vue'

/** Histórico de chamadas (RF-40): o que aconteceu com cada chamada, depois que o cartão dela sumiu. */
const emit = defineEmits<{ dialed: [] }>()
const history = useHistoryStore()
const accounts = useAccountsStore()
const calls = useCallsStore()
/** Conta cujo Fluxo SIP está aberto; o diagrama vem do log, que só existe enquanto o app está aberto. */
const ladderFor = ref<string | null>(null)
const confirming = ref(false)

const when = (entry: HistoryEntry): string =>
    new Date(entry.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })

const canRedial = (entry: HistoryEntry): boolean => accounts.statusOf(entry.accountId).state === 'registered'

async function redial(entry: HistoryEntry): Promise<void> {
    accounts.selectedId = entry.accountId
    emit('dialed')
    await calls.dial(entry.accountId, entry.remote).catch(() => undefined)
}

function clear(): void {
    history.clear()
    confirming.value = false
}
</script>

<template>
    <div class="history">
        <div class="head">
            <span class="label tabular">{{ $t('historyPane.chamadas', { length: history.entries.length }) }}</span>
            <span class="spacer"></span>
            <template v-if="history.entries.length">
                <button v-if="!confirming" class="btn small" @click="confirming = true">
                    {{ $t('historyPane.limpar') }}
                </button>
                <template v-else>
                    <button class="btn small stop" @click="clear">{{ $t('historyPane.confirmar_limpeza') }}</button>
                    <button class="btn small" @click="confirming = false">{{ $t('historyPane.cancelar') }}</button>
                </template>
            </template>
        </div>
        <p v-if="history.entries.length === 0" class="empty">{{ $t('historyPane.vazio') }}</p>
        <ul v-else class="list">
            <li v-for="entry in history.entries" :key="entry.id" class="entry" :class="{ failed: entry.failed }">
                <span
                    class="dir"
                    :title="entry.direction === 'out' ? $t('historyPane.feita') : $t('historyPane.recebida')"
                    aria-hidden="true"
                    >{{ entry.direction === 'out' ? '→' : '←' }}</span
                >
                <span class="who">
                    <b class="mono">{{ entry.remote }}</b>
                    <span v-if="entry.remoteName" class="name">{{ entry.remoteName }}</span>
                    <small class="mono">
                        <span class="sr-only">{{
                            entry.direction === 'out' ? $t('historyPane.feita') : $t('historyPane.recebida')
                        }}</span>
                        {{ entry.accountName }} · {{ when(entry) }}
                    </small>
                </span>
                <span class="result">
                    <span class="mono tabular">{{
                        entry.answered ? formatDuration(entry.durationMs) : $t('historyPane.nao_atendida')
                    }}</span>
                    <small>{{ entry.result }}</small>
                </span>
                <span class="actions">
                    <button
                        class="btn small"
                        :disabled="!canRedial(entry)"
                        :aria-label="$t('historyPane.ligar_de_novo_para', { remote: entry.remote })"
                        @click="redial(entry)"
                    >
                        {{ $t('historyPane.ligar_de_novo') }}
                    </button>
                    <button
                        class="btn small"
                        :aria-label="$t('historyPane.fluxo_sip_da_conta', { accountName: entry.accountName })"
                        @click="ladderFor = entry.accountId"
                    >
                        {{ $t('historyPane.fluxo_sip') }}
                    </button>
                </span>
            </li>
        </ul>
        <LadderDialog v-if="ladderFor" :account-id="ladderFor" @close="ladderFor = null" />
    </div>
</template>

<style scoped>
.history {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 6px;
}
.spacer {
    flex: 1;
}
.empty {
    color: var(--muted);
    margin: 8px 14px;
}
.list {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 0 14px 14px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.entry {
    display: grid;
    grid-template-columns: 18px minmax(0, 1.4fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
}
.entry.failed {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--line));
}
.dir {
    color: var(--muted);
}
.who,
.result {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.35;
}
.who .name {
    color: var(--muted);
}
.who small,
.result small {
    color: var(--muted);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.actions {
    display: flex;
    gap: 6px;
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
}
</style>
