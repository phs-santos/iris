<script setup lang="ts">
import { t } from '@renderer/i18n'
import { usePreferencesStore } from '@renderer/stores/preferences'
import { MODE_IDS, modeOn, type ModeId } from '@shared/modes'

/** Área secreta: liga o que não é o padrão de chamada. Abre com cinco cliques seguidos no logo. */
const emit = defineEmits<{ hidden: [] }>()
const prefs = usePreferencesStore()

const label = (mode: ModeId): { name: string; hint: string } =>
    ({
        log: { name: t('modesSection.log'), hint: t('modesSection.log_dica') },
        scenarios: { name: t('modesSection.cenarios'), hint: t('modesSection.cenarios_dica') },
        messages: { name: t('modesSection.mensagens'), hint: t('modesSection.mensagens_dica') },
        video: { name: t('modesSection.video'), hint: t('modesSection.video_dica') },
        sdr: { name: t('modesSection.sdr'), hint: t('modesSection.sdr_dica') }
    })[mode]

async function hide(): Promise<void> {
    await prefs.setModes({ ...prefs.modes, unlocked: undefined })
    emit('hidden')
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('modesSection.modos') }}</h3>
            <p>{{ $t('modesSection.explicacao') }}</p>
        </div>
        <div class="set-group">
            <label v-for="mode in MODE_IDS" :key="mode" class="set-row">
                <span class="what">
                    <b>{{ label(mode).name }}</b>
                    <small>{{ label(mode).hint }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="modeOn(prefs.modes, mode)"
                    @change="prefs.setMode(mode, ($event.target as HTMLInputElement).checked)"
                />
            </label>
        </div>
        <div>
            <button class="btn" @click="hide">{{ $t('modesSection.esconder') }}</button>
        </div>
        <p class="set-hint">{{ $t('modesSection.esconder_dica') }}</p>
    </section>
</template>
