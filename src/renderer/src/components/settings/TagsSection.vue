<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@renderer/i18n'
import { useTagsStore } from '@renderer/stores/tags'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useToastsStore } from '@renderer/stores/toasts'
import { accountsWithTag, nextTagColor, type Tag } from '@shared/tags'
import Icon from '../icons/Icon.vue'

/**
 * Etiquetas: nome e cor, cadastradas uma vez e usadas por várias contas. Renomear e mudar a cor valem em todas;
 * apagar tira de todas. Servem para buscar e filtrar no seletor de contas.
 */
const tags = useTagsStore()
const accounts = useAccountsStore()
const name = ref('')
const color = ref(nextTagColor(tags.tags))
const error = ref('')
const confirmDelete = ref<string | null>(null)

const plain = (s: string): string => s.trim().toLowerCase()
const taken = (text: string, except?: string): boolean =>
    tags.tags.some((tag) => tag.id !== except && plain(tag.name) === plain(text))
const usage = (id: string): number => accountsWithTag(accounts.accounts, id).length
const sorted = computed(() => [...tags.tags].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))

async function add(): Promise<void> {
    const text = name.value.trim()
    if (!text) return void (error.value = t('tagsSection.erro_nome'))
    if (taken(text)) return void (error.value = t('tagsSection.erro_repetido', { name: text }))
    await tags.save({ id: crypto.randomUUID(), name: text.slice(0, 40), color: color.value })
    name.value = ''
    error.value = ''
    color.value = nextTagColor(tags.tags)
}

async function rename(tag: Tag, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const text = input.value.trim().slice(0, 40)
    // Nome vazio ou repetido não vale: volta ao que era.
    if (!text || taken(text, tag.id)) {
        input.value = tag.name
        return
    }
    if (text !== tag.name) await tags.save({ ...tag, name: text })
}

async function recolor(tag: Tag, value: string): Promise<void> {
    if (/^#[0-9a-f]{6}$/i.test(value)) await tags.save({ ...tag, color: value })
}

async function remove(tag: Tag): Promise<void> {
    const n = usage(tag.id)
    await tags.remove(tag.id)
    confirmDelete.value = null
    useToastsStore().show(t('tagsSection.apagada', { name: tag.name, n }))
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('tagsSection.etiquetas') }}</h3>
            <p>{{ $t('tagsSection.explicacao') }}</p>
        </div>

        <form class="new" novalidate @submit.prevent="add">
            <label class="swatch-pick" :style="{ background: color }">
                <input v-model="color" type="color" :aria-label="$t('tagsSection.cor_nova')" />
            </label>
            <input
                v-model="name"
                class="input"
                maxlength="40"
                :aria-label="$t('tagsSection.nome_nova')"
                :placeholder="$t('tagsSection.nome_exemplo')"
                :aria-invalid="Boolean(error)"
                :aria-describedby="error ? 'tag-new-err' : undefined"
                @input="error = ''"
            />
            <button type="submit" class="btn primary small">
                <Icon name="plus" />{{ $t('tagsSection.adicionar') }}
            </button>
        </form>
        <small v-if="error" id="tag-new-err" class="field-error">{{ error }}</small>

        <ul v-if="sorted.length" class="set-group list">
            <li v-for="tag in sorted" :key="tag.id" class="tag-row" :style="{ '--tag': tag.color }">
                <label class="swatch-pick" :style="{ background: tag.color }">
                    <input
                        type="color"
                        :value="tag.color"
                        :aria-label="$t('tagsSection.cor_de', { name: tag.name })"
                        @change="recolor(tag, ($event.target as HTMLInputElement).value)"
                    />
                </label>
                <input
                    class="input name"
                    maxlength="40"
                    :value="tag.name"
                    :aria-label="$t('tagsSection.nome_de', { name: tag.name })"
                    @change="rename(tag, $event)"
                    @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                />
                <span class="uses tabular">{{
                    usage(tag.id) === 1 ? $t('tagsSection.uma_conta') : $t('tagsSection.n_contas', { n: usage(tag.id) })
                }}</span>
                <span class="acts">
                    <template v-if="confirmDelete === tag.id">
                        <button class="btn small stop" @click="remove(tag)">
                            {{
                                usage(tag.id)
                                    ? $t('tagsSection.apagar_de', { n: usage(tag.id) })
                                    : $t('tagsSection.apagar_mesmo')
                            }}
                        </button>
                        <button class="btn small" @click="confirmDelete = null">
                            {{ $t('tagsSection.cancelar') }}
                        </button>
                    </template>
                    <button
                        v-else
                        class="btn small ghost"
                        :aria-label="$t('tagsSection.apagar_nome', { name: tag.name })"
                        :title="$t('tagsSection.apagar')"
                        @click="confirmDelete = tag.id"
                    >
                        <Icon name="trash" />
                    </button>
                </span>
            </li>
        </ul>
        <p v-else class="set-hint">{{ $t('tagsSection.vazio') }}</p>
    </section>
</template>

<style scoped>
.new {
    display: flex;
    align-items: center;
    gap: 8px;
}
.new .input {
    flex: 1;
    max-width: 320px;
    padding: 5px 8px;
}
.btn .icon {
    width: 13px;
    height: 13px;
}
.field-error {
    margin-top: -8px;
}
.swatch-pick {
    position: relative;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
    cursor: pointer;
}
.swatch-pick:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
.swatch-pick input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
}
.list {
    list-style: none;
    margin: 0;
    padding: 0;
}
.tag-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--line);
    box-shadow: inset 3px 0 0 var(--tag);
}
.tag-row:last-child {
    border-bottom: 0;
}
/* O nome parece texto até receber o foco: editar é clicar e digitar. */
.input.name {
    flex: 1;
    min-width: 0;
    max-width: 320px;
    padding: 3px 7px;
    border-color: transparent;
    background: transparent;
    font-weight: 600;
}
.input.name:hover {
    border-color: var(--line);
}
.input.name:focus {
    background: var(--panel);
}
.uses {
    flex: 1;
    color: var(--muted);
    font-size: 11.5px;
    text-align: right;
}
.acts {
    display: flex;
    gap: 4px;
}
</style>
