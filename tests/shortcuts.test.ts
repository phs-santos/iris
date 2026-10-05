import { describe, expect, it } from 'vitest'
import { acceleratorFromKey, describeAccelerator, isAccelerator, isShortcutSettings } from '../src/shared/shortcuts'

const press = (code: string, mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {}) => ({
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    ...mods,
    code
})

describe('atalhos globais (RF-34)', () => {
    it('aceita combinações com Ctrl, Alt, Cmd ou Win e teclas de função sozinhas', () => {
        expect(isAccelerator('Control+Alt+A')).toBe(true)
        expect(isAccelerator('Command+Shift+9')).toBe(true)
        expect(isAccelerator('F9')).toBe(true)
        expect(isAccelerator('Super+Space')).toBe(true)
    })

    it('recusa o que tomaria uma tecla comum de todos os programas', () => {
        expect(isAccelerator('A')).toBe(false)
        expect(isAccelerator('Shift+A')).toBe(false)
        expect(isAccelerator('Space')).toBe(false)
    })

    it('recusa texto que não é atalho', () => {
        expect(isAccelerator('Control+Control+A')).toBe(false)
        expect(isAccelerator('Control+')).toBe(false)
        expect(isAccelerator('Control+AB')).toBe(false)
        expect(isAccelerator('Hyper+A')).toBe(false)
        expect(isAccelerator(12)).toBe(false)
        expect(isAccelerator('F25')).toBe(false)
    })

    it('monta o atalho pelas teclas apertadas', () => {
        expect(acceleratorFromKey(press('KeyA', { ctrl: true, alt: true }), false)).toBe('Control+Alt+A')
        expect(acceleratorFromKey(press('Digit1', { meta: true, shift: true }), true)).toBe('Command+Shift+1')
        expect(acceleratorFromKey(press('KeyM', { meta: true }), false)).toBe('Super+M')
        expect(acceleratorFromKey(press('F8'), false)).toBe('F8')
        expect(acceleratorFromKey(press('ArrowUp', { ctrl: true }), false)).toBe('Control+Up')
    })

    it('espera a combinação ficar completa', () => {
        expect(acceleratorFromKey(press('ControlLeft', { ctrl: true }), false)).toBeNull()
        expect(acceleratorFromKey(press('KeyA'), false)).toBeNull()
        expect(acceleratorFromKey(press('KeyA', { shift: true }), false)).toBeNull()
        expect(acceleratorFromKey(press('Semicolon', { ctrl: true }), false)).toBeNull()
    })

    it('escreve o atalho como a pessoa lê no teclado', () => {
        expect(describeAccelerator('Control+Alt+A', false)).toBe('Ctrl + Alt + A')
        expect(describeAccelerator('Command+Alt+A', true)).toBe('Cmd + Option + A')
        expect(describeAccelerator('Super+M', false)).toBe('Win + M')
    })

    it('confere as preferências: ações conhecidas, atalhos válidos e sem repetição', () => {
        expect(isShortcutSettings(undefined)).toBe(true)
        expect(isShortcutSettings({})).toBe(true)
        expect(isShortcutSettings({ answer: 'Control+Alt+A', mute: 'F9' })).toBe(true)
        expect(isShortcutSettings({ answer: 'Control+Alt+A', hangup: 'Control+Alt+A' })).toBe(false)
        expect(isShortcutSettings({ answer: 'A' })).toBe(false)
        expect(isShortcutSettings({ dance: 'F9' })).toBe(false)
        expect(isShortcutSettings('F9')).toBe(false)
    })
})
