<script setup lang="ts">
import { computed, ref } from 'vue'
import { initials } from '@shared/picker'
import { t } from '@renderer/i18n'
import { describeStatus } from '@renderer/lib/accounts'
import { useAccountsStore } from '@renderer/stores/accounts'
import Icon from '../icons/Icon.vue'

/**
 * Barra de ícones à esquerda: a conta atual no topo (abre o seletor), as telas no meio e Ajustes no pé.
 * Hoje a única tela é o Telefone; Cenários entra aqui quando voltar.
 */
defineProps<{ pickerOpen: boolean; updatePending: boolean }>()
const emit = defineEmits<{ picker: []; settings: []; guide: [] }>()
const accounts = useAccountsStore()
const avatar = ref<HTMLButtonElement | null>(null)

const current = computed(() => accounts.current)
const state = computed(() => (current.value ? accounts.statusOf(current.value.id).state : 'disconnected'))
/** Contas com erro além da atual: a atual já mostra o próprio estado no avatar. */
const othersFailing = computed(
    () =>
        accounts.accounts.filter((a) => a.id !== current.value?.id && accounts.statusOf(a.id).state === 'error').length
)
const failingText = computed(() =>
    othersFailing.value === 1 ? t('rail.com_erro_1') : t('rail.com_erro_n', { n: othersFailing.value })
)
const label = computed(() => {
    if (!current.value) return t('rail.sem_conta')
    const base = t('rail.conta_atual', {
        name: current.value.name,
        state: describeStatus(accounts.statusOf(current.value.id))
    })
    return othersFailing.value ? `${base}. ${failingText.value}` : base
})

defineExpose({ focusAvatar: () => avatar.value?.focus() })
</script>

<template>
    <nav class="rail" :aria-label="$t('rail.navegacao')">
        <button
            ref="avatar"
            type="button"
            class="me"
            :class="{ open: pickerOpen }"
            aria-haspopup="dialog"
            :aria-expanded="pickerOpen"
            :aria-label="label"
            :title="label"
            @click="emit('picker')"
        >
            <span class="avatar" :style="{ '--account': current?.color }">
                {{ current ? initials(current.name) : '?' }}
                <span class="state" :class="state" aria-hidden="true"></span>
                <span v-if="othersFailing" class="badge tabular" aria-hidden="true">{{ othersFailing }}</span>
            </span>
            <span class="ext mono">{{ current?.extension ?? '—' }}</span>
        </button>

        <hr />

        <a class="item on" aria-current="page" href="#" @click.prevent>
            <Icon name="phone" />
            <span>{{ $t('rail.telefone') }}</span>
        </a>

        <span class="spacer"></span>

        <button type="button" class="item" :title="$t('rail.guia_dica')" @click="emit('guide')">
            <Icon name="book" />
            <span>{{ $t('rail.guia') }}</span>
        </button>
        <button
            type="button"
            class="item"
            :title="updatePending ? $t('rail.atualizacao') : $t('rail.ajustes_dica')"
            @click="emit('settings')"
        >
            <span class="icon-wrap">
                <Icon name="gear" />
                <i v-if="updatePending" class="pending" aria-hidden="true"></i>
            </span>
            <span>{{ $t('rail.ajustes') }}</span>
            <span v-if="updatePending" class="sr">{{ $t('rail.atualizacao') }}</span>
        </button>
    </nav>
</template>

<style scoped>
.rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 0 8px;
    background: var(--bg);
    border-right: 1px solid var(--line);
    min-height: 0;
}

/* Conta atual */
.me {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 52px;
    padding: 4px 0 5px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    cursor: pointer;
    transition: background 120ms;
}
.me:hover,
.me.open {
    background: var(--raise);
}
.avatar {
    position: relative;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 11px;
    background: var(--account, var(--raise));
    /* As cores das contas são claras: o texto escuro passa no contraste AA nas duas. */
    color: #0d141b;
    font-weight: 700;
    font-size: 12.5px;
    letter-spacing: 0.02em;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    transition: box-shadow 120ms;
}
.me.open .avatar {
    box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.08),
        0 0 0 3px var(--focus-ring);
}
/* Estado da conta atual, com a mesma forma da bolinha das listas (RNF-12). */
.state {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2.5px solid var(--bg);
    background: var(--bg);
    box-shadow: inset 0 0 0 2px var(--muted);
}
.state.registered {
    background: var(--ok);
    box-shadow: none;
}
.state.connecting,
.state.connected {
    box-shadow: inset 0 0 0 2px var(--warn);
}
@media (prefers-reduced-motion: no-preference) {
    .state.connecting,
    .state.connected {
        animation: pulse 1.2s ease-in-out infinite;
    }
}
.state.error {
    border-radius: 2px;
    background: var(--bad);
    box-shadow: none;
    transform: rotate(45deg) scale(0.9);
}
.me:hover .state,
.me.open .state {
    border-color: var(--raise);
}
.badge {
    position: absolute;
    top: -5px;
    right: -8px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    border: 2px solid var(--bg);
    background: var(--bad-strong);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 13px;
    text-align: center;
}
.ext {
    font-size: 10.5px;
    color: var(--muted);
    max-width: 50px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

hr {
    width: 28px;
    margin: 6px 0;
    border: 0;
    border-top: 1px solid var(--line);
}

/* Telas e Ajustes */
.item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 52px;
    padding: 7px 0 5px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    font-size: 10.5px;
    text-decoration: none;
    cursor: pointer;
    transition:
        background 120ms,
        color 120ms;
}
.item :deep(.icon) {
    font-size: 18px;
}
.item:hover {
    background: var(--raise);
    color: var(--fg);
}
/* Tela aberta: fundo de seleção, cor de destaque e texto em negrito. */
.item.on {
    background: var(--selected);
    color: var(--accent-text);
    font-weight: 600;
}
.spacer {
    flex: 1;
}
.icon-wrap {
    position: relative;
}
.pending {
    position: absolute;
    top: -2px;
    right: -4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    border: 1.5px solid var(--bg);
}
.sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
</style>
