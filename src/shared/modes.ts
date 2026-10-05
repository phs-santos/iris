// Modos (pedido do usuário em 05/10/2026): o app abre só com o padrão de chamada (contas, discador,
// chamadas, contatos e histórico). O resto liga numa área escondida das Configurações.

export type ModeId = 'log' | 'scenarios' | 'messages' | 'video' | 'sdr'

export const MODE_IDS: ModeId[] = ['log', 'scenarios', 'messages', 'video', 'sdr']

/** Sem a chave, o modo está desligado. `unlocked` diz se a área dos modos já foi aberta nesta máquina. */
export interface ModeSettings {
    enabled?: Partial<Record<ModeId, boolean>>
    unlocked?: boolean
}

export const modeOn = (settings: ModeSettings | undefined, mode: ModeId): boolean => settings?.enabled?.[mode] === true

export const ALL_MODES: ModeSettings = {
    enabled: { log: true, scenarios: true, messages: true, video: true, sdr: true }
}

export function isModeSettings(v: unknown): v is ModeSettings | undefined {
    if (v === undefined) return true
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const s = v as Record<string, unknown>
    const enabled = s.enabled as Record<string, unknown> | undefined
    return (
        Object.keys(s).every((k) => k === 'enabled' || k === 'unlocked') &&
        (s.unlocked === undefined || typeof s.unlocked === 'boolean') &&
        (enabled === undefined ||
            (typeof enabled === 'object' &&
                enabled !== null &&
                !Array.isArray(enabled) &&
                Object.entries(enabled).every(([k, on]) => MODE_IDS.includes(k as ModeId) && typeof on === 'boolean')))
    )
}

/** Cliques seguidos no logo que abrem a área dos modos, e o tempo máximo entre eles. */
export const SECRET_CLICKS = 5
export const SECRET_WINDOW_MS = 2500

/** Conta os cliques: devolve true no quinto clique rápido, e recomeça a contagem. */
export function secretTap(taps: number[], now: number): { taps: number[]; open: boolean } {
    const recent = [...taps.filter((t) => now - t < SECRET_WINDOW_MS), now]
    return recent.length >= SECRET_CLICKS ? { taps: [], open: true } : { taps: recent, open: false }
}
