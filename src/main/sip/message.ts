// Mensagens SIP (RFC 3261, seção 7), feitas à mão: o motor próprio da Íris não depende de biblioteca.
// Esta parte só lê e escreve texto; transporte, transações e diálogos ficam em outros arquivos.

export interface SipUri {
    scheme: 'sip' | 'sips'
    user?: string
    host: string
    port?: number
    params: Record<string, string | null>
}

interface Base {
    /** Cabeçalhos na ordem em que chegaram, com o nome na forma longa e o valor sem espaços nas pontas. */
    headers: [string, string][]
    body: string
}

export interface SipRequest extends Base {
    kind: 'request'
    method: string
    uri: string
}

export interface SipResponse extends Base {
    kind: 'response'
    status: number
    reason: string
}

export type SipMessage = SipRequest | SipResponse

export class SipParseError extends Error {}

/** Formas compactas (RFC 3261, 7.3.3 e extensões comuns). */
const COMPACT: Record<string, string> = {
    i: 'Call-ID',
    m: 'Contact',
    e: 'Content-Encoding',
    l: 'Content-Length',
    c: 'Content-Type',
    f: 'From',
    s: 'Subject',
    k: 'Supported',
    t: 'To',
    v: 'Via',
    o: 'Event',
    r: 'Refer-To',
    b: 'Referred-By',
    u: 'Allow-Events',
    x: 'Session-Expires'
}

/** Grafia usual dos nomes, para o que sai ficar igual ao que os PBX costumam mandar. */
const CANONICAL: Record<string, string> = Object.fromEntries(
    [
        'Via',
        'From',
        'To',
        'Call-ID',
        'CSeq',
        'Contact',
        'Max-Forwards',
        'Content-Type',
        'Content-Length',
        'User-Agent',
        'Allow',
        'Supported',
        'Expires',
        'WWW-Authenticate',
        'Authorization',
        'Proxy-Authenticate',
        'Proxy-Authorization',
        'Record-Route',
        'Route',
        'Event',
        'Refer-To',
        'Referred-By',
        'Subscription-State',
        'Session-Expires',
        'Min-Expires',
        'Allow-Events',
        'Content-Encoding',
        'Subject',
        'Server',
        'Accept',
        'Require',
        'Reason',
        'RSeq',
        'RAck',
        'P-Asserted-Identity'
    ].map((name) => [name.toLowerCase(), name])
)

export function canonicalName(name: string): string {
    const lower = name.trim().toLowerCase()
    const long = COMPACT[lower] ?? name.trim()
    return CANONICAL[long.toLowerCase()] ?? long
}

/**
 * Cabeçalhos que podem trazer vários valores separados por vírgula (Via, Contact, Route…).
 * Os de autenticação não entram: neles a vírgula separa parâmetros.
 */
const LIST_HEADERS = new Set(['via', 'contact', 'route', 'record-route', 'allow', 'supported', 'require', 'accept'])

/** Separa por vírgula, respeitando aspas e < >. */
export function splitList(value: string): string[] {
    const parts: string[] = []
    let depth = 0
    let quoted = false
    let current = ''
    for (let i = 0; i < value.length; i++) {
        const ch = value[i]!
        if (ch === '"' && value[i - 1] !== '\\') quoted = !quoted
        else if (!quoted && ch === '<') depth++
        else if (!quoted && ch === '>') depth--
        if (ch === ',' && !quoted && depth === 0) {
            parts.push(current.trim())
            current = ''
        } else current += ch
    }
    if (current.trim()) parts.push(current.trim())
    return parts
}

/** Lê uma mensagem inteira. O corpo é limitado pelo Content-Length, quando ele existe. */
export function parseMessage(text: string): SipMessage {
    const split = text.indexOf('\r\n\r\n')
    const head = split >= 0 ? text.slice(0, split) : text
    let body = split >= 0 ? text.slice(split + 4) : ''
    // Linhas que começam com espaço continuam a anterior (RFC 3261, 7.3.1).
    const lines = head.replace(/\r\n[ \t]+/g, ' ').split('\r\n')
    const start = lines.shift()
    if (!start) throw new SipParseError('Mensagem vazia')

    const headers: [string, string][] = []
    for (const line of lines) {
        const colon = line.indexOf(':')
        if (colon <= 0) throw new SipParseError(`Cabeçalho inválido: ${line.slice(0, 80)}`)
        const name = canonicalName(line.slice(0, colon))
        const value = line.slice(colon + 1).trim()
        const values = LIST_HEADERS.has(name.toLowerCase()) ? splitList(value) : [value]
        for (const v of values) headers.push([name, v])
    }

    const length = headers.find(([n]) => n === 'Content-Length')?.[1]
    if (length !== undefined) {
        const bytes = Number(length)
        if (!Number.isInteger(bytes) || bytes < 0) throw new SipParseError(`Content-Length inválido: ${length}`)
        body = Buffer.from(body, 'utf8').subarray(0, bytes).toString('utf8')
    }

    const response = /^SIP\/2\.0 (\d{3}) ?(.*)$/.exec(start)
    if (response) return { kind: 'response', status: Number(response[1]), reason: response[2] ?? '', headers, body }
    const request = /^([A-Z]+) (\S+) SIP\/2\.0$/.exec(start)
    if (request) return { kind: 'request', method: request[1]!, uri: request[2]!, headers, body }
    throw new SipParseError(`Linha inicial inválida: ${start.slice(0, 80)}`)
}

