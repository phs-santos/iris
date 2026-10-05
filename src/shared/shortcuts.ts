// Atalhos globais (RF-34): funcionam com outro app em foco. As regras ficam aqui para a tela e o
// processo principal concordarem sobre o que é um atalho aceitável.

export type ShortcutAction = 'answer' | 'hangup' | 'mute'

export const SHORTCUT_ACTIONS: ShortcutAction[] = ['answer', 'hangup', 'mute']

/** Atalho de cada ação, no formato do Electron ("Control+Alt+A"). Sem a chave, a ação não tem atalho. */
export type ShortcutSettings = Partial<Record<ShortcutAction, string>>

const MODIFIERS = ['Control', 'Command', 'Super', 'Alt', 'Shift']
const NAMED_KEYS = ['Space', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete']
const isFunctionKey = (key: string): boolean => /^F([1-9]|1[0-9]|2[0-4])$/.test(key)
const isKey = (key: string): boolean => /^[A-Z0-9]$/.test(key) || isFunctionKey(key) || NAMED_KEYS.includes(key)

/**
 * Um atalho global toma a tecla de todos os programas. Por isso precisa de Ctrl, Alt, Cmd ou Win
 * (só Shift não basta), a não ser que seja uma tecla de função: senão digitar "A" em qualquer lugar
 * atenderia a chamada.
 */
export function isAccelerator(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 60) return false
    const parts = value.split('+')
    const key = parts.pop() ?? ''
    if (!isKey(key)) return false
    if (new Set(parts).size !== parts.length || !parts.every((p) => MODIFIERS.includes(p))) return false
    return isFunctionKey(key) || parts.some((p) => p !== 'Shift')
}

export function isShortcutSettings(v: unknown): v is ShortcutSettings | undefined {
    if (v === undefined) return true
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const entries = Object.entries(v as Record<string, unknown>)
    const used = entries.map(([, accelerator]) => accelerator)
    return (
        entries.every(
            ([action, accelerator]) => SHORTCUT_ACTIONS.includes(action as ShortcutAction) && isAccelerator(accelerator)
        ) && new Set(used).size === used.length
    )
}

export interface KeyPress {
    ctrl: boolean
    alt: boolean
    shift: boolean
    meta: boolean
    /** `KeyboardEvent.code`: a tecla física, que não muda com o Shift nem com o idioma do teclado. */
    code: string
}

const CODE_KEYS: Record<string, string> = {
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete'
}

/** Monta o atalho a partir das teclas apertadas; null enquanto a combinação não serve. */
export function acceleratorFromKey(press: KeyPress, mac: boolean): string | null {
    const key = /^Key[A-Z]$/.test(press.code)
        ? press.code.slice(3)
        : /^Digit[0-9]$/.test(press.code)
          ? press.code.slice(5)
          : isFunctionKey(press.code)
            ? press.code
            : CODE_KEYS[press.code]
    if (!key) return null
    const parts = [
        press.ctrl && 'Control',
        press.meta && (mac ? 'Command' : 'Super'),
        press.alt && 'Alt',
        press.shift && 'Shift'
    ].filter((p): p is string => Boolean(p))
    const accelerator = [...parts, key].join('+')
    return isAccelerator(accelerator) ? accelerator : null
}

/** Como o atalho aparece na tela: "Ctrl + Alt + A". */
export function describeAccelerator(accelerator: string, mac: boolean): string {
    const names: Record<string, string> = {
        Control: 'Ctrl',
        Command: 'Cmd',
        Super: mac ? 'Cmd' : 'Win',
        Alt: mac ? 'Option' : 'Alt'
    }
    return accelerator
        .split('+')
        .map((p) => names[p] ?? p)
        .join(' + ')
}
