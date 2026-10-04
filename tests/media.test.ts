import { describe, expect, it } from 'vitest'
import { decodeG711, encodeG711 } from '../src/main/sip/g711'
import { buildRtp, parseRtp, RtpSession } from '../src/main/sip/rtp'
import { answerDirection, buildSdp, parseSdp, SdpError } from '../src/main/sip/sdp'

const sine = (samples: number, amplitude = 12000): Int16Array =>
    Int16Array.from({ length: samples }, (_, i) => Math.round(amplitude * Math.sin((2 * Math.PI * 440 * i) / 8000)))

describe('G.711 (RF-39)', () => {
    it('silêncio vira o byte de repouso de cada lei', () => {
        expect([...encodeG711('PCMU', new Int16Array(2))]).toEqual([0xff, 0xff])
        expect([...encodeG711('PCMA', new Int16Array(2))]).toEqual([0xd5, 0xd5])
    })

    it('ida e volta fica perto do original nas duas leis', () => {
        const pcm = sine(160)
        for (const codec of ['PCMU', 'PCMA'] as const) {
            const back = decodeG711(codec, encodeG711(codec, pcm))
            expect(back).toHaveLength(160)
            // G.711 comprime em escala logarítmica: o erro cresce com a amplitude, mas fica em poucos por cento.
            for (let i = 0; i < pcm.length; i++) expect(Math.abs(back[i]! - pcm[i]!)).toBeLessThan(600)
        }
    })

    it('não estoura nos extremos', () => {
        const extremes = Int16Array.from([32767, -32768, 1, -1])
        for (const codec of ['PCMU', 'PCMA'] as const) {
            const back = decodeG711(codec, encodeG711(codec, extremes))
            expect(back[0]).toBeGreaterThan(30000)
            expect(back[1]).toBeLessThan(-30000)
            expect(Math.abs(back[2]!)).toBeLessThan(20)
        }
    })
})

describe('SDP (RF-39)', () => {
    const local = {
        address: '192.168.0.10',
        port: 20000,
        codecs: ['PCMU', 'PCMA'] as ('PCMU' | 'PCMA')[],
        dtmfPayload: 101,
        direction: 'sendrecv' as const,
        sessionId: 1,
        version: 1
    }

    it('oferece G.711 e telephone-event e lê a própria oferta', () => {
        const sdp = buildSdp(local)
        expect(sdp).toContain('m=audio 20000 RTP/AVP 0 8 101')
        expect(sdp).toContain('a=rtpmap:101 telephone-event/8000')
        expect(parseSdp(sdp)).toEqual({
            address: '192.168.0.10',
            port: 20000,
            codec: 'PCMU',
            payload: 0,
            dtmfPayload: 101,
            direction: 'sendrecv'
        })
    })

    it('escolhe o primeiro G.711 da lista do outro lado, mesmo sem rtpmap', () => {
        const media = parseSdp(
            'v=0\r\nc=IN IP4 10.0.0.1\r\nm=audio 4000 RTP/AVP 9 8 0 96\r\na=rtpmap:96 telephone-event/8000\r\n'
        )
        expect(media).toMatchObject({ codec: 'PCMA', payload: 8, dtmfPayload: 96, address: '10.0.0.1', port: 4000 })
    })

    it('o endereço da seção de áudio vale mais que o da sessão', () => {
        const media = parseSdp(
            'v=0\r\nc=IN IP4 10.0.0.1\r\nm=audio 4000 RTP/AVP 0\r\nc=IN IP4 10.0.0.9\r\na=sendonly\r\n'
        )
        expect(media.address).toBe('10.0.0.9')
        expect(media.direction).toBe('sendonly')
        expect(media.dtmfPayload).toBeUndefined()
    })

    it('recusa SRTP, falta de áudio e falta de codec em comum', () => {
        expect(() => parseSdp('v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 4000 RTP/SAVP 0\r\n')).toThrow(SdpError)
        expect(() => parseSdp('v=0\r\nm=video 4000 RTP/AVP 96\r\n')).toThrow(/não ofereceu áudio/)
        expect(() =>
            parseSdp('v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 4000 RTP/AVP 111\r\na=rtpmap:111 opus/48000/2\r\n')
        ).toThrow(/codec em comum/)
    })

    it('a resposta espelha o sentido pedido', () => {
        expect(answerDirection('sendonly')).toBe('recvonly')
        expect(answerDirection('recvonly')).toBe('sendonly')
        expect(answerDirection('inactive')).toBe('inactive')
        expect(answerDirection('sendrecv')).toBe('sendrecv')
    })
})

describe('RTP (RF-39)', () => {
    it('monta e lê um pacote, com extensão e enchimento', () => {
        const packet = {
            payloadType: 0,
            marker: true,
            sequence: 65535,
            timestamp: 0xfffffff0,
            ssrc: 0xdeadbeef,
            payload: Buffer.from([1, 2, 3])
        }
        expect(parseRtp(buildRtp(packet))).toEqual(packet)
        expect(parseRtp(Buffer.from([0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
        expect(parseRtp(Buffer.alloc(5))).toBeNull()
        // Bit de enchimento: o último byte diz quantos tirar do fim.
        const padded = Buffer.concat([buildRtp(packet), Buffer.from([0, 2])])
        padded[0] = padded[0]! | 0x20
        expect(parseRtp(padded)?.payload).toEqual(Buffer.from([1, 2, 3]))
    })

    it('duas sessões trocam áudio e dígitos pela rede local', async () => {
        const got: { audio: Int16Array[]; dtmf: string[] } = { audio: [], dtmf: [] }
        const a = new RtpSession({ audio: () => undefined, dtmf: () => undefined })
        const b = new RtpSession({ audio: (pcm) => got.audio.push(pcm), dtmf: (tone) => got.dtmf.push(tone) })
        try {
            const [portA, portB] = [await a.open(), await b.open()]
            expect(portA % 2).toBe(0)
            const remote = { address: '127.0.0.1', codec: 'PCMU' as const, payload: 0, dtmfPayload: 101 }
            a.setRemote({ ...remote, port: portB })
            // B anuncia uma porta errada: o endereço de onde o áudio chega corrige (RTP simétrico).
            b.setRemote({ ...remote, port: 9 })

            const pcm = sine(160)
            for (let i = 0; i < 5; i++) a.sendPcm(pcm)
            await a.sendDtmf('5')
            await a.sendDtmf('#')
            a.sendAudio = false
            a.sendPcm(pcm)
            await new Promise((done) => setTimeout(done, 60))

            expect(got.audio).toHaveLength(5)
            expect(Math.abs(got.audio[0]![40]! - pcm[40]!)).toBeLessThan(600)
            // Cada dígito chega em três pacotes de fim e vale uma vez só.
            expect(got.dtmf).toEqual(['5', '#'])
            expect(a.getStats().packetsSent).toBe(5 + 2 * (8 + 3))
            expect(b.getStats()).toMatchObject({ packetsReceived: 27, packetsLost: 0 })
            await expect(a.sendDtmf('x')).rejects.toThrow(/inválido/)
        } finally {
            a.close()
            b.close()
        }
    })

    it('sem telephone-event no outro lado, o dígito por RTP é recusado', async () => {
        const session = new RtpSession({ audio: () => undefined, dtmf: () => undefined })
        try {
            await session.open()
            session.setRemote({ address: '127.0.0.1', port: 9, codec: 'PCMA', payload: 8 })
            await expect(session.sendDtmf('1')).rejects.toThrow(/não aceita DTMF por RTP/)
        } finally {
            session.close()
        }
    })
})
