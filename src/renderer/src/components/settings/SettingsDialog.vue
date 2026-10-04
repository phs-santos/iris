<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UpdateChannel, UpdateInfo } from '@shared/types'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { usePreferencesStore, type SettingsSection } from '@renderer/stores/preferences'
import ProfileSection from './ProfileSection.vue'
import AppearanceSection from './AppearanceSection.vue'
import AudioSection from './AudioSection.vue'
import AiSection from './AiSection.vue'
import SecuritySection from './SecuritySection.vue'
import ImportExportSection from './ImportExportSection.vue'
import UpdateSection from './UpdateSection.vue'

/** Tela única de Configurações: junta Áudio, Importar/Exportar, Atualização, IA e certificados. */
const props = defineProps<{ section: SettingsSection; update: UpdateInfo | null }>()
const emit = defineEmits<{ close: []; channel: [channel: UpdateChannel] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const prefs = usePreferencesStore()

const current = ref<SettingsSection>(props.section)
const sections = computed(() =>
    [
        { id: 'profile' as const, name: 'Perfil' },
        { id: 'appearance' as const, name: 'Aparência' },
        { id: 'audio' as const, name: 'Áudio' },
        { id: 'ai' as const, name: 'Ajuda da IA' },
        { id: 'security' as const, name: 'Certificados' },
        { id: 'data' as const, name: 'Importar e exportar' },
        { id: 'update' as const, name: 'Atualização', badge: props.update?.currentVersion }
    ].filter((s) => s.id !== 'update' || props.update)
)

const initials = computed(() => {
    const words = (prefs.profile.name ?? '').split(/\s+/).filter(Boolean)
    return words.length
        ? words
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join('')
        : '?'
})

/** Setas para cima e para baixo trocam de seção, como numa lista de abas vertical (RNF-12). */
function onNavKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const list = sections.value
    const index = list.findIndex((s) => s.id === current.value)
    const next = list[(index + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]
    current.value = next.id
    dialogEl.value?.querySelector<HTMLElement>(`#set-tab-${next.id}`)?.focus()
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <div
            ref="dialogEl"
            class="dialog settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabindex="-1"
        >
            <header>
                <h2 id="settings-title">Configurações</h2>
                <button class="btn small ghost" aria-label="Fechar" @click="emit('close')">✕</button>
            </header>
            <div class="split">
                <nav>
                    <div class="me">
                        <span class="avatar" aria-hidden="true">{{ initials }}</span>
                        <span class="who">
                            <b>{{ prefs.profile.name || 'Sem nome' }}</b>
                            <small class="tabular">
                                {{ accounts.accounts.length }} contas · {{ accounts.groups.length }} PBX
                            </small>
                        </span>
                    </div>
                    <div role="tablist" aria-orientation="vertical" aria-label="Seções" @keydown="onNavKey">
                        <button
                            v-for="s in sections"
                            :id="`set-tab-${s.id}`"
                            :key="s.id"
                            role="tab"
                            class="item"
                            :class="{ on: current === s.id }"
                            :aria-selected="current === s.id"
                            :tabindex="current === s.id ? 0 : -1"
                            aria-controls="set-panel"
                            @click="current = s.id"
                        >
                            {{ s.name }}
                            <span v-if="s.badge" class="badge mono">{{ s.badge }}</span>
                        </button>
                    </div>
                </nav>
                <div id="set-panel" class="panel" role="tabpanel" :aria-labelledby="`set-tab-${current}`">
                    <ProfileSection v-if="current === 'profile'" />
                    <AppearanceSection v-else-if="current === 'appearance'" />
                    <AudioSection v-else-if="current === 'audio'" />
                    <AiSection v-else-if="current === 'ai'" />
                    <SecuritySection v-else-if="current === 'security'" />
                    <ImportExportSection v-else-if="current === 'data'" />
                    <UpdateSection
                        v-else-if="current === 'update' && update"
                        :info="update"
                        @channel="(c) => emit('channel', c)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.dialog.settings {
    width: min(860px, 100%);
    height: min(600px, 100%);
    overflow: hidden;
}
.split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 210px 1fr;
}
nav {
    background: var(--panel-2);
    border-right: 1px solid var(--line);
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
}
.me {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px 12px;
    border-bottom: 1px solid var(--line);
}
.avatar {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 12px;
    background: var(--accent-strong);
    color: #fff;
}
.who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
}
.who b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.who small {
    color: var(--muted);
    font-size: 11px;
}
[role='tablist'] {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 7px 10px;
    cursor: pointer;
}
.item:hover {
    background: var(--raise);
}
.item.on {
    background: var(--raise);
    box-shadow: inset 2px 0 0 var(--accent);
    font-weight: 600;
}
.badge {
    font-size: 10.5px;
    color: var(--muted);
    font-weight: 400;
}
.panel {
    padding: 18px 22px;
    overflow: auto;
    min-width: 0;
}
</style>
