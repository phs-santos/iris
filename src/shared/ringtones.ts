// Toques de chamada (RF-55). São sintetizados na hora, a partir destas notas: o app não carrega
// arquivo de som, e cada conta pode ter o seu para a pessoa saber qual linha toca sem olhar.

export type RingtoneId = 'classico' | 'digital' | 'suave' | 'sino' | 'nenhum'

export const RINGTONE_IDS: RingtoneId[] = ['classico', 'digital', 'suave', 'sino', 'nenhum']

export const DEFAULT_RINGTONE: RingtoneId = 'classico'

export interface RingNote {
    /** Frequências tocadas juntas, em Hz. */
    freqs: number[]
    /** Início dentro do ciclo e duração, em milissegundos. */
    atMs: number
    ms: number
    wave: 'sine' | 'triangle' | 'square'
    /** A nota some aos poucos, como um sino, em vez de cortar. */
    fade?: boolean
}

export interface Ringtone {
    /** O toque se repete a cada ciclo. */
    periodMs: number
    notes: RingNote[]
}

export const RINGTONES: Record<RingtoneId, Ringtone> = {
    // O toque de sempre: dois tons juntos por 1 s, a cada 3 s.
    classico: { periodMs: 3000, notes: [{ freqs: [440, 480], atMs: 0, ms: 1000, wave: 'sine' }] },
    digital: {
        periodMs: 2000,
        notes: [0, 150, 300, 600, 750, 900].map((atMs) => ({ freqs: [1320], atMs, ms: 90, wave: 'square' as const }))
    },
    suave: {
        periodMs: 3500,
        notes: [
            { freqs: [523], atMs: 0, ms: 500, wave: 'triangle', fade: true },
            { freqs: [659], atMs: 250, ms: 500, wave: 'triangle', fade: true },
            { freqs: [784], atMs: 500, ms: 900, wave: 'triangle', fade: true }
        ]
    },
    sino: {
        periodMs: 2500,
        notes: [
            { freqs: [880, 1760], atMs: 0, ms: 900, wave: 'sine', fade: true },
            { freqs: [660, 1320], atMs: 450, ms: 1100, wave: 'sine', fade: true }
        ]
    },
    nenhum: { periodMs: 3000, notes: [] }
}

export const isRingtoneId = (v: unknown): v is RingtoneId => RINGTONE_IDS.includes(v as RingtoneId)

/** Volume do toque nas preferências, de 0 a 100. */
export const DEFAULT_RING_VOLUME = 50

export const isRingVolume = (v: unknown): v is number | undefined =>
    v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100)

/**
 * Ganho do toque para um volume de 0 a 100. A curva é quadrática porque o ouvido não é linear: no
 * meio da barra o som fica na metade do que parece, não da amplitude. 50 dá o volume de antes da opção.
 */
export function ringGain(volume: number | undefined): number {
    const v = Math.max(0, Math.min(100, volume ?? DEFAULT_RING_VOLUME)) / 100
    return 0.32 * v * v
}