/** Escreve a mensagem, sempre com Content-Length correto (obrigatório em TCP e TLS). */
export function serializeMessage(message: SipMessage): string {
    const start =
        message.kind === 'request'
            ? `${message.method} ${message.uri} SIP/2.0`
            : `SIP/2.0 ${message.status} ${message.reason}`
    const lines = message.headers
        .filter(([name]) => name !== 'Content-Length')
        .map(([name, value]) => `${name}: ${value}`)
    lines.push(`Content-Length: ${Buffer.byteLength(message.body, 'utf8')}`)
    return `${start}\r\n${lines.join('\r\n')}\r\n\r\n${message.body}`
}

export function header(message: SipMessage, name: string): string | undefined {
    const wanted = canonicalName(name)
    return message.headers.find(([n]) => n === wanted)?.[1]
}

export function headers(message: SipMessage, name: string): string[] {
    const wanted = canonicalName(name)
    return message.headers.filter(([n]) => n === wanted).map(([, v]) => v)
}

/** Lê os parâmetros de um valor como `<sip:a@b>;tag=1;expires=60` ou `SIP/2.0/UDP h;branch=z`. */
export function headerParams(value: string): Record<string, string | null> {
    const end = value.lastIndexOf('>')
    const tail =
        end >= 0 ? value.slice(end + 1) : value.slice(value.indexOf(';') >= 0 ? value.indexOf(';') : value.length)
    const params: Record<string, string | null> = {}
    for (const part of tail.split(';').slice(1)) {
        const [key, ...rest] = part.split('=')
        if (!key?.trim()) continue
        params[key.trim().toLowerCase()] = rest.length ? rest.join('=').trim().replace(/^"|"$/g, '') : null
    }
    return params
}

/** Tira o endereço de dentro de `"Nome" <sip:...>;tag=x` ou de `sip:...;tag=x`. */
export function addressOf(value: string): { display?: string; uri: string } {
    const angle = /^\s*(?:"((?:[^"\\]|\\.)*)"|([^<]*?))\s*<([^>]+)>/.exec(value)
    if (angle) {
        const display = (angle[1] ?? angle[2] ?? '').trim()
        return { display: display || undefined, uri: angle[3]! }
    }
    return { uri: value.split(';')[0]!.trim() }
}

export function parseUri(text: string): SipUri {
    const match = /^(sips?):(?:([^@;]+)@)?(\[[^\]]+\]|[^:;?]+)(?::(\d+))?((?:;[^?]*)?)/i.exec(text.trim())
    if (!match) throw new SipParseError(`Endereço SIP inválido: ${text}`)
    const params: Record<string, string | null> = {}
    for (const part of (match[5] ?? '').split(';').slice(1)) {
        const [key, ...rest] = part.split('=')
        if (key) params[key.toLowerCase()] = rest.length ? rest.join('=') : null
    }
    return {
        scheme: match[1]!.toLowerCase() as 'sip' | 'sips',
        user: match[2] ? decodeURIComponent(match[2]) : undefined,
        host: match[3]!.toLowerCase(),
        port: match[4] ? Number(match[4]) : undefined,
        params
    }
}

export function formatUri(uri: SipUri): string {
    const user = uri.user ? `${encodeURIComponent(uri.user).replace(/%2B/gi, '+')}@` : ''
    const port = uri.port ? `:${uri.port}` : ''
    const params = Object.entries(uri.params)
        .map(([key, value]) => (value === null ? `;${key}` : `;${key}=${value}`))
        .join('')
    return `${uri.scheme}:${user}${uri.host}${port}${params}`
}

/** CSeq como número e método, ex.: "2 REGISTER". */
export function cseqOf(message: SipMessage): { seq: number; method: string } {
    const [seq, method] = (header(message, 'CSeq') ?? '').split(/\s+/)
    return { seq: Number(seq), method: method ?? '' }
}

/**
 * Separa as mensagens que chegam num fluxo TCP ou TLS, onde várias podem vir juntas ou uma pode
 * chegar em pedaços. Guarda o que sobrou para a próxima leitura.
 */
export class StreamFramer {
    private buffer = Buffer.alloc(0)

    push(chunk: Buffer): string[] {
        this.buffer = Buffer.concat([this.buffer, chunk])
        const out: string[] = []
        for (;;) {
            // CRLF soltos são keep-alive (RFC 5626): descarta.
            while (this.buffer.length >= 2 && this.buffer[0] === 13 && this.buffer[1] === 10)
                this.buffer = this.buffer.subarray(2)
            const end = this.buffer.indexOf('\r\n\r\n')
            if (end < 0) break
            const head = this.buffer.subarray(0, end).toString('utf8')
            const length = /^(?:content-length|l)[ \t]*:[ \t]*(\d+)/im.exec(head)
            const total = end + 4 + (length ? Number(length[1]) : 0)
            if (this.buffer.length < total) break
            out.push(this.buffer.subarray(0, total).toString('utf8'))
            this.buffer = this.buffer.subarray(total)
        }
        return out
    }
}
