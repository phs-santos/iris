import { defineStore } from 'pinia'
import { ref } from 'vue'
import { contactsToCsv, findContact, parseContactsCsv, type Contact } from '@shared/contacts'

/** Agenda de contatos (RF-50), guardada em contacts.json. */
export const useContactsStore = defineStore('contacts', () => {
    const contacts = ref<Contact[]>([])

    async function load(): Promise<void> {
        contacts.value = await window.iris.contacts.load()
    }

    function persist(): Promise<void> {
        // Nos testes de unidade das stores não há processo principal.
        return window.iris.contacts?.save(JSON.parse(JSON.stringify(contacts.value))) ?? Promise.resolve()
    }

    async function save(contact: Contact): Promise<void> {
        const index = contacts.value.findIndex((c) => c.id === contact.id)
        if (index >= 0) contacts.value[index] = contact
        else contacts.value.push(contact)
        await persist()
    }

    async function remove(id: string): Promise<void> {
        contacts.value = contacts.value.filter((c) => c.id !== id)
        await persist()
    }

    async function toggleFavorite(id: string): Promise<void> {
        const contact = contacts.value.find((c) => c.id === id)
        if (!contact) return
        contact.favorite = !contact.favorite || undefined
        await persist()
    }

    /** O contato de um número, para mostrar o nome em vez do número. */
    const nameOf = (number: string): string | undefined => findContact(contacts.value, number)?.name

    /** Junta contatos de uma planilha; o mesmo número não entra duas vezes. Devolve quantos entraram. */
    async function importCsv(text: string): Promise<{ added: number; skipped: number; repeated: number }> {
        const { contacts: found, skipped } = parseContactsCsv(text, () => crypto.randomUUID())
        let repeated = 0
        for (const contact of found) {
            if (findContact(contacts.value, contact.number)?.number === contact.number) repeated++
            else contacts.value.push(contact)
        }
        await persist()
        return { added: found.length - repeated, skipped, repeated }
    }

    const exportCsv = (): string => contactsToCsv(contacts.value)

    return { contacts, load, save, remove, toggleFavorite, nameOf, importCsv, exportCsv }
})
