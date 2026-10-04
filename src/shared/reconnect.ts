// Reconexão das contas depois de uma queda de rede ou de um reinício do PBX (RNF-06, RF-08):
// espera crescente entre as tentativas e um limite que o usuário escolhe.

import type { ReconnectSettings } from './types'

export const DEFAULT_RECONNECT: ReconnectSettings = { maxAttempts: 10 }
export const MAX_RECONNECT_ATTEMPTS = 1000

const FIRST_DELAY_MS = 2000
const MAX_DELAY_MS = 60_000

export const isReconnect = (v: unknown): v is ReconnectSettings | undefined =>
    v === undefined ||
    (Boolean(v) &&
        typeof v === 'object' &&
        Number.isInteger((v as ReconnectSettings).maxAttempts) &&
        (v as ReconnectSettings).maxAttempts >= 0 &&
        (v as ReconnectSettings).maxAttempts <= MAX_RECONNECT_ATTEMPTS)

/**
 * Espera antes da tentativa `attempt` (a primeira é 1): 2 s, 4 s, 8 s… até 60 s. Devolve null quando
 * o limite acabou. `random` espalha as contas do mesmo PBX, para não voltarem todas no mesmo instante.
 */
export function reconnectDelay(
    attempt: number,
    settings: ReconnectSettings = DEFAULT_RECONNECT,
    random: () => number = Math.random
): number | null {
    if (settings.maxAttempts > 0 && attempt > settings.maxAttempts) return null
    const base = Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** Math.min(attempt - 1, 10))
    return Math.round(base * (0.85 + 0.3 * random()))
}

/**
 * Só vale tentar de novo quando o defeito pode passar sozinho. Senha errada, ramal inexistente ou
 * login recusado não mudam com o tempo, e insistir faz o PBX bloquear o endereço (fail2ban).
 */
export function shouldReconnect(code: number | undefined): boolean {
    return code === undefined || ![401, 403, 404, 407].includes(code)
}
