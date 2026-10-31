// Etiquetas (2.0): nome e cor, configuradas uma vez e reaproveitadas por várias contas. A conta guarda só o id.

import type { Account } from './types'

export interface Tag {
    id: string
    name: string
    /** Cor no formato '#rrggbb'. */
    color: string
}

export interface TagsFile {
    schemaVersion: 2
    tags: Tag[]
}

export const TAGS_LIMIT = 200

export function isTag(v: unknown): v is Tag {
    if (!v || typeof v !== 'object') return false
    const t = v as Record<string, unknown>
    return (
        typeof t.id === 'string' &&
        t.id.length > 0 &&
        t.id.length <= 200 &&
        typeof t.name === 'string' &&
        t.name.length >= 1 &&
        t.name.length <= 40 &&
        typeof t.color === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(t.color)
    )
}

/** Tira a etiqueta de todas as contas; as que não a tinham continuam as mesmas. */
export function removeTag(accounts: Account[], tagId: string): Account[] {
    return accounts.map((a) => (a.tagIds.includes(tagId) ? { ...a, tagIds: a.tagIds.filter((id) => id !== tagId) } : a))
}

export const accountsWithTag = (accounts: Account[], tagId: string): Account[] =>
    accounts.filter((a) => a.tagIds.includes(tagId))
