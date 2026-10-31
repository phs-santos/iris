// Regras do seletor de contas (2.0): busca, filtro por etiqueta e grupos por servidor.

import type { SipServer } from './servers'
import type { Tag } from './tags'
import type { Account } from './types'

/** Grupo do seletor: um servidor e as contas dele. `server` nulo é o grupo "Sem servidor". */
export interface PickerGroup {
    server: SipServer | null
    accounts: Account[]
}

const fold = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()

/**
 * Contas que casam com a busca (nome, ramal ou nome de etiqueta, sem diferenciar acento nem maiúscula)
 * e, se houver, com a etiqueta escolhida.
 */
export function filterAccounts(accounts: Account[], query: string, tagId: string | null, tags: Tag[]): Account[] {
    const words = fold(query).split(/\s+/).filter(Boolean)
    const tagName = new Map(tags.map((t) => [t.id, fold(t.name)]))
    return accounts.filter((account) => {
        if (tagId && !account.tagIds.includes(tagId)) return false
        if (!words.length) return true
        const text = [fold(account.name), fold(account.extension), ...account.tagIds.map((id) => tagName.get(id) ?? '')]
        return words.every((word) => text.some((part) => part.includes(word)))
    })
}

/**
 * Agrupa por servidor, na ordem da lista de servidores (o simulado primeiro). Contas sem servidor, ou com
 * um servidor que não existe mais, ficam no grupo "Sem servidor", por último. Grupos vazios não aparecem.
 */
export function groupByServer(accounts: Account[], servers: SipServer[]): PickerGroup[] {
    const known = new Set(servers.map((s) => s.id))
    const groups: PickerGroup[] = servers.map((server) => ({
        server,
        accounts: accounts.filter((a) => a.serverId === server.id)
    }))
    groups.push({ server: null, accounts: accounts.filter((a) => !known.has(a.serverId)) })
    return groups.filter((g) => g.accounts.length > 0)
}

/** Duas letras para o avatar: as iniciais das duas primeiras palavras, ou as duas primeiras letras. */
export function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return '?'
    const letters =
        words.length > 1 && /^\p{L}/u.test(words[1]) ? words[0][0] + words[1][0] : [...words[0]].slice(0, 2).join('')
    return letters.toUpperCase()
}

/** A próxima posição ao andar com as setas, dando a volta nas pontas. -1 quando a lista está vazia. */
export function stepIndex(index: number, delta: 1 | -1, length: number): number {
    if (length === 0) return -1
    if (index < 0) return delta === 1 ? 0 : length - 1
    return (index + delta + length) % length
}
