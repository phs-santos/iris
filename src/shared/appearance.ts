// Perfil e aparência, guardados em settings.json (tela de Configurações).
// Campos opcionais: um settings.json antigo, sem eles, continua valendo com os padrões (RNF-19).

export interface Profile {
    /** Nome que já vem preenchido como "nome de exibição" nas contas novas. */
    name?: string
    /** Conta escolhida para discar quando o app abre. */
    mainAccountId?: string
    /** A pessoa já terminou ou fechou os primeiros passos. */
    tourDone?: boolean
}

export type InterfaceSize = 'small' | 'medium' | 'large'

/** Escuro (o padrão), claro, ou o mesmo do sistema operacional. */
export type Theme = 'dark' | 'light' | 'system'
export const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light' || v === 'system'

export interface Appearance {
    /** Cor de destaque em #rrggbb: uma das paletas ou a cor que a pessoa escolheu. */
    accent?: string
    size?: InterfaceSize
    theme?: Theme
    /** Linhas mais baixas nas listas, para caber mais contas e chamadas. */
    compact?: boolean
}

export interface Palette {
    id: string
    name: string
    accent: string
}

/** Paletas prontas. Ficam longe do verde, do amarelo e do vermelho, que já dizem o estado (RNF-12). */
export const PALETTES: Palette[] = [
    { id: 'azul', name: 'Azul', accent: '#4f8ff7' },
    { id: 'ciano', name: 'Ciano', accent: '#38bdf8' },
    { id: 'turquesa', name: 'Turquesa', accent: '#2dd4bf' },
    { id: 'indigo', name: 'Índigo', accent: '#818cf8' },
    { id: 'violeta', name: 'Violeta', accent: '#c084fc' },
    { id: 'rosa', name: 'Rosa', accent: '#f472b6' }
]

export const DEFAULT_ACCENT = PALETTES[0].accent

/** Zoom da interface inteira; mexer só no tamanho da letra quebraria os painéis de largura fixa. */
export const INTERFACE_ZOOM: Record<InterfaceSize, number> = { small: 0.9, medium: 1, large: 1.15 }

/** Fundo dos painéis (--panel), usado para avisar quando a cor some contra ele. */
const PANEL = '#111a23'

export const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export const isInterfaceSize = (value: unknown): value is InterfaceSize =>
    value === 'small' || value === 'medium' || value === 'large'

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
    /** A cor some contra o fundo dos painéis (menos de 3:1); a tela avisa. */
    faint: boolean
}

export function accentTokens(color: string | undefined): AccentTokens {
    const accent = isHexColor(color) ? color.toLowerCase() : DEFAULT_ACCENT
    const rgb = toRgb(accent)
    let strong = accent
    for (let k = 0.05; contrast('#ffffff', strong) < 4.5 && k < 1; k += 0.05)
        strong = toHex(rgb.map((c) => c * (1 - k)) as Rgb)
    return { accent, strong, faint: contrast(accent, PANEL) < 3 }
}

/** Confere o que chega pelo IPC antes de gravar (docs/SEGURANCA.md). */
export function isProfile(value: unknown): value is Profile {
    if (value === undefined) return true
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const p = value as Record<string, unknown>
    const optionalText = (v: unknown, max: number): boolean =>
        v === undefined || (typeof v === 'string' && v.length <= max)
    return (
        optionalText(p.name, 120) &&
        optionalText(p.mainAccountId, 100) &&
        (p.tourDone === undefined || typeof p.tourDone === 'boolean')
    )
}

export function isAppearance(value: unknown): value is Appearance {
    if (value === undefined) return true
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const a = value as Record<string, unknown>
    return (
        (a.accent === undefined || isHexColor(a.accent)) &&
        (a.size === undefined || isInterfaceSize(a.size)) &&
        (a.theme === undefined || isTheme(a.theme)) &&
        (a.compact === undefined || typeof a.compact === 'boolean')
    )
}
