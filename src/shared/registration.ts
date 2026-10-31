// Renovação do registro nos detalhes da conta: quanto falta e quando vale medir de novo.

/** Folga depois da hora marcada: o motor renova e só então a tela pergunta a próxima hora. */
export const RENEWAL_GRACE_MS = 2000

/** Medida mais nova que isto é reaproveitada: trocar de conta não manda outro OPTIONS. */
export const HEALTH_FRESH_MS = 10_000

/**
 * Quanto falta para renovar e se a hora já passou (com folga), pedindo uma medida nova para saber a
 * próxima renovação. Sem hora marcada, null.
 */
export function renewalState(renewsAt: number | undefined, now: number): { leftMs: number; due: boolean } | null {
    if (renewsAt === undefined) return null
    return { leftMs: Math.max(0, renewsAt - now), due: now >= renewsAt + RENEWAL_GRACE_MS }
}

/** A medida ainda vale: foi feita há menos de `HEALTH_FRESH_MS`. */
export const isFresh = (checkedAt: Date | number | undefined, now: number): boolean =>
    checkedAt !== undefined && now - new Date(checkedAt).getTime() < HEALTH_FRESH_MS
