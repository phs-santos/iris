// Para onde o motor próprio (SIP puro, RF-39) manda as mensagens: transporte, host e porta.

/** `ws` é o WebRTC por WebSocket (easy-sipjs); os outros três são SIP puro, pelo motor próprio. */
export type AccountTransport = 'ws' | 'udp' | 'tcp' | 'tls'
export type SipTransportKind = Exclude<AccountTransport, 'ws'>

export const isSipTransportKind = (v: unknown): v is SipTransportKind => v === 'udp' || v === 'tcp' || v === 'tls'

export const defaultSipPort = (transport: SipTransportKind): number => (transport === 'tls' ? 5061 : 5060)

export interface SipTarget {
    host: string
    port: number
}

/**
 * Lê o campo "Servidor SIP" (`pbx.empresa.com`, `10.0.0.5:5080`, `[2001:db8::1]:5060`). Vazio usa o
 * domínio da conta. Devolve null quando o texto não é um host válido.
 */
export function parseSipServer(
    text: string | undefined,
    domain: string,
    transport: SipTransportKind
): SipTarget | null {
    const value = (text ?? '').trim() || domain.trim()
    const match = /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?$/i.exec(value)
    if (!match) return null
    const port = match[3] ? Number(match[3]) : defaultSipPort(transport)
    if (port < 1 || port > 65535) return null
    return { host: match[1]!.replace(/^\[|\]$/g, ''), port }
}
