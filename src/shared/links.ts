// Links de telefone (RF-53): `tel:`, `callto:`, `sip:` e `sips:` que o sistema entrega à Íris.

export const LINK_SCHEMES = ['tel', 'callto', 'sip', 'sips'] as const

export interface LinkSettings {
    /** Liga assim que o link chega, sem esperar a pessoa confirmar. Desligado por padrão. */
    autoDial?: boolean
}

export const isLinkSettings = (v: unknown): v is LinkSettings | undefined => {
    if (v === undefined) return true
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const s = v as Record<string, unknown>
    return (
        Object.keys(s).every((k) => k === 'autoDial') && (s.autoDial === undefined || typeof s.autoDial === 'boolean')
    )
}

const MAX_NUMBER = 64

/**
 * Tira o número de um link. De `tel:` e `callto:` ficam só dígitos, `+`, `*` e `#`; de `sip:` fica o
 * usuário, porque a chamada sai pelo PBX da conta escolhida, não pelo host do link. Qualquer coisa
 * fora disso devolve null: o link vem de fora (uma página, um e-mail) e não é de confiança.
 */
export function parseCallLink(url: string): string | null {
    const match = /^(tel|callto|sips?):(.*)$/is.exec(url.trim())
    if (!match) return null
    const scheme = match[1].toLowerCase()
    // Parâmetros (";ext=12") e cabeçalhos ("?subject=x") não entram no número.
    let rest = match[2].replace(/^\/\//, '').split(/[;?]/)[0]
    try {
        rest = decodeURIComponent(rest)
    } catch {
        return null
    }
    if (scheme === 'tel' || scheme === 'callto') {
        const number = rest.replace(/[\s().\-/]/g, '')
        return /^\+?[0-9*#]+$/.test(number) && number.length <= MAX_NUMBER ? number : null
    }
    const user = rest.includes('@') ? rest.slice(0, rest.indexOf('@')) : ''
    return /^[A-Za-z0-9+*#._-]+$/.test(user) && user.length <= MAX_NUMBER ? user : null
}

/** O primeiro link de telefone entre os argumentos com que o app foi aberto (Windows e Linux). */
export function findCallLink(argv: string[]): string | null {
    for (const arg of argv) {
        const number = parseCallLink(arg)
        if (number) return number
    }
    return null
}

/** Quais esquemas a Íris abre hoje no sistema, e se dá para mudar isso nesta instalação. */
export interface LinkStatus {
    /** Só o app instalado consegue se registrar no sistema. */
    supported: boolean
    tel: boolean
    sip: boolean
}
