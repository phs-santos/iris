// Vídeo do PBX simulado (RF-52): não há câmera nem rede, então cada ponta "manda" uma imagem de teste
// desenhada na hora, com o nome de quem fala e uma barra que anda, para dar para ver que há quadros.

export interface TestPattern {
    stream: MediaStream
    stop(): void
}

export function testPattern(label: string, color: string): TestPattern | null {
    // Nos testes de unidade não há tela.
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas.captureStream) return null
    let frame = 0
    const draw = (): void => {
        ctx.fillStyle = '#101820'
        ctx.fillRect(0, 0, 320, 180)
        ctx.fillStyle = color
        ctx.fillRect((frame * 8) % 320, 0, 24, 180)
        ctx.fillStyle = '#ffffff'
        ctx.font = '600 22px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(label, 160, 86)
        ctx.font = '13px ui-monospace, monospace'
        ctx.fillText(String(frame).padStart(4, '0'), 160, 112)
        frame++
    }
    draw()
    const timer = setInterval(draw, 100)
    const stream = canvas.captureStream(10)
    return {
        stream,
        stop: () => {
            clearInterval(timer)
            stream.getTracks().forEach((track) => track.stop())
        }
    }
}
