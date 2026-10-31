// Aparência, guardada em settings.json (tela de Configurações).
// Campos opcionais: um settings.json sem eles continua valendo com os padrões (RNF-19).

/** Claro (o padrão), escuro, ou o mesmo do sistema operacional. */
export type Theme = 'dark' | 'light' | 'system'
export const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light' || v === 'system'
export const DEFAULT_THEME: Theme = 'light'

/** Aparência (Configurações): só o tema e a cor de destaque, em #rrggbb. */
export interface Appearance {
    theme?: Theme
    accent?: string
}

export const DEFAULT_ACCENT = '#2563eb'

/** Fundo dos painéis (--panel) em cada tema, usado para avisar quando a cor some contra ele. */
const PANEL = { dark: '#111a23', light: '#ffffff' }

export const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

type Rgb = [number, number, number]

function toRgb(hex: string): Rgb {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: Rgb): string {
    return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** Luminância relativa da WCAG 2. */
function luminance(hex: string): number {
    const [r, g, b] = toRgb(hex).map((c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}

export interface AccentTokens {
    /** Contornos, abas e foco. */
    accent: string
    /** Fundo dos botões principais, escurecido até o texto branco ter contraste AA (4,5:1). */
    strong: string
    /** A cor some contra o fundo dos painéis do tema (menos de 3:1); a tela avisa. */
    faint: boolean
}

export function accentTokens(color: string | undefined, theme: 'dark' | 'light' = 'light'): AccentTokens {
    const accent = isHexColor(color) ? color.toLowerCase() : DEFAULT_ACCENT
    const rgb = toRgb(accent)
    let strong = accent
    for (let k = 0.05; contrast('#ffffff', strong) < 4.5 && k < 1; k += 0.05)
        strong = toHex(rgb.map((c) => c * (1 - k)) as Rgb)
    return { accent, strong, faint: contrast(accent, PANEL[theme]) < 3 }
}

/** Confere o que chega pelo IPC antes de gravar (docs/SEGURANCA.md). Só tema e cor valem. */
export function isAppearance(value: unknown): value is Appearance {
    if (value === undefined) return true
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const a = value as Record<string, unknown>
    return (
        Object.keys(a).every((k) => k === 'theme' || k === 'accent') &&
        (a.theme === undefined || isTheme(a.theme)) &&
        (a.accent === undefined || isHexColor(a.accent))
    )
}
