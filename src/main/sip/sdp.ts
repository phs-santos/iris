// SDP (RFC 4566) do motor próprio: só áudio, com G.722, G.711, Opus e telephone-event. Monta a nossa descrição e lê
// a do outro lado: para onde mandar o RTP, com qual codec e em que sentido.

import type { AudioCodec } from './codec'
import { isSrtpKey, SRTP_SUITE } from './srtp'

export type MediaDirection = 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive'

export interface LocalMedia {
    address: string
    port: number
    /** Codecs na ordem de preferência; numa resposta, só o escolhido. */
    codecs: AudioCodec[]
    /** Payload do telephone-event (DTMF, RFC 4733) a 8000 Hz; ausente se o outro lado não ofereceu. */
    dtmfPayload?: number
    /** Payload do Opus e do telephone-event a 48000 Hz que o acompanha. Numa resposta, os números de quem ofereceu. */
    opusPayload?: number
    dtmf48Payload?: number
    direction: MediaDirection
    sessionId: number
    version: number
    /** Com chave, o áudio vai cifrado (RTP/SAVP) e a chave vai na linha a=crypto. */
    crypto?: { tag: number; key: string }
}

export interface RemoteMedia {
    address: string
    port: number
    codec: AudioCodec
    payload: number
    /** undefined quando o outro lado não aceita DTMF por RTP. */
    dtmfPayload?: number
    /** Relógio do telephone-event escolhido: 48000 quando acompanha o Opus, 8000 no resto. */
    dtmfRate: 8000 | 48000
    /** O sentido do ponto de vista de quem mandou o SDP. */
    direction: MediaDirection
    /** O outro lado cifra o áudio com esta chave (SRTP por SDES). */
    crypto?: { tag: number; key: string }
}

export class SdpError extends Error {}

export const OPUS_PAYLOAD = 111
export const DTMF48_PAYLOAD = 110

export function buildSdp(media: LocalMedia): string {
    const family = media.address.includes(':') ? 'IP6' : 'IP4'
    const opus = media.codecs.includes('opus')
    const payloadOf = (codec: AudioCodec): number =>
        codec === 'PCMU' ? 0 : codec === 'PCMA' ? 8 : codec === 'G722' ? 9 : (media.opusPayload ?? OPUS_PAYLOAD)
    // Numa oferta vão os dois telephone-event; numa resposta, só o que o outro lado ofereceu.
    const dtmf8 = media.dtmfPayload
    const dtmf48 = opus ? media.dtmf48Payload : undefined
    const payloads = [
        ...media.codecs.map(payloadOf),
        ...(dtmf8 === undefined ? [] : [dtmf8]),
        ...(dtmf48 === undefined ? [] : [dtmf48])
    ]
    return [
        'v=0',
        `o=iris ${media.sessionId} ${media.version} IN ${family} ${media.address}`,
        's=Iris',
        `c=IN ${family} ${media.address}`,
        't=0 0',
        `m=audio ${media.port} ${media.crypto ? 'RTP/SAVP' : 'RTP/AVP'} ${payloads.join(' ')}`,
        ...(media.crypto ? [`a=crypto:${media.crypto.tag} ${SRTP_SUITE} inline:${media.crypto.key}`] : []),
        ...media.codecs.map((c) => `a=rtpmap:${payloadOf(c)} ${c === 'opus' ? 'opus/48000/2' : `${c}/8000`}`),
        ...(dtmf8 === undefined ? [] : [`a=rtpmap:${dtmf8} telephone-event/8000`, `a=fmtp:${dtmf8} 0-16`]),
        ...(dtmf48 === undefined ? [] : [`a=rtpmap:${dtmf48} telephone-event/48000`, `a=fmtp:${dtmf48} 0-16`]),
        'a=ptime:20',
        `a=${media.direction}`,
        ''
    ].join('\r\n')
}

/** Lê o primeiro áudio do SDP. Lança SdpError se não houver codec em comum ou cifra que a Íris fale. */
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
    let codec: { name: AudioCodec; payload: number } | undefined
    let dtmf8: number | undefined
    let dtmf48: number | undefined
    for (const format of formats.map(Number)) {
        // Os payloads 0, 8 e 9 são fixos e podem vir sem rtpmap. O G.722 se anuncia a 8000, mesmo sendo de 16 kHz.
        const name =
            names.get(format) ??
            (format === 0 ? 'PCMU/8000' : format === 8 ? 'PCMA/8000' : format === 9 ? 'G722/8000' : '')
        // Vale a ordem de preferência de quem mandou o SDP.
        if (!codec && (name === 'PCMU/8000' || name === 'PCMA/8000'))
            codec = { name: name.slice(0, 4) as AudioCodec, payload: format }
        if (!codec && name === 'G722/8000') codec = { name: 'G722', payload: format }
        if (!codec && name === 'OPUS/48000') codec = { name: 'opus', payload: format }
        if (name === 'TELEPHONE-EVENT/8000') dtmf8 ??= format
        if (name === 'TELEPHONE-EVENT/48000') dtmf48 ??= format
    }
    if (!codec) throw new SdpError('Nenhum codec em comum: a Íris fala G.722, G.711 (PCMU e PCMA) e Opus')
    // Com Opus, o DTMF usa o telephone-event do mesmo relógio (48000), se o outro lado ofereceu.
    const dtmfRate = codec.name === 'opus' && dtmf48 !== undefined ? 48000 : 8000
    const dtmfPayload = dtmfRate === 48000 ? dtmf48 : dtmf8

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
        dtmfRate,
        direction,
        crypto: secure
    }
}

/** O sentido da nossa resposta: o espelho do que o outro lado pediu. */
export function answerDirection(remote: MediaDirection): MediaDirection {
    return remote === 'sendonly' ? 'recvonly' : remote === 'recvonly' ? 'sendonly' : remote
}
