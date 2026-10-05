<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@renderer/i18n'
import { usePreferencesStore } from '@renderer/stores/preferences'
import type { LinkStatus } from '@shared/links'
import { acceleratorFromKey, describeAccelerator, SHORTCUT_ACTIONS, type ShortcutAction } from '@shared/shortcuts'

/** Atalhos globais (RF-34) e links de telefone (RF-53). */
const prefs = usePreferencesStore()
const mac = ref(false)
const failed = ref<ShortcutAction[]>([])
/** Ação esperando a pessoa apertar a combinação. */
const capturing = ref<ShortcutAction | null>(null)
const error = ref('')
const links = ref<LinkStatus | null>(null)
/** O sistema recusou a tecla Tocar/Pausar na última chamada (no macOS, falta a permissão de Acessibilidade). */
const mediaKeyFailed = ref(false)

const label = (action: ShortcutAction): { name: string; hint: string } =>
    ({
        answer: { name: t('shortcutsSection.atender'), hint: t('shortcutsSection.atender_dica') },
        hangup: { name: t('shortcutsSection.desligar'), hint: t('shortcutsSection.desligar_dica') },
        mute: { name: t('shortcutsSection.mudo'), hint: t('shortcutsSection.mudo_dica') }
    })[action]

async function save(action: ShortcutAction, accelerator: string | undefined): Promise<void> {
    const next = { ...prefs.shortcuts }
    if (accelerator) next[action] = accelerator
    else delete next[action]
    await prefs.setShortcuts(next)
    failed.value = await window.iris.shortcuts.failed()
}

function onCapture(action: ShortcutAction, event: KeyboardEvent): void {
    if (capturing.value !== action) return
    // Tab continua andando pela tela; Esc desiste sem fechar as Configurações.
    if (event.key === 'Tab') return void (capturing.value = null)
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') return void (capturing.value = null)
    const accelerator = acceleratorFromKey(
        { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey, code: event.code },
        mac.value
    )
    if (!accelerator) return
    capturing.value = null
    const other = SHORTCUT_ACTIONS.find((a) => a !== action && prefs.shortcuts[a] === accelerator)
    if (other) {
        error.value = t('shortcutsSection.repetido', { name: label(other).name })
        return
    }
    error.value = ''
    void save(action, accelerator)
}

function startCapture(action: ShortcutAction): void {
    error.value = ''
    capturing.value = capturing.value === action ? null : action
}

async function setLinks(kind: 'tel' | 'sip', on: boolean): Promise<void> {
    links.value = await window.iris.links.setDefault(kind, on)
}

onMounted(async () => {
    mac.value = (await window.iris.appInfo()).platform === 'darwin'
    failed.value = await window.iris.shortcuts.failed()
    links.value = await window.iris.links.status()
    mediaKeyFailed.value = await window.iris.shortcuts.mediaKeyFailed()
})
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('shortcutsSection.atalhos') }}</h3>
            <p>{{ $t('shortcutsSection.explicacao') }}</p>
        </div>
        <div class="set-group">
            <div v-for="action in SHORTCUT_ACTIONS" :key="action" class="set-row">
                <span class="what">
                    <b>{{ label(action).name }}</b>
                    <small>{{ label(action).hint }}</small>
                    <small v-if="failed.includes(action)" class="bad" role="alert">
                        {{ $t('shortcutsSection.recusado') }}
                    </small>
                </span>
                <span class="control keys">
                    <button
                        class="btn small mono"
                        :class="{ primary: capturing === action }"
                        :aria-label="$t('shortcutsSection.definir_para', { name: label(action).name })"
                        @click="startCapture(action)"
                        @keydown="onCapture(action, $event)"
                        @blur="capturing === action && (capturing = null)"
                    >
                        {{
                            capturing === action
                                ? $t('shortcutsSection.aperte')
                                : prefs.shortcuts[action]
                                  ? describeAccelerator(prefs.shortcuts[action]!, mac)
                                  : $t('shortcutsSection.definir')
                        }}
                    </button>
                    <button
                        v-if="prefs.shortcuts[action]"
                        class="btn small ghost"
                        :aria-label="$t('shortcutsSection.limpar_de', { name: label(action).name })"
                        @click="save(action, undefined)"
                    >
                        {{ $t('shortcutsSection.limpar') }}
                    </button>
                </span>
            </div>
        </div>
        <p v-if="error" class="set-hint bad" role="alert">{{ error }}</p>
        <div class="set-group">
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('shortcutsSection.fone') }}</b>
                    <small>{{ $t('shortcutsSection.fone_dica') }}</small>
                    <small v-if="mediaKeyFailed" class="bad" role="alert">{{
                        $t('shortcutsSection.fone_recusado')
                    }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="prefs.mediaKey"
                    @change="prefs.setMediaKey(($event.target as HTMLInputElement).checked)"
                />
            </label>
        </div>

        <div class="set-head">
            <h3>{{ $t('shortcutsSection.links') }}</h3>
            <p>{{ $t('shortcutsSection.links_explicacao') }}</p>
        </div>
        <div class="set-group">
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('shortcutsSection.links_tel') }}</b>
                    <small>{{ $t('shortcutsSection.links_tel_dica') }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="Boolean(links?.tel)"
                    :disabled="!links?.supported"
                    @change="setLinks('tel', ($event.target as HTMLInputElement).checked)"
                />
            </label>
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('shortcutsSection.links_sip') }}</b>
                    <small>{{ $t('shortcutsSection.links_sip_dica') }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="Boolean(links?.sip)"
                    :disabled="!links?.supported"
                    @change="setLinks('sip', ($event.target as HTMLInputElement).checked)"
                />
            </label>
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('shortcutsSection.ligar_direto') }}</b>
                    <small>{{ $t('shortcutsSection.ligar_direto_dica') }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="Boolean(prefs.links.autoDial)"
                    @change="prefs.setLinks({ autoDial: ($event.target as HTMLInputElement).checked || undefined })"
                />
            </label>
        </div>
        <p v-if="links && !links.supported" class="set-hint">{{ $t('shortcutsSection.so_instalado') }}</p>
    </section>
</template>

<style scoped>
.keys {
    display: flex;
    gap: 6px;
    align-items: center;
}
.bad {
    color: var(--bad-text);
}
.set-head + .set-group {
    margin-bottom: 14px;
}
</style>
