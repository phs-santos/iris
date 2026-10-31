import { defineStore } from 'pinia'
import { ref } from 'vue'
import { contactsToCsv, findContact, parseContactsCsv, suggestContacts, type Contact } from '@shared/contacts'
import { useAccountsStore } from './accounts'

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

    /** Contatos de uma conta: contato de uma conta não aparece em outra. */
    const forAccount = (accountId: string): Contact[] => contacts.value.filter((c) => c.accountId === accountId)

    /** Sugestões do discador: só os contatos da conta atual. */
    const suggest = (query: string): Contact[] => {
        const current = useAccountsStore().current
        return current ? suggestContacts(contacts.value, current.id, query) : []
    }

    /** O nome do contato de um número, procurado só nos contatos da conta da chamada. */
    const nameOf = (number: string, accountId: string): string | undefined =>
        findContact(forAccount(accountId), number)?.name

    /** Junta contatos de uma planilha na conta; o mesmo número não entra duas vezes. Devolve quantos entraram. */
    async function importCsv(
        text: string,
        accountId: string
    ): Promise<{ added: number; skipped: number; repeated: number }> {
        const { contacts: found, skipped } = parseContactsCsv(text, accountId, () => crypto.randomUUID())
        let repeated = 0
        for (const contact of found) {
            if (findContact(forAccount(accountId), contact.number)?.number === contact.number) repeated++
            else contacts.value.push(contact)
        }
        await persist()
        return { added: found.length - repeated, skipped, repeated }
    }

    const exportCsv = (accountId: string): string => contactsToCsv(forAccount(accountId))

    return { contacts, load, save, remove, forAccount, suggest, nameOf, importCsv, exportCsv }
})
