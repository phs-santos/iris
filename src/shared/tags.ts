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

/** Cores das etiquetas novas, em ordem: médias, para o texto escuro e o claro lerem ao lado. */
export const TAG_COLORS = ['#2563eb', '#d97706', '#7c3aed', '#059669', '#db2777', '#0891b2', '#dc2626', '#65a30d']

/** A primeira cor da lista que nenhuma etiqueta usa; com todas usadas, recomeça. */
export function nextTagColor(tags: Tag[]): string {
    const used = new Set(tags.map((t) => t.color.toLowerCase()))
    return TAG_COLORS.find((c) => !used.has(c)) ?? TAG_COLORS[tags.length % TAG_COLORS.length]!
}

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

/** Lista de etiquetas para gravar: cada uma válida e sem id repetido (a conta guarda só o id). */
export function isTagList(v: unknown): v is Tag[] {
    if (!Array.isArray(v) || v.length > TAGS_LIMIT || !v.every(isTag)) return false
    return new Set(v.map((t) => t.id)).size === v.length
}

/** Tira a etiqueta de todas as contas; as que não a tinham continuam as mesmas. */
export function removeTag(accounts: Account[], tagId: string): Account[] {
    return accounts.map((a) => (a.tagIds.includes(tagId) ? { ...a, tagIds: a.tagIds.filter((id) => id !== tagId) } : a))
}

export const accountsWithTag = (accounts: Account[], tagId: string): Account[] =>
    accounts.filter((a) => a.tagIds.includes(tagId))
