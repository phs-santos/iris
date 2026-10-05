// Agenda de contatos (RF-50).

export interface Contact {
    id: string
    name: string
    /** Número ou ramal, como é discado. */
    number: string
    company?: string
    notes?: string
    favorite?: boolean
    /** Conta de onde ligar; sem ela, vale a conta escolhida no discador. */
    accountId?: string
}

export interface ContactsFile {
    schemaVersion: 1
    contacts: Contact[]
}

export const CONTACTS_LIMIT = 5000

const text = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max
const optional = (v: unknown, max: number): boolean => v === undefined || text(v, max)

export function isContact(v: unknown): v is Contact {
    if (!v || typeof v !== 'object') return false
    const c = v as Record<string, unknown>
    return (
        text(c.id, 200) &&
        text(c.name, 200) &&
        text(c.number, 100) &&
        optional(c.company, 200) &&
        optional(c.notes, 2000) &&
        (c.favorite === undefined || typeof c.favorite === 'boolean') &&
        optional(c.accountId, 200)
    )
}

/** Só os dígitos e os sinais que contam ao comparar números: "+55 (11) 4000-1002" vira "+551140001002". */
export const digits = (number: string): string => number.replace(/[^0-9*#+]/g, '')

/**
 * Acha o contato de um número que chegou numa chamada. Compara só os dígitos e aceita o número sem o
 * prefixo (o PBX costuma mandar "1002" para quem está salvo como "+55 11 4000-1002", ou o contrário),
 * desde que sobrem pelo menos 4 dígitos, para um ramal curto não casar com qualquer coisa.
 */
export function findContact(contacts: Contact[], number: string): Contact | undefined {
    const wanted = digits(number)
    if (!wanted) return undefined
    const exact = contacts.find((c) => digits(c.number) === wanted)
    if (exact) return exact
    return contacts.find((c) => {
        const saved = digits(c.number)
        const [short, long] = saved.length < wanted.length ? [saved, wanted] : [wanted, saved]
        return short.length >= 4 && long.endsWith(short)
    })
}

export const plain = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca por nome, número, empresa ou observação, sem diferenciar acento nem maiúscula; favoritos primeiro. */
export function searchContacts(contacts: Contact[], query: string): Contact[] {
    const q = plain(query.trim())
    const found = q
        ? contacts.filter((c) =>
              [c.name, c.number, c.company ?? '', c.notes ?? ''].some((field) => plain(field).includes(q))
          )
        : contacts
    return [...found].sort(
        (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name, 'pt-BR')
    )
}

// ─── CSV ───────────────────────────────────────────────────────────────────

const COLUMNS: Record<string, keyof Contact> = {
    nome: 'name',
    name: 'name',
    numero: 'number',
    number: 'number',
    telefone: 'number',
    phone: 'number',
    ramal: 'number',
    empresa: 'company',
    company: 'company',
    observacao: 'notes',
    notes: 'notes',
    favorito: 'favorite',
    favorite: 'favorite'
}
export const CONTACTS_CSV_HEADER = 'nome;numero;empresa;observacao;favorito'

export function splitLine(line: string, separator: string): string[] {
    const out: string[] = []
    let field = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
        const c = line[i]!
        if (quoted) {
            if (c === '"' && line[i + 1] === '"') {
                field += '"'
                i++
            } else if (c === '"') quoted = false
            else field += c
        } else if (c === '"' && field === '') quoted = true
        else if (c === separator) {
            out.push(field.trim())
            field = ''
        } else field += c
    }
    out.push(field.trim())
    return out
}

export class ContactsCsvError extends Error {}

/** Lê uma planilha de contatos; linhas sem nome ou sem número são ignoradas e contadas. */
export function parseContactsCsv(csv: string, newId: () => string): { contacts: Contact[]; skipped: number } {
    const lines = csv
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim())
    if (lines.length < 2)
        throw new ContactsCsvError('A planilha precisa da linha de colunas e de pelo menos um contato')
    const separator = [';', '\t', ','].find((s) => lines[0]!.includes(s)) ?? ';'
    const columns = splitLine(lines[0]!, separator).map((name) => COLUMNS[plain(name).trim()])
    if (!columns.includes('name') || !columns.includes('number'))
        throw new ContactsCsvError(
            `A primeira linha precisa das colunas nome e numero. Exemplo: ${CONTACTS_CSV_HEADER}`
        )
    const contacts: Contact[] = []
    let skipped = 0
    for (const line of lines.slice(1, CONTACTS_LIMIT + 1)) {
        const row: Partial<Record<keyof Contact, string>> = {}
        splitLine(line, separator).forEach((value, i) => {
            if (columns[i]) row[columns[i]!] = value
        })
        const contact: Contact = {
            id: newId(),
            name: (row.name ?? '').slice(0, 200),
            number: (row.number ?? '').slice(0, 100),
            company: row.company?.slice(0, 200) || undefined,
            notes: row.notes?.slice(0, 2000) || undefined,
            favorite: /^(s|sim|y|yes|1|true|x)$/i.test(row.favorite ?? '') || undefined
        }
        if (contact.name && digits(contact.number)) contacts.push(contact)
        else skipped++
    }
    return { contacts, skipped }
}

export const csvField = (value: string | undefined): string => {
    const v = value ?? ''
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function contactsToCsv(contacts: Contact[]): string {
    const rows = contacts.map((c) =>
        [c.name, c.number, c.company, c.notes, c.favorite ? 'sim' : ''].map(csvField).join(';')
    )
    return `${[CONTACTS_CSV_HEADER, ...rows].join('\r\n')}\r\n`
}
