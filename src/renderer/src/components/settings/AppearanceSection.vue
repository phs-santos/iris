<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed } from 'vue'
import { accentTokens, DEFAULT_ACCENT, DEFAULT_THEME, type Theme } from '@shared/appearance'
import { usePreferencesStore } from '@renderer/stores/preferences'

const prefs = usePreferencesStore()
const tokens = computed(() => accentTokens(prefs.appearance.accent, prefs.theme))

const themes: Array<{ id: Theme; name: string }> = [
    { id: 'light', name: t('appearanceSection.claro') },
    { id: 'dark', name: t('appearanceSection.escuro') },
    { id: 'system', name: t('appearanceSection.sistema') }
]
const theme = computed(() => prefs.appearance.theme ?? DEFAULT_THEME)
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('appearanceSection.aparencia') }}</h3>
            <p>{{ $t('appearanceSection.a_cor_de_destaque_aparece') }}</p>
        </div>

        <div class="set-group">
            <div class="set-row column">
                <span class="what">
                    <b>{{ $t('appearanceSection.cor_de_destaque') }}</b>
                    <small>{{ $t('appearanceSection.escolha_a_cor_dos_botoes') }}</small>
                </span>
                <div class="swatches">
                    <label
                        class="swatch"
                        :style="{ background: tokens.accent }"
                        :title="$t('appearanceSection.sua_cor')"
                    >
                        <input
                            type="color"
                            :value="tokens.accent"
                            :aria-label="$t('appearanceSection.escolher_outra_cor')"
                            @change="prefs.setAccent(($event.target as HTMLInputElement).value)"
                        />
                    </label>
                    <span class="hex mono">{{ tokens.accent }}</span>
                    <button
                        v-if="tokens.accent !== DEFAULT_ACCENT"
                        class="btn small"
                        @click="prefs.setAccent(DEFAULT_ACCENT)"
                    >
                        {{ $t('appearanceSection.cor_padrao') }}
                    </button>
                </div>
                <p v-if="tokens.faint" class="warn" role="status">
                    {{ $t('appearanceSection.essa_cor_fica_apagada_contra') }}
                </p>
                <div class="preview" aria-hidden="true">
                    <span class="btn primary">{{ $t('appearanceSection.ligar') }}</span>
                    <span class="tab-sample">{{ $t('appearanceSection.telefone') }}</span>
                    <span class="btn focus-sample">{{ $t('appearanceSection.com_foco') }}</span>
                </div>
            </div>
            <div class="set-row">
                <span class="what">
                    <b id="theme-label">{{ $t('appearanceSection.tema') }}</b>
                    <small>{{ $t('appearanceSection.tema_dica') }}</small>
                </span>
                <div class="seg" role="radiogroup" aria-labelledby="theme-label">
                    <button
                        v-for="th in themes"
                        :key="th.id"
                        role="radio"
                        :aria-checked="theme === th.id"
                        :class="{ on: theme === th.id }"
                        @click="prefs.setTheme(th.id)"
                    >
                        {{ th.name }}
                    </button>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped>
.set-row.column {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
}
.swatches {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--line);
    padding: 0;
    cursor: pointer;
    position: relative;
}
.swatch:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
}
.swatch input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
}
.hex {
    color: var(--muted);
    font-size: 12px;
}
.warn {
    margin: 0;
    color: var(--warn);
    font-size: 12px;
}
.preview {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--bg);
}
.tab-sample {
    font-weight: 600;
    padding: 2px 4px 6px;
    border-bottom: 2px solid var(--accent);
}
.focus-sample {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    cursor: default;
}
.preview .btn {
    cursor: default;
}
.seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    flex: none;
}
.seg button {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 5px 12px;
    cursor: pointer;
}
.seg button + button {
    border-left: 1px solid var(--line);
}
.seg button.on {
    background: var(--accent-strong);
    color: #fff;
}
</style>
