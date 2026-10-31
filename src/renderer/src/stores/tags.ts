import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Tag } from '@shared/tags'
import { useAccountsStore } from './accounts'

/** Etiquetas (nome e cor), guardadas em tags.json. As contas guardam só o id. */
export const useTagsStore = defineStore('tags', () => {
    const tags = ref<Tag[]>([])

    async function load(): Promise<void> {
        tags.value = await window.iris.tags.load()
    }

    function persist(): Promise<void> {
        return window.iris.tags.save(JSON.parse(JSON.stringify(tags.value)))
    }

    const byId = (id: string): Tag | undefined => tags.value.find((t) => t.id === id)

    /** Cria ou renomeia/recolore: como as contas guardam o id, elas acompanham. */
    async function save(tag: Tag): Promise<void> {
        const index = tags.value.findIndex((t) => t.id === tag.id)
        if (index >= 0) tags.value[index] = tag
        else tags.value.push(tag)
        await persist()
    }

    /** Apaga a etiqueta e tira ela de todas as contas. */
    async function remove(id: string): Promise<void> {
        tags.value = tags.value.filter((t) => t.id !== id)
        await persist()
        await useAccountsStore().removeTag(id)
    }

    return { tags, load, byId, save, remove }
})
