<script setup lang="ts">
import { t } from '@renderer/i18n'
import { computed } from 'vue'
import { accentTokens, PALETTES, type InterfaceSize, type Theme } from '@shared/appearance'
import { usePreferencesStore } from '@renderer/stores/preferences'

const prefs = usePreferencesStore()
const tokens = computed(() => accentTokens(prefs.appearance.accent))
/** Cor que não é de nenhuma paleta: a pessoa escolheu no seletor. */
const custom = computed(() => !PALETTES.some((p) => p.accent === tokens.value.accent))

const sizes: Array<{ id: InterfaceSize; name: string }> = [
    { id: 'small', name: t('appearanceSection.pequena') },
    { id: 'medium', name: t('appearanceSection.normal') },
    { id: 'large', name: t('appearanceSection.grande') }
]
const size = computed(() => prefs.appearance.size ?? 'medium')
const themes: Array<{ id: Theme; name: string }> = [
    { id: 'dark', name: t('appearanceSection.escuro') },
    { id: 'light', name: t('appearanceSection.claro') },
    { id: 'system', name: t('appearanceSection.sistema') }
]
const theme = computed(() => prefs.appearance.theme ?? 'dark')
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
                    <b id="palette-label">{{ $t('appearanceSection.cor_de_destaque') }}</b>
                    <small>{{ $t('appearanceSection.escolha_uma_paleta_pronta_ou') }}</small>
                </span>
                <div class="swatches" role="radiogroup" aria-labelledby="palette-label">
                    <button
                        v-for="p in PALETTES"
                        :key="p.id"
                        class="swatch"
                        role="radio"
                        :aria-checked="tokens.accent === p.accent"
                        :aria-label="p.name"
                        :title="p.name"
                        :style="{ background: p.accent }"
                        @click="prefs.setAccent(p.accent)"
                    ></button>
                    <label class="swatch own" :class="{ on: custom }" :title="$t('appearanceSection.sua_cor')">
                        <input
                            type="color"
                            :value="tokens.accent"
                            :aria-label="$t('appearanceSection.escolher_outra_cor')"
                            @change="prefs.setAccent(($event.target as HTMLInputElement).value)"
                        />
                        <span :style="custom ? { background: tokens.accent } : undefined">+</span>
                    </label>
                    <span class="hex mono">{{ tokens.accent }}</span>
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
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('appearanceSection.compacta') }}</b>
                    <small>{{ $t('appearanceSection.compacta_dica') }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="Boolean(prefs.appearance.compact)"
                    @change="prefs.setCompact(($event.target as HTMLInputElement).checked)"
                />
            </label>
            <div class="set-row">
                <span class="what">
                    <b id="size-label">{{ $t('appearanceSection.tamanho_da_interface') }}</b>
                    <small>{{ $t('appearanceSection.aumenta_ou_diminui_tudo_junto') }}</small>
                </span>
                <div class="seg" role="radiogroup" aria-labelledby="size-label">
                    <button
                        v-for="s in sizes"
                        :key="s.id"
                        role="radio"
                        :aria-checked="size === s.id"
                        :class="{ on: size === s.id }"
                        @click="prefs.setSize(s.id)"
                    >
                        {{ s.name }}
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
    border: 0;
    padding: 0;
    cursor: pointer;
    position: relative;
}
.swatch[aria-checked='true'],
.swatch.own.on {
    outline: 2px solid var(--fg);
    outline-offset: 3px;
}
.swatch:focus-visible,
.swatch.own:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
}
.own input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
}
.own span {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 1px dashed var(--muted);
    color: var(--muted);
    font-size: 15px;
    pointer-events: none;
}
.own.on span {
    border: 0;
    color: transparent;
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
