import { describe, expect, it } from 'vitest'
import { clampWidth, DEBUG_WIDTH, fitWidth } from '@renderer/stores/debug'

describe('tamanho da gaveta de depuração', () => {
    it('o tamanho guardado só respeita os limites da gaveta, não a janela', () => {
        expect(clampWidth(100)).toBe(DEBUG_WIDTH.min)
        expect(clampWidth(5000)).toBe(DEBUG_WIDTH.max)
        expect(clampWidth(612.4)).toBe(612)
    })

    it('o desenhado encolhe na janela estreita sem esquecer o escolhido', () => {
        // 60 + 260 + 320 ficam reservados para a barra, o discador e as chamadas.
        expect(fitWidth(600, 1400)).toBe(600)
        expect(fitWidth(600, 1024)).toBe(384)
        expect(fitWidth(600, 1600)).toBe(600)
    })

    it('numa janela estreita demais fica abaixo do mínimo, sem estourar a grade', () => {
        expect(fitWidth(420, 900)).toBe(260)
        expect(fitWidth(420, 500)).toBe(160)
    })
})
