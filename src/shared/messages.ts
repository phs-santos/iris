// Mensagens de texto por SIP MESSAGE (RF-54): o que fica guardado de cada conversa.

export interface ChatMessage {
    id: string
    accountId: string
    /** O ramal do outro lado da conversa. */
    peer: string
    peerName?: string
    direction: 'in' | 'out'
    text: string
    /** Quando foi enviada ou recebida, em milissegundos desde 1970. */
    at: number
    /** Mensagem recebida que ainda não apareceu na tela. */
    unread?: boolean
    /** Por que o envio falhou, como o PBX respondeu ("404 Not Found"). */
    failed?: string
}

export interface MessagesFile {
    schemaVersion: 1
    messages: ChatMessage[]
}

export const MESSAGES_LIMIT = 2000
/** O SIP MESSAGE vai num pacote só: a RFC 3428 pede no máximo 1300 bytes. */
export const MESSAGE_MAX_BYTES = 1300

export const messageBytes = (text: string): number => new TextEncoder().encode(text).length

const isText = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max

export function isChatMessage(v: unknown): v is ChatMessage {
    if (!v || typeof v !== 'object') return false
    const m = v as Record<string, unknown>
    return (
        isText(m.id, 200) &&
        isText(m.accountId, 200) &&
        isText(m.peer, 300) &&
        (m.peerName === undefined || isText(m.peerName, 300)) &&
        (m.direction === 'in' || m.direction === 'out') &&
        isText(m.text, 4000) &&
        typeof m.at === 'number' &&
        (m.unread === undefined || typeof m.unread === 'boolean') &&
        (m.failed === undefined || isText(m.failed, 300))
    )
}

/** A mais nova no fim; as mais antigas saem quando passa do limite. */
export function addMessage(list: ChatMessage[], message: ChatMessage, limit = MESSAGES_LIMIT): ChatMessage[] {
    return [...list.filter((m) => m.id !== message.id), message].slice(-limit)
}

export interface Conversation {
    accountId: string
    peer: string
    peerName?: string
    last: ChatMessage
    unread: number
}

export const conversationKey = (accountId: string, peer: string): string => `${accountId}\n${peer}`

/** Uma linha por conta e ramal, com a conversa mais recente primeiro. */
export function conversations(messages: ChatMessage[]): Conversation[] {
    const map = new Map<string, Conversation>()
    for (const message of messages) {
        const key = conversationKey(message.accountId, message.peer)
        const current = map.get(key)
        map.set(key, {
            accountId: message.accountId,
            peer: message.peer,
            peerName: message.peerName ?? current?.peerName,
            last: !current || message.at >= current.last.at ? message : current.last,
            unread: (current?.unread ?? 0) + (message.unread ? 1 : 0)
        })
    }
    return [...map.values()].sort((a, b) => b.last.at - a.last.at)
}

/** Só texto simples entra na conversa: aviso de "digitando" e afins chegam como outro tipo de corpo. */
export const isTextContent = (contentType: string | undefined): boolean =>
    !contentType || /^text\/plain\b/i.test(contentType.trim())
