<script setup lang="ts">
import { computed } from 'vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import { duration, now } from '@renderer/lib/now'
import Icon from '../icons/Icon.vue'

/** Chamada recebida esperando atendimento, no alto da coluna, de qualquer conta (RF-10). */
const props = defineProps<{ call: CallView }>()
const accounts = useAccountsStore()
const calls = useCallsStore()
const account = computed(() => accounts.byId(props.call.accountId))
const who = computed(() => props.call.remoteName || props.call.remote)
const autoIn = computed(() => {
    const at = props.call.autoAnswerAt
    return at ? Math.max(0, Math.ceil((at - now.value) / 1000)) : null
})
</script>

<template>
    <div
        class="call incoming"
        :style="{ '--account': account?.color }"
        role="region"
        :aria-label="$t('incomingRow.chamada_recebida_de', { p: who })"
    >
        <span class="ring" aria-hidden="true"><Icon name="phone" /></span>
        <div class="who">
            <div class="title">
                <b class="name">{{ who }}</b>
                <span class="pill info">{{ $t('incomingRow.tocando') }}</span>
                <span class="timer mono tabular">{{ duration(call.startedAt, now) }}</span>
            </div>
            <div class="meta">
                <span class="route mono">{{ account?.extension ?? '?' }} ← {{ call.remote }}</span>
                <span>{{ $t('incomingRow.para') }}</span>
                <span class="acct-tag"
                    ><i aria-hidden="true"></i>{{ account?.name ?? accounts.nameOf(call.accountId) }}</span
                >
                <span v-if="autoIn !== null" class="auto">{{ $t('incomingRow.atende_em', { s: autoIn }) }}</span>
            </div>
        </div>
        <div class="controls">
            <button class="btn go" @click="calls.answer(call.id)">
                <Icon name="phone" />{{ $t('incomingRow.atender') }}
            </button>
            <button class="btn stop" @click="calls.reject(call.id)">
                <Icon name="hangup" />{{ $t('incomingRow.recusar') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
/* Azul (cor de destaque) com o telefone pulsando: a chamada que chega é a primeira coisa da coluna. */
.incoming {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 9px 12px 9px 15px;
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
    background: color-mix(in srgb, var(--accent) 9%, var(--panel));
    box-shadow: inset 3px 0 0 var(--accent);
}
.ring {
    position: relative;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent-strong);
    color: #fff;
    flex: none;
}
.ring :deep(.icon) {
    width: 14px;
    height: 14px;
}
.ring::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    opacity: 0.5;
}
@media (prefers-reduced-motion: no-preference) {
    .ring::after {
        animation: ripple 1.3s ease-out infinite;
    }
    .ring :deep(.icon) {
        animation: shake 1.3s ease-in-out infinite;
    }
}
@keyframes ripple {
    from {
        transform: scale(0.85);
        opacity: 0.7;
    }
    to {
        transform: scale(1.35);
        opacity: 0;
    }
}
@keyframes shake {
    0%,
    40%,
    100% {
        transform: rotate(0);
    }
    10%,
    30% {
        transform: rotate(-14deg);
    }
    20% {
        transform: rotate(14deg);
    }
}
.who {
    flex: 1 1 260px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.title {
    display: flex;
    align-items: center;
    gap: 8px;
}
.name {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* Fundo cheio na cor de destaque mais escura: texto branco em AA sobre a faixa azul. */
.pill.info {
    background: var(--accent-strong);
    color: #fff;
}
.timer {
    margin-left: auto;
    font-size: 12px;
    color: var(--accent-text);
}
.meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 8px;
    font-size: 11.5px;
    color: var(--muted);
}
.route {
    color: var(--fg);
}
.auto {
    color: var(--accent-text);
}
.controls {
    display: flex;
    gap: 6px;
    margin-left: auto;
}
.controls :deep(.icon) {
    width: 14px;
    height: 14px;
}
.controls .btn {
    min-height: 30px;
    font-weight: 600;
}
</style>
