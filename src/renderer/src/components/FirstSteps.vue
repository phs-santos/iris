<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@renderer/i18n'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useHistoryStore } from '@renderer/stores/history'
import { usePreferencesStore } from '@renderer/stores/preferences'
import { useServersStore } from '@renderer/stores/servers'

/**
 * Primeiros passos (RNF-11: a primeira chamada em até 2 minutos). Um quadro no alto da aba Telefone,
 * não uma janela por cima: dá para seguir usando o app. Cada passo se marca sozinho, e o quadro some
 * quando os três estão feitos ou a pessoa fecha.
 */
const emit = defineEmits<{ servers: []; account: [] }>()
const accounts = useAccountsStore()
const calls = useCallsStore()
const history = useHistoryStore()
const prefs = usePreferencesStore()
const servers = useServersStore()

const real = computed(() => accounts.accounts.filter((a) => !a.simulated))
const steps = computed(() => [
    {
        done: history.entries.some((e) => e.answered),
        title: t('firstSteps.passo1'),
        text: t('firstSteps.passo1_texto'),
        action: t('firstSteps.passo1_acao'),
        run: tryCall
    },
    {
        done: servers.servers.length > 0 || real.value.length > 0,
        title: t('firstSteps.passo2'),
        text: t('firstSteps.passo2_texto'),
        action: t('firstSteps.passo2_acao'),
        run: () => emit('servers')
    },
    {
        done: real.value.some((a) => accounts.statusOf(a.id).state === 'registered'),
        title: t('firstSteps.passo3'),
        text: t('firstSteps.passo3_texto'),
        action: t('firstSteps.passo3_acao'),
        run: () => emit('account')
    }
])
const visible = computed(() => !prefs.profile.tourDone && steps.value.some((s) => !s.done))
const doneCount = computed(() => steps.value.filter((s) => s.done).length)

/** Liga da conta simulada para a URA 8000: a chamada de exemplo, sem PBX nenhum. */
function tryCall(): void {
    const from = accounts.accounts.find((a) => a.simulated && accounts.statusOf(a.id).state === 'registered')
    if (!from) return
    accounts.selectedId = from.id
    void calls.dial(from.id, '8000').catch(() => undefined)
}

const close = (): Promise<void> => prefs.setProfile({ tourDone: true })
</script>

<template>
    <section v-if="visible" class="first-steps" :aria-label="$t('firstSteps.titulo')">
        <header>
            <b>{{ $t('firstSteps.titulo') }}</b>
            <span class="count tabular">{{ $t('firstSteps.contagem', { n: doneCount }) }}</span>
            <button class="btn small ghost" :aria-label="$t('firstSteps.fechar_rotulo')" @click="close">
                {{ $t('firstSteps.fechar') }}
            </button>
        </header>
        <ol>
            <li v-for="(step, i) in steps" :key="i" :class="{ done: step.done }">
                <span class="mark" aria-hidden="true">{{ step.done ? '✓' : i + 1 }}</span>
                <span class="text">
                    <b>{{ step.title }}</b>
                    <small>{{ step.text }}</small>
                </span>
                <span v-if="step.done" class="sr-only">{{ $t('firstSteps.feito') }}</span>
                <button v-else class="btn small" @click="step.run">{{ step.action }}</button>
            </li>
        </ol>
    </section>
</template>

<style scoped>
.first-steps {
    margin: 10px 14px 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 7%, var(--panel));
}
header {
    display: flex;
    align-items: center;
    gap: 8px;
}
.count {
    flex: 1;
    color: var(--muted);
    font-size: 12px;
}
ol {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
li {
    display: flex;
    align-items: center;
    gap: 10px;
}
.mark {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    background: var(--raise);
}
li.done .mark {
    background: color-mix(in srgb, var(--ok) 55%, #000);
    color: #fff;
}
.text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.35;
}
.text small {
    color: var(--muted);
}
li.done .text b {
    text-decoration: line-through;
    color: var(--muted);
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
}
</style>
