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
import TagsSection from './TagsSection.vue'
import AboutSection from './AboutSection.vue'
import Icon from '../icons/Icon.vue'

/**
 * Janela de Ajustes: as seções à esquerda, na ordem da especificação, e Sobre no pé. Abre em Áudio; com
 * uma atualização pendente, quem abre (App.vue) pede a seção Atualização.
 */
const props = defineProps<{ section: SettingsSection; update: UpdateInfo | null }>()
const emit = defineEmits<{ close: []; channel: [channel: UpdateChannel] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))

const current = ref<SettingsSection>(props.section)
const sections = computed(() =>
    [
        { id: 'audio' as const, name: t('settingsDialog.audio') },
        { id: 'appearance' as const, name: t('settingsDialog.aparencia') },
        { id: 'servers' as const, name: t('settingsDialog.servidores') },
        { id: 'tags' as const, name: t('settingsDialog.etiquetas') },
        { id: 'connection' as const, name: t('settingsDialog.conexao') },
        { id: 'notifications' as const, name: t('settingsDialog.notificacoes') },
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
    // Em Sobre (fora da lista), a seta vai para a primeira ou a última seção.
    const index = Math.max(
        -1,
        list.findIndex((s) => s.id === current.value)
    )
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
                <h2 id="settings-title">{{ $t('settingsDialog.ajustes') }}</h2>
                <button class="btn small ghost" :aria-label="$t('settingsDialog.fechar')" @click="emit('close')">
                    <Icon name="close" />
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
                            :tabindex="current === s.id || (current === 'about' && s.id === 'audio') ? 0 : -1"
                            aria-controls="set-panel"
                            @click="current = s.id"
                        >
                            {{ s.name }}
                            <span v-if="s.badge" class="badge mono">{{ s.badge }}</span>
                        </button>
                    </div>
                    <div class="foot">
                        <button
                            type="button"
                            class="link"
                            :class="{ on: current === 'about' }"
                            :aria-pressed="current === 'about'"
                            @click="current = 'about'"
                        >
                            {{ $t('settingsDialog.sobre') }}
                        </button>
                    </div>
                </nav>
                <div
                    id="set-panel"
                    class="panel"
                    :role="current === 'about' ? 'region' : 'tabpanel'"
                    :aria-labelledby="current === 'about' ? undefined : `set-tab-${current}`"
                    :aria-label="current === 'about' ? $t('settingsDialog.sobre') : undefined"
                >
                    <AppearanceSection v-if="current === 'appearance'" />
                    <AudioSection v-else-if="current === 'audio'" />
                    <TagsSection v-else-if="current === 'tags'" />
                    <AboutSection v-else-if="current === 'about'" />
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
    width: min(880px, 100%);
    height: min(640px, 100%);
    overflow: hidden;
}
.split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 190px 1fr;
}
header .btn .icon {
    width: 14px;
    height: 14px;
}
.foot {
    margin-top: auto;
    display: flex;
    gap: 2px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
}
.link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
}
.link:hover,
.link.on {
    background: var(--raise);
    color: var(--fg);
}
nav {
    background: var(--panel-2);
    border-right: 1px solid var(--line);
    padding: 10px 8px;
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
    font-size: 12.5px;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 6px 10px;
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
    padding: 16px 20px;
    overflow: auto;
    min-width: 0;
}
</style>
