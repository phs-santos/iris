<script setup lang="ts">
import { computed } from 'vue'
import { accentTokens, PALETTES, type InterfaceSize } from '@shared/appearance'
import { usePreferencesStore } from '@renderer/stores/preferences'

const prefs = usePreferencesStore()
const tokens = computed(() => accentTokens(prefs.appearance.accent))
/** Cor que não é de nenhuma paleta: a pessoa escolheu no seletor. */
const custom = computed(() => !PALETTES.some((p) => p.accent === tokens.value.accent))

const sizes: Array<{ id: InterfaceSize; name: string }> = [
    { id: 'small', name: 'Pequena' },
    { id: 'medium', name: 'Normal' },
    { id: 'large', name: 'Grande' }
]
const size = computed(() => prefs.appearance.size ?? 'medium')
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>Aparência</h3>
            <p>A cor de destaque aparece nos botões principais, nas abas e no contorno do foco.</p>
        </div>

        <div class="set-group">
            <div class="set-row column">
                <span class="what">
                    <b id="palette-label">Cor de destaque</b>
                    <small>Escolha uma paleta pronta ou a sua própria cor.</small>
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
                    <label class="swatch own" :class="{ on: custom }" title="Sua cor">
                        <input
                            type="color"
                            :value="tokens.accent"
                            aria-label="Escolher outra cor"
                            @change="prefs.setAccent(($event.target as HTMLInputElement).value)"
                        />
                        <span :style="custom ? { background: tokens.accent } : undefined">+</span>
                    </label>
                    <span class="hex mono">{{ tokens.accent }}</span>
                </div>
                <p v-if="tokens.faint" class="warn" role="status">
                    Essa cor fica apagada contra o fundo escuro, e o contorno de foco pode sumir. Prefira um tom mais
                    claro.
                </p>
                <div class="preview" aria-hidden="true">
                    <span class="btn primary">Ligar</span>
                    <span class="tab-sample">Telefone</span>
                    <span class="btn focus-sample">Com foco</span>
                </div>
            </div>
            <div class="set-row">
                <span class="what">
                    <b id="size-label">Tamanho da interface</b>
                    <small>Aumenta ou diminui tudo junto: texto, botões e painéis.</small>
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
