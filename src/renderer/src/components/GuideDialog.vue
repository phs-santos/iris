<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useDialog } from '@renderer/lib/dialog'
import { currentLocale } from '@renderer/i18n'
import { GUIDE as GUIDE_PT } from '@renderer/i18n/guide.pt-BR'
import { GUIDE_EN } from '@renderer/i18n/guide.en'

/** O guia no idioma da interface (RF-56). */
const GUIDE = currentLocale() === 'en' ? GUIDE_EN : GUIDE_PT

/** Guia de uso (entrega do M4): índice à esquerda, conteúdo à direita, busca por texto. */
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))

const images = import.meta.glob<string>('../assets/guide/*.png', { eager: true, import: 'default' })
const imageOf = (name: string): string | undefined => images[`../assets/guide/${name}.png`]

const currentId = ref(GUIDE[0]!.id)
const search = ref('')

/** Todo o texto de uma seção, para a busca. */
const textOf = (section: (typeof GUIDE)[number]): string =>
    [
        section.title,
        section.summary,
        ...section.blocks.flatMap((b) => {
            if (b.type === 'list' || b.type === 'steps') return b.items
            if (b.type === 'table') return [...b.head, ...b.rows.flat()]
            if (b.type === 'image') return [b.alt, b.caption ?? '']
            return [b.text]
        })
    ]
        .join(' ')
        .toLowerCase()

const matches = computed(() => {
    const term = search.value.trim().toLowerCase()
    return term ? GUIDE.filter((s) => textOf(s).includes(term)) : GUIDE
})
const current = computed(() => matches.value.find((s) => s.id === currentId.value) ?? matches.value[0])
const position = computed(() => GUIDE.findIndex((s) => s.id === current.value?.id))

async function open(id: string): Promise<void> {
    currentId.value = id
    await nextTick()
    contentEl.value?.scrollTo({ top: 0 })
    contentEl.value?.focus()
}

/** As capturas são feitas em tela de alta densidade (2x): mostra no tamanho real, não ampliadas. */
function fit(event: Event): void {
    const img = event.target as HTMLImageElement
    img.style.width = `${Math.round(img.naturalWidth / 2)}px`
}

/** Separa **negrito** e `código` do texto comum, para desenhar sem HTML vindo de fora. */
function inline(text: string): { kind: 'text' | 'b' | 'code'; value: string }[] {
    return text
        .split(/(\*\*[^*]+\*\*|`[^`]+`)/) // i18n-ok: expressão regular
        .filter(Boolean)
        .map((part) => {
            if (part.startsWith('**')) return { kind: 'b' as const, value: part.slice(2, -2) }
            if (part.startsWith('`')) return { kind: 'code' as const, value: part.slice(1, -1) }
            return { kind: 'text' as const, value: part }
        })
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <div
            ref="dialogEl"
            class="dialog guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            tabindex="-1"
        >
            <header>
                <h2 id="guide-title">{{ $t('guideDialog.guia_da_iris') }}</h2>
                <button class="btn small ghost" :aria-label="$t('guideDialog.fechar')" @click="emit('close')">✕</button>
            </header>

            <div class="layout">
                <nav class="index" :aria-label="$t('guideDialog.secoes_do_guia')">
                    <input
                        v-model="search"
                        class="input"
                        type="search"
                        :placeholder="$t('guideDialog.buscar_no_guia')"
                        :aria-label="$t('guideDialog.buscar_no_guia')"
                    />
                    <ul>
                        <li v-for="s in matches" :key="s.id">
                            <button
                                class="entry"
                                :class="{ on: s.id === current?.id }"
                                :aria-current="s.id === current?.id ? 'page' : undefined"
                                @click="open(s.id)"
                            >
                                {{ s.title }}
                            </button>
                        </li>
                    </ul>
                    <p v-if="matches.length === 0" class="none">
                        {{ $t('guideDialog.nada_encontrado_para', { search }) }}
                    </p>
                </nav>

                <article v-if="current" ref="contentEl" class="content" tabindex="0" :aria-label="current.title">
                    <h3>{{ current.title }}</h3>
                    <p class="summary">{{ current.summary }}</p>

                    <template v-for="(b, i) in current.blocks" :key="i">
                        <h4 v-if="b.type === 'h'">{{ b.text }}</h4>

                        <p v-else-if="b.type === 'p'">
                            <template v-for="(t, j) in inline(b.text)" :key="j">
                                <b v-if="t.kind === 'b'">{{ t.value }}</b>
                                <code v-else-if="t.kind === 'code'">{{ t.value }}</code>
                                <template v-else>{{ t.value }}</template>
                            </template>
                        </p>

                        <component
                            :is="b.type === 'steps' ? 'ol' : 'ul'"
                            v-else-if="b.type === 'list' || b.type === 'steps'"
                        >
                            <li v-for="(item, k) in b.items" :key="k">
                                <template v-for="(t, j) in inline(item)" :key="j">
                                    <b v-if="t.kind === 'b'">{{ t.value }}</b>
                                    <code v-else-if="t.kind === 'code'">{{ t.value }}</code>
                                    <template v-else>{{ t.value }}</template>
                                </template>
                            </li>
                        </component>

                        <figure v-else-if="b.type === 'image' && imageOf(b.name)">
                            <img :src="imageOf(b.name)" :alt="b.alt" @load="fit" />
                            <figcaption>{{ b.caption ?? b.alt }}</figcaption>
                        </figure>

                        <p v-else-if="b.type === 'note'" class="note" :class="b.kind === 'dica' ? 'tip' : 'warn'">
                            <b class="tag">{{
                                b.kind === 'dica' ? $t('guideDialog.dica') : $t('guideDialog.atencao')
                            }}</b>
                            <template v-for="(t, j) in inline(b.text)" :key="j">
                                <b v-if="t.kind === 'b'">{{ t.value }}</b>
                                <code v-else-if="t.kind === 'code'">{{ t.value }}</code>
                                <template v-else>{{ t.value }}</template>
                            </template>
                        </p>

                        <div v-else-if="b.type === 'table'" class="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th v-for="h in b.head" :key="h" scope="col">{{ h }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(row, r) in b.rows" :key="r">
                                        <td v-for="(cell, c) in row" :key="c">
                                            <template v-for="(t, j) in inline(cell)" :key="j">
                                                <b v-if="t.kind === 'b'">{{ t.value }}</b>
                                                <code v-else-if="t.kind === 'code'">{{ t.value }}</code>
                                                <template v-else>{{ t.value }}</template>
                                            </template>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <pre v-else-if="b.type === 'code'" class="code mono">{{ b.text }}</pre>
                    </template>

                    <div class="pager">
                        <button v-if="position > 0" class="btn small" @click="open(GUIDE[position - 1]!.id)">
                            ← {{ GUIDE[position - 1]!.title }}
                        </button>
                        <span class="spacer"></span>
                        <button
                            v-if="position < GUIDE.length - 1"
                            class="btn small"
                            @click="open(GUIDE[position + 1]!.id)"
                        >
                            {{ GUIDE[position + 1]!.title }} →
                        </button>
                    </div>
                </article>
            </div>
        </div>
    </div>
