// SDP (RFC 4566) do motor próprio: só áudio, G.711 e telephone-event. Monta a nossa descrição e lê
// a do outro lado: para onde mandar o RTP, com qual codec e em que sentido.

import type { G711 } from './g711'
import { isSrtpKey, SRTP_SUITE } from './srtp'

export type MediaDirection = 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive'

export interface LocalMedia {
    address: string
    port: number
    /** Codecs na ordem de preferência; numa resposta, só o escolhido. */
    codecs: G711[]
    /** Payload do telephone-event (DTMF, RFC 4733). */
    dtmfPayload: number
    direction: MediaDirection
    sessionId: number
    version: number
    /** Com chave, o áudio vai cifrado (RTP/SAVP) e a chave vai na linha a=crypto. */
    crypto?: { tag: number; key: string }
}

export interface RemoteMedia {
    address: string
    port: number
    codec: G711
    payload: number
    /** undefined quando o outro lado não aceita DTMF por RTP. */
    dtmfPayload?: number
    /** O sentido do ponto de vista de quem mandou o SDP. */
    direction: MediaDirection
    /** O outro lado cifra o áudio com esta chave (SRTP por SDES). */
    crypto?: { tag: number; key: string }
}

export class SdpError extends Error {}

const PAYLOAD: Record<G711, number> = { PCMU: 0, PCMA: 8 }

export function buildSdp(media: LocalMedia): string {
    const family = media.address.includes(':') ? 'IP6' : 'IP4'
    const payloads = [...media.codecs.map((c) => PAYLOAD[c]), media.dtmfPayload]
    return [
        'v=0',
        `o=iris ${media.sessionId} ${media.version} IN ${family} ${media.address}`,
        's=Iris',
        `c=IN ${family} ${media.address}`,
        't=0 0',
        `m=audio ${media.port} ${media.crypto ? 'RTP/SAVP' : 'RTP/AVP'} ${payloads.join(' ')}`,
        ...(media.crypto ? [`a=crypto:${media.crypto.tag} ${SRTP_SUITE} inline:${media.crypto.key}`] : []),
        ...media.codecs.map((c) => `a=rtpmap:${PAYLOAD[c]} ${c}/8000`),
        `a=rtpmap:${media.dtmfPayload} telephone-event/8000`,
        `a=fmtp:${media.dtmfPayload} 0-16`,
        'a=ptime:20',
        `a=${media.direction}`,
        ''
    ].join('\r\n')
}

/** Lê o primeiro áudio do SDP. Lança SdpError se não houver G.711 em comum ou cifra que a Íris fale. */
export function parseSdp(text: string): RemoteMedia {
    const lines = text.split(/\r?\n/).map((line) => line.trim())
    const start = lines.findIndex((line) => line.startsWith('m=audio '))
    if (start < 0) throw new SdpError('O outro lado não ofereceu áudio')
    const next = lines.findIndex((line, i) => i > start && line.startsWith('m='))
    const section = lines.slice(start, next < 0 ? undefined : next)
    const [, portText, proto, ...formats] = section[0]!.split(/\s+/)
    if (proto !== 'RTP/AVP' && proto !== 'RTP/SAVP')
        throw new SdpError(`Mídia ${proto} não é suportada (só RTP e SRTP)`)
    let crypto: RemoteMedia['crypto']
    for (const line of section) {
        const match = /^a=crypto:(\d+) (\S+) inline:([A-Za-z0-9+/=]+)/.exec(line)
        if (!crypto && match && match[2] === SRTP_SUITE && isSrtpKey(match[3]!))
            crypto = { tag: Number(match[1]), key: match[3]! }
    }
    if (proto === 'RTP/SAVP' && !crypto)
        throw new SdpError(`Áudio cifrado sem uma cifra em comum: a Íris fala ${SRTP_SUITE}`)

    // O endereço da seção de áudio vale mais que o da sessão.
    const connection =
        section.find((line) => line.startsWith('c=')) ?? lines.slice(0, start).find((line) => line.startsWith('c='))
    const address = connection?.split(/\s+/)[2]
    if (!address) throw new SdpError('SDP sem endereço de mídia')

    const names = new Map<number, string>()
    for (const line of section) {
        const map = /^a=rtpmap:(\d+) ([^/\s]+)\/(\d+)/.exec(line)
        if (map) names.set(Number(map[1]), `${map[2]!.toUpperCase()}/${map[3]}`)
    }
    let codec: { name: G711; payload: number } | undefined
    let dtmfPayload: number | undefined
    for (const format of formats.map(Number)) {
        // Os payloads 0 e 8 são fixos e podem vir sem rtpmap.
        const name = names.get(format) ?? (format === 0 ? 'PCMU/8000' : format === 8 ? 'PCMA/8000' : '')
        if (!codec && (name === 'PCMU/8000' || name === 'PCMA/8000'))
            codec = { name: name.slice(0, 4) as G711, payload: format }
        if (name === 'TELEPHONE-EVENT/8000') dtmfPayload ??= format
    }
    if (!codec) throw new SdpError('Nenhum codec em comum: a Íris fala G.711 (PCMU e PCMA)')

    const directions: MediaDirection[] = ['sendrecv', 'sendonly', 'recvonly', 'inactive']
    const all = [...lines.slice(0, start), ...section]
    const direction = directions.find((d) => all.includes(`a=${d}`)) ?? 'sendrecv'
    // A chave só vale com RTP/SAVP: em RTP/AVP o outro lado manda sem cifra.
    const secure = proto === 'RTP/SAVP' ? crypto : undefined
    return {
        address,
        port: Number(portText),
        codec: codec.name,
        payload: codec.payload,
        dtmfPayload,
        direction,
        crypto: secure
    }
}

/** O sentido da nossa resposta: o espelho do que o outro lado pediu. */
export function answerDirection(remote: MediaDirection): MediaDirection {
    return remote === 'sendonly' ? 'recvonly' : remote === 'recvonly' ? 'sendonly' : remote
}
