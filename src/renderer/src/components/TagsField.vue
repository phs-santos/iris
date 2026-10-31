<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useTagsStore } from '@renderer/stores/tags'
import { nextTagColor, type Tag } from '@shared/tags'
import Icon from './icons/Icon.vue'

/**
 * Etiquetas de uma conta, escolhidas da lista configurada em Ajustes → Etiquetas. Dá para criar uma nova
 * aqui mesmo: digite o nome e Enter.
 */
const props = defineProps<{ modelValue: string[]; labelledby: string }>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()
const tags = useTagsStore()

const chosen = computed(() => props.modelValue.map((id) => tags.byId(id)).filter((t): t is Tag => Boolean(t)))
const open = ref(false)
const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const opener = ref<HTMLButtonElement | null>(null)

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const options = computed(() =>
    tags.tags.filter((t) => !props.modelValue.includes(t.id) && plain(t.name).includes(plain(query.value)))
)
/** Criar só quando o nome digitado não é de nenhuma etiqueta (escolhida ou não). */
const canCreate = computed(
    () => query.value.trim().length > 0 && !tags.tags.some((t) => plain(t.name) === plain(query.value))
)

async function toggle(): Promise<void> {
    open.value = !open.value
    query.value = ''
    if (open.value) {
        await nextTick()
        input.value?.focus()
    }
}

function close(): void {
    open.value = false
    opener.value?.focus()
}

function add(id: string): void {
    emit('update:modelValue', [...props.modelValue, id])
    query.value = ''
    input.value?.focus()
}

function remove(id: string): void {
    emit(
        'update:modelValue',
        props.modelValue.filter((x) => x !== id)
    )
}

async function create(): Promise<void> {
    const name = query.value.trim().slice(0, 40)
    if (!name) return
    const tag: Tag = { id: crypto.randomUUID(), name, color: nextTagColor(tags.tags) }
    await tags.save(tag)
    add(tag.id)
}

/** Enter escolhe a primeira da lista ou cria; Esc fecha só a lista, não a janela. */
function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.stopPropagation()
        event.preventDefault()
        close()
    } else if (event.key === 'Enter') {
        event.preventDefault()
        if (options.value[0]) add(options.value[0].id)
        else if (canCreate.value) void create()
    }
}
</script>

<template>
    <div class="tags-field">
        <div class="line" role="group" :aria-labelledby="labelledby">
            <span v-for="tag in chosen" :key="tag.id" class="tagchip" :style="{ '--tag': tag.color }">
                <i class="swatch" aria-hidden="true"></i>{{ tag.name }}
                <button
                    type="button"
                    class="x"
                    :aria-label="$t('tagsField.tirar', { name: tag.name })"
                    @click="remove(tag.id)"
                >
                    <Icon name="close" />
                </button>
            </span>
            <button
                ref="opener"
                type="button"
                class="add"
                :aria-expanded="open"
                aria-controls="tags-pop"
                @click="toggle"
            >
                <Icon name="plus" />{{ $t('tagsField.etiqueta') }}
            </button>
            <span v-if="!chosen.length && !open" class="none">{{ $t('tagsField.nenhuma') }}</span>
        </div>
        <div v-if="open" id="tags-pop" class="pop">
            <input
                ref="input"
                v-model="query"
                class="input"
                :aria-label="$t('tagsField.procurar')"
                :placeholder="$t('tagsField.procurar_dica')"
                maxlength="40"
                @keydown="onKey"
            />
            <div class="opts">
                <button
                    v-for="tag in options"
                    :key="tag.id"
                    type="button"
                    class="opt"
                    :style="{ '--tag': tag.color }"
                    @click="add(tag.id)"
                >
                    <i class="swatch" aria-hidden="true"></i>{{ tag.name }}
                </button>
                <button v-if="canCreate" type="button" class="opt create" @click="create">
                    <Icon name="plus" />{{ $t('tagsField.criar', { name: query.trim() }) }}
                </button>
                <span v-if="!options.length && !canCreate" class="none">{{ $t('tagsField.sem_mais') }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tags-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}
.line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-height: 28px;
}
.tagchip,
.opt {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 4px 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tag) 14%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--tag) 35%, var(--line));
    font-size: 11.5px;
    white-space: nowrap;
}
.swatch {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--tag);
    flex: none;
}
.x {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
}
.x:hover {
    background: color-mix(in srgb, var(--tag) 25%, transparent);
    color: var(--fg);
}
.x .icon {
    width: 10px;
    height: 10px;
}
.add {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 22px;
    padding: 0 8px 0 5px;
    border: 1px dashed var(--line-strong);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-size: 11.5px;
    cursor: pointer;
}
.add:hover,
.add[aria-expanded='true'] {
    border-style: solid;
    color: var(--accent-text);
    border-color: var(--accent);
}
.add .icon,
.opt .icon {
    width: 12px;
    height: 12px;
}
.none {
    color: var(--faint);
    font-size: 11.5px;
}
.pop {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-2);
}
.opts {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}
.opt {
    padding-right: 9px;
    cursor: pointer;
    color: var(--fg);
}
.opt:hover {
    border-color: var(--tag);
}
.opt.create {
    --tag: var(--accent);
    border-style: dashed;
    color: var(--accent-text);
}
</style>