</template>

<style scoped>
.dialog.guide {
    width: min(1120px, 100%);
    height: 100%;
    overflow: hidden;
}
.layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 250px 1fr;
}
.index {
    border-right: 1px solid var(--line);
    padding: 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.index ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.entry {
    width: 100%;
    text-align: left;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0 6px 6px 0;
    background: transparent;
    color: var(--muted);
    padding: 6px 10px;
    font: inherit;
    cursor: pointer;
}
.entry:hover {
    color: var(--fg);
    background: var(--raise);
}
.entry.on {
    color: var(--fg);
    border-left-color: var(--accent);
    background: var(--raise);
    font-weight: 600;
}
.none {
    color: var(--muted);
    font-size: 12px;
}
.content {
    overflow: auto;
    padding: 20px 28px 28px;
    line-height: 1.6;
}
.content h3 {
    margin: 0;
    font-size: 21px;
}
.summary {
    color: var(--muted);
    margin: 4px 0 18px;
    font-size: 14.5px;
}
.content h4 {
    margin: 22px 0 6px;
    font-size: 15px;
}
.content p,
.content ul,
.content ol {
    margin: 8px 0;
    max-width: 78ch;
}
.content ul,
.content ol {
    padding-left: 22px;
}
.content li {
    margin: 4px 0;
}
.content code {
    font-family: var(--mono);
    font-size: 0.92em;
    background: var(--raise);
    border-radius: 4px;
    padding: 1px 5px;
}
figure {
    margin: 14px 0;
}
figure img {
    display: block;
    max-width: 100%;
    height: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
}
figcaption {
    color: var(--muted);
    font-size: 12px;
    margin-top: 6px;
}
.note {
    border-left: 3px solid var(--accent);
    background: var(--panel-2);
    border-radius: 0 6px 6px 0;
    padding: 9px 12px;
}
.note.warn {
    border-left-color: var(--warn);
}
.note .tag {
    margin-right: 6px;
}
.table-wrap {
    overflow-x: auto;
    margin: 10px 0;
}
table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
}
th,
td {
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--line);
    padding: 7px 10px;
}
th {
    color: var(--muted);
    font-weight: 600;
}
.code {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    overflow-x: auto;
}
.pager {
    display: flex;
    gap: 10px;
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
}
.spacer {
    flex: 1;
}
</style>
