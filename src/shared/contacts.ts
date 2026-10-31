// Agenda de contatos (RF-50).

export interface Contact {
    id: string
    name: string
    /** Número ou ramal, como é discado. */
    number: string
    notes?: string
    /** Conta a que o contato pertence e de onde se liga para ele. */
    accountId: string
}

export interface ContactsFile {
    schemaVersion: 2
    contacts: Contact[]
}

export const CONTACTS_LIMIT = 5000

const text = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max
const optional = (v: unknown, max: number): boolean => v === undefined || text(v, max)

export function isContact(v: unknown): v is Contact {
    if (!v || typeof v !== 'object') return false
    const c = v as Record<string, unknown>
    return (
        text(c.id, 200) && text(c.name, 200) && text(c.number, 100) && optional(c.notes, 2000) && text(c.accountId, 200)
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

/** Busca por nome, número ou observação, sem diferenciar acento nem maiúscula, em ordem de nome. */
export function searchContacts(contacts: Contact[], query: string): Contact[] {
    const q = plain(query.trim())
    const found = q
        ? contacts.filter((c) => [c.name, c.number, c.notes ?? ''].some((field) => plain(field).includes(q)))
        : contacts
    return [...found].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// ─── CSV ───────────────────────────────────────────────────────────────────

type CsvColumn = 'name' | 'number' | 'notes'
const COLUMNS: Record<string, CsvColumn> = {
    nome: 'name',
    name: 'name',
    numero: 'number',
    number: 'number',
    telefone: 'number',
    phone: 'number',
    ramal: 'number',
    observacao: 'notes',
    notes: 'notes'
}
export const CONTACTS_CSV_HEADER = 'nome;numero;observacao'

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

/** Lê uma planilha de contatos para uma conta; linhas sem nome ou sem número são ignoradas e contadas. */
export function parseContactsCsv(
    csv: string,
    accountId: string,
    newId: () => string
): { contacts: Contact[]; skipped: number } {
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
        const row: Partial<Record<CsvColumn, string>> = {}
        splitLine(line, separator).forEach((value, i) => {
            if (columns[i]) row[columns[i]!] = value
        })
        const contact: Contact = {
            id: newId(),
            name: (row.name ?? '').slice(0, 200),
            number: (row.number ?? '').slice(0, 100),
            notes: row.notes?.slice(0, 2000) || undefined,
            accountId
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
    const rows = contacts.map((c) => [c.name, c.number, c.notes].map(csvField).join(';'))
    return `${[CONTACTS_CSV_HEADER, ...rows].join('\r\n')}\r\n`
}

/**
 * Sugestões do discador: só os contatos da conta, por nome (sem acento nem maiúscula) ou, se o texto for um
 * número, pelos dígitos. Quem começa com o texto vem antes de quem só contém; no empate, ordem de nome.
 */
export function suggestContacts(contacts: Contact[], accountId: string, query: string, limit = 6): Contact[] {
    const text = query.trim()
    if (!text) return []
    const wanted = /[^\d\s()+*#.-]/.test(text) ? '' : digits(text)
    const name = plain(text)
    const rank = (c: Contact): number => {
        if (wanted) {
            const number = digits(c.number)
            if (number.startsWith(wanted)) return 0
            if (number.includes(wanted)) return 1
            return 2
        }
        const label = plain(c.name)
        return label.startsWith(name) ? 0 : label.includes(name) ? 1 : 2
    }
    return contacts
        .filter((c) => c.accountId === accountId && rank(c) < 2)
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'))
        .slice(0, limit)
}
