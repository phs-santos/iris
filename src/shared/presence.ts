// Presença de outros ramais (BLF) e aviso de correio de voz (MWI), do RF-27.

/** Livre, tocando, em chamada, ou ainda sem notícia do PBX. */
export type PresenceState = 'idle' | 'ringing' | 'busy' | 'unknown'

export interface MwiInfo {
    waiting: boolean
    newMessages: number
    oldMessages: number
}

/** "1002, 1003 2001" → ['1002', '1003', '2001'], sem repetidos e só com o que cabe num endereço SIP. */
export function parseBlfList(text: string | undefined): string[] {
    const items = (text ?? '')
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter((item) => /^[A-Za-z0-9_.*#+-]{1,40}$/.test(item))
    return [...new Set(items)].slice(0, 50)
}

/**
 * Lê o corpo de um NOTIFY de `dialog` (RFC 4235, application/dialog-info+xml). O ramal está em
 * chamada se algum diálogo está confirmado; tocando se algum está começando; senão, livre.
 */
export function parseDialogInfo(xml: string): PresenceState {
    const states = [...xml.matchAll(/<state[^>]*>\s*([a-z]+)\s*<\/state>/gi)].map((m) => m[1]!.toLowerCase())
    if (states.includes('confirmed')) return 'busy'
    if (states.some((s) => s === 'early' || s === 'proceeding' || s === 'trying')) return 'ringing'
    return 'idle'
}

/** Lê o corpo de um NOTIFY de `message-summary` (RFC 3842): "Messages-Waiting: yes" e "Voice-Message: 2/8". */
export function parseMessageSummary(body: string): MwiInfo | null {
    const waiting = /^Messages-Waiting\s*:\s*(yes|no)/im.exec(body)
    if (!waiting) return null
    const counts = /^Voice-Message\s*:\s*(\d+)\s*\/\s*(\d+)/im.exec(body)
    return {
        waiting: waiting[1]!.toLowerCase() === 'yes',
        newMessages: counts ? Number(counts[1]) : 0,
        oldMessages: counts ? Number(counts[2]) : 0
    }
}
