// Som que quem liga ouve enquanto o outro lado não atende (RF-20): o toque que o próprio app toca
// ("local") ou o áudio que o PBX manda antes do atendimento, o early media do 183 ("pbx").

export type Ringback = 'local' | 'pbx'

export interface RingbackAbility {
    /** O motor toca o áudio que o PBX manda antes de atender. */
    earlyAudio: boolean
    /** O app toca o toque de chamada para as chamadas deste motor (o simulado não tem som). */
    localRingback: boolean
}

/**
 * O que a pessoa está ouvindo numa chamada que ainda não foi atendida. Com 183 e áudio do PBX, é o
 * PBX, se o motor consegue tocar; senão, e enquanto só houver 180, é o toque do app. Antes de qualquer
 * resposta (só o 100) não toca nada: ainda não se sabe se o destino existe.
 */
export function ringbackOf(
    call: { direction: 'in' | 'out'; state: string },
    ability: RingbackAbility
): Ringback | undefined {
    if (call.direction !== 'out') return undefined
    if (call.state === 'early' && ability.earlyAudio) return 'pbx'
    if ((call.state === 'early' || call.state === 'ringing') && ability.localRingback) return 'local'
    return undefined
}
