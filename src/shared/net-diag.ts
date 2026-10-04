// Diagnóstico de rede da tela de Saúde (RF-46): o que o DNS diz do domínio, que certificado o PBX
// apresenta e por qual endereço a rede sai para fora.

export interface NetDiagRequest {
    /** Domínio SIP da conta, para a busca dos registros SRV. Vazio ou IP pula a busca. */
    domain: string
    /** Onde conferir o certificado TLS; ausente quando a conta não usa TLS. */
    tls?: { host: string; port: number }
    /** Servidor STUN da própria conta. Sem ele o teste não roda: a Íris não consulta um servidor que o usuário não escolheu. */
    stun?: { host: string; port: number }
}

export interface SrvRecord {
    service: string
    target: string
    port: number
    priority: number
    weight: number
}

export interface TlsCertificateInfo {
    subject: string
    issuer: string
    validFrom: string
    validTo: string
    /** Nomes para os quais o certificado vale (subjectAltName). */
    names: string[]
    /** O sistema confia no certificado para este host. */
    trusted: boolean
    /** Por que não confia: autoassinado, vencido, nome errado… */
    problem?: string
}

export interface NetDiagResult {
    /** undefined quando a busca não se aplica (domínio vazio ou IP). */
    srv?: SrvRecord[]
    srvError?: string
    tls?: TlsCertificateInfo
    tlsError?: string
    /** Endereço e porta com que esta máquina aparece para o servidor STUN. */
    stun?: { address: string; port: number }
    stunError?: string
}

const isHost = (v: unknown): v is { host: string; port: number } => {
    if (!v || typeof v !== 'object') return false
    const t = v as { host?: unknown; port?: unknown }
    return (
        typeof t.host === 'string' &&
        /^[A-Za-z0-9.:_-]{1,255}$/.test(t.host) &&
        Number.isInteger(t.port) &&
        (t.port as number) > 0 &&
        (t.port as number) < 65536
    )
}

export function isNetDiagRequest(v: unknown): v is NetDiagRequest {
    if (!v || typeof v !== 'object') return false
    const r = v as Record<string, unknown>
    return (
        typeof r.domain === 'string' &&
        /^[A-Za-z0-9.:_-]{0,255}$/.test(r.domain) &&
        (r.tls === undefined || isHost(r.tls)) &&
        (r.stun === undefined || isHost(r.stun))
    )
}

/** Primeiro servidor `stun:` da lista da conta ("stun:host:porta, turn:…"), com a porta padrão 3478. */
export function firstStunServer(iceServers: string): { host: string; port: number } | undefined {
    for (const item of iceServers.split(',')) {
        const match = /^stuns?:([A-Za-z0-9.-]+)(?::(\d{1,5}))?/i.exec(item.trim())
        if (match) return { host: match[1]!, port: match[2] ? Number(match[2]) : 3478 }
    }
    return undefined
}

// ─── STUN (RFC 5389) ───────────────────────────────────────────────────────

const MAGIC_COOKIE = 0x2112a442

/** Pedido de "binding": 20 bytes de cabeçalho com um identificador aleatório de 12 bytes. */
export function buildStunRequest(transactionId: Uint8Array): Uint8Array {
    const out = new Uint8Array(20)
    const view = new DataView(out.buffer)
    view.setUint16(0, 0x0001)
    view.setUint16(2, 0)
    view.setUint32(4, MAGIC_COOKIE)
    out.set(transactionId.subarray(0, 12), 8)
    return out
}

/** Lê o endereço da resposta (XOR-MAPPED-ADDRESS ou o MAPPED-ADDRESS antigo). null se não é a resposta esperada. */
export function parseStunResponse(
    data: Uint8Array,
    transactionId: Uint8Array
): { address: string; port: number } | null {
    if (data.length < 20) return null
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    if (view.getUint16(0) !== 0x0101 || view.getUint32(4) !== MAGIC_COOKIE) return null
    for (let i = 0; i < 12; i++) if (data[8 + i] !== transactionId[i]) return null
    const end = Math.min(data.length, 20 + view.getUint16(2))
    for (let offset = 20; offset + 4 <= end;) {
        const type = view.getUint16(offset)
        const length = view.getUint16(offset + 2)
        const body = offset + 4
        // Família 1 é IPv4; a 2 (IPv6) não é tratada aqui.
        if ((type === 0x0020 || type === 0x0001) && length >= 8 && data[body + 1] === 1) {
            const xor = type === 0x0020
            const port = view.getUint16(body + 2) ^ (xor ? MAGIC_COOKIE >>> 16 : 0)
            const raw = view.getUint32(body + 4) ^ (xor ? MAGIC_COOKIE : 0)
            const address = [raw >>> 24, (raw >>> 16) & 0xff, (raw >>> 8) & 0xff, raw & 0xff].join('.')
            return { address, port }
        }
        offset = body + length + ((4 - (length % 4)) % 4)
    }
    return null
}
