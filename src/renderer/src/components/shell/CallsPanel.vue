<script setup lang="ts">
import { computed } from 'vue'
import { useCallsStore } from '@renderer/stores/calls'
import CallRow from './CallRow.vue'
import IncomingRow from './IncomingRow.vue'
import AccountDetails from './AccountDetails.vue'

/** Coluna de chamadas: as recebidas no alto, depois as outras em linhas; sem chamada, os detalhes da conta. */
const emit = defineEmits<{ 'save-contact': [accountId: string, number: string] }>()
const calls = useCallsStore()
const ringing = computed(() => calls.ringingIncoming)
const others = computed(() => calls.calls.filter((c) => !(c.direction === 'in' && c.state === 'ringing')))
const activeCount = computed(() => calls.active.length - ringing.value.length)
</script>

<template>
    <div class="panel">
        <header class="col-head">
            <h2>{{ $t('app.chamadas') }}</h2>
            <span class="count tabular">
                <span>{{
                    activeCount === 1 ? $t('callsPanel.ativa_1') : $t('callsPanel.ativas', { length: activeCount })
                }}</span>
                <template v-if="ringing.length">
                    ·
                    <b>{{
                        ringing.length === 1
                            ? $t('callsPanel.entrando_1')
                            : $t('callsPanel.entrando', { n: ringing.length })
                    }}</b>
                </template>
            </span>
        </header>
        <!-- Rola com muitas chamadas, inclusive as encerradas, que não têm botão: o teclado precisa alcançar (RNF-12). -->
        <div class="list" tabindex="0" role="region" :aria-label="$t('callsPanel.lista')">
            <IncomingRow v-for="call in ringing" :key="call.id" :call="call" />
            <CallRow
                v-for="call in others"
                :key="call.id"
                :call="call"
                @save-contact="(id, n) => emit('save-contact', id, n)"
            />
            <AccountDetails v-if="calls.calls.length === 0" />
        </div>
    </div>
</template>

<style scoped>
.panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
    flex: none;
}
.col-head h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
}
.count {
    font-size: 12px;
    color: var(--muted);
}
.count b {
    color: var(--accent-text);
    font-weight: 600;
}
.list {
    flex: 1;
    min-height: 0;
    overflow: auto;
}
.list:focus-visible {
    outline-offset: -2px;
}
</style>
