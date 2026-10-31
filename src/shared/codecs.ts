// Ordem dos codecs de áudio do SIP puro (Configurações → Áudio). Vale na oferta das chamadas que a conta
// faz e na escolha de um codec quando a chamada chega.

export type AudioCodecName = 'G722' | 'PCMA' | 'PCMU' | 'opus'

export interface CodecPrefs {
    /** Do preferido para o menos preferido. */
    order: AudioCodecName[]
    /** Codecs que a Íris não oferece nem aceita. */
    disabled: AudioCodecName[]
}

// O G.722 vem primeiro: quando o PBX aceita, a chamada sai em banda larga. O Opus fica por último porque o
// Asterisk de muita gente não o tem.
export const DEFAULT_CODECS: AudioCodecName[] = ['G722', 'PCMU', 'PCMA', 'opus']

const isName = (v: unknown): v is AudioCodecName => DEFAULT_CODECS.includes(v as AudioCodecName)

/**
 * A lista de codecs da oferta: segue `order`, tira os desligados e põe no fim os que faltaram. Nome
 * desconhecido e repetido são ignorados. Nunca fica vazia: se tudo estiver desligado, vale o padrão.
 */
export function offerOrder(prefs: CodecPrefs | undefined): AudioCodecName[] {
    if (!prefs || typeof prefs !== 'object') return [...DEFAULT_CODECS]
    // Um settings.json mexido à mão pode trazer qualquer coisa: o que não é lista vale como lista vazia.
    const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
    const seen = new Set<AudioCodecName>()
    for (const name of [...list(prefs.order), ...DEFAULT_CODECS]) if (isName(name)) seen.add(name)
    const disabled = new Set(list(prefs.disabled).filter(isName))
    const offer = [...seen].filter((name) => !disabled.has(name))
    return offer.length ? offer : [...DEFAULT_CODECS]
}

export function isCodecPrefs(v: unknown): v is CodecPrefs | undefined {
    if (v === undefined) return true
    if (!v || typeof v !== 'object') return false
    const p = v as Record<string, unknown>
    const names = (list: unknown): boolean => Array.isArray(list) && list.length <= 4 && list.every(isName)
    return names(p.order) && names(p.disabled)
}
