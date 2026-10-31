<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed, ref } from 'vue'
import type { UpdateChannel, UpdateInfo } from '@shared/types'
import { useDialog } from '@renderer/lib/dialog'
import type { SettingsSection } from '@renderer/stores/preferences'
import AppearanceSection from './AppearanceSection.vue'
import AudioSection from './AudioSection.vue'
import ConnectionSection from './ConnectionSection.vue'
import ServersSection from './ServersSection.vue'
import NotificationsSection from './NotificationsSection.vue'
import SecuritySection from './SecuritySection.vue'
import ImportExportSection from './ImportExportSection.vue'
import UpdateSection from './UpdateSection.vue'

/** Tela única de Configurações: junta Áudio, Importar/Exportar, Atualização e certificados. */
const props = defineProps<{ section: SettingsSection; update: UpdateInfo | null }>()
const emit = defineEmits<{ close: []; channel: [channel: UpdateChannel] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))

const current = ref<SettingsSection>(props.section)
const sections = computed(() =>
    [
        { id: 'appearance' as const, name: t('settingsDialog.aparencia') },
        { id: 'audio' as const, name: t('settingsDialog.audio') },
        { id: 'notifications' as const, name: t('settingsDialog.notificacoes') },
        { id: 'servers' as const, name: t('settingsDialog.servidores') },
        { id: 'connection' as const, name: t('settingsDialog.conexao') },
        { id: 'security' as const, name: t('settingsDialog.certificados') },
        { id: 'data' as const, name: t('settingsDialog.importar_e_exportar') },
        { id: 'update' as const, name: t('settingsDialog.atualizacao'), badge: props.update?.currentVersion }
    ].filter((s) => s.id !== 'update' || props.update)
)

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
                <h2 id="settings-title">{{ $t('settingsDialog.configuracoes') }}</h2>
                <button class="btn small ghost" :aria-label="$t('settingsDialog.fechar')" @click="emit('close')">
                    ✕
                </button>
            </header>
            <div class="split">
                <nav>
                    <div
                        role="tablist"
                        aria-orientation="vertical"
                        :aria-label="$t('settingsDialog.secoes')"
                        @keydown="onNavKey"
                    >
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
                    <AppearanceSection v-if="current === 'appearance'" />
                    <AudioSection v-else-if="current === 'audio'" />
                    <NotificationsSection v-else-if="current === 'notifications'" />
                    <ServersSection v-else-if="current === 'servers'" />
                    <ConnectionSection v-else-if="current === 'connection'" />
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
