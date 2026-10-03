// Sequências de DTMF com pausas (RF-14), ex.: "1,w2,4321#".
// Dígitos válidos: 0-9 * # A-D. "w<segundos>" espera (decimais com ponto, ex.: w1.5); vírgulas e espaços só separam.

export type DtmfStep = { type: 'tone'; tone: string } | { type: 'wait'; ms: number }

export class DtmfSyntaxError extends Error {}

export const DTMF_GAP_MS = 250

export function parseDtmfSequence(input: string): DtmfStep[] {
    const steps: DtmfStep[] = []
    const text = input.trim()
    let i = 0
    while (i < text.length) {
        const ch = text[i]
        if (ch === ',' || ch === ' ') {
            i++
            continue
        }
        if (ch === 'w' || ch === 'W') {
            const match = /^\d+(?:\.\d+)?/.exec(text.slice(i + 1))
            if (!match) throw new DtmfSyntaxError(`Depois de "w" informe os segundos, ex.: w2 (posição ${i + 1})`)
            const seconds = Number(match[0])
            if (seconds > 60) throw new DtmfSyntaxError('Pausa máxima de 60 s')
            steps.push({ type: 'wait', ms: Math.round(seconds * 1000) })
            i += 1 + match[0].length
            continue
        }
        const tone = ch.toUpperCase()
        if (!/^[0-9*#A-D]$/.test(tone)) throw new DtmfSyntaxError(`"${ch}" não é um dígito DTMF (posição ${i + 1})`)
        steps.push({ type: 'tone', tone })
        i++
    }
    return steps
}

/** Executa a sequência, chamando `send` para cada dígito. Para quando `signal` for abortado. */
export async function runDtmfSequence(
    steps: DtmfStep[],
    send: (tone: string) => Promise<void>,
    signal?: AbortSignal,
    gapMs = DTMF_GAP_MS
): Promise<void> {
    const sleep = (ms: number): Promise<void> =>
        new Promise((resolve, reject) => {
            const t = setTimeout(resolve, ms)
            signal?.addEventListener('abort', () => {
                clearTimeout(t)
                reject(new DOMException('Sequência interrompida', 'AbortError'))
            })
        })
    let previousWasTone = false
    for (const step of steps) {
        if (signal?.aborted) throw new DOMException('Sequência interrompida', 'AbortError')
        if (step.type === 'wait') {
            await sleep(step.ms)
            previousWasTone = false
        } else {
            if (previousWasTone) await sleep(gapMs)
            await send(step.tone)
            previousWasTone = true
        }
    }
}
