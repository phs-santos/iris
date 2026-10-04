import { describe, expect, it } from 'vitest'
import { decodeG711, encodeG711 } from '../src/main/sip/g711'
import { buildRtp, parseRtp, RtpSession } from '../src/main/sip/rtp'
import { answerDirection, buildSdp, parseSdp, SdpError } from '../src/main/sip/sdp'
import { deriveKey, newSrtpKey, SrtpContext } from '../src/main/sip/srtp'
import { PacketCapture, udpPacket } from '../src/main/sip/pcap'

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

    it('áudio cifrado: a chave vai e volta na linha a=crypto', () => {
        const key = newSrtpKey()
        const sdp = buildSdp({ ...local, crypto: { tag: 1, key } })
        expect(sdp).toContain('m=audio 20000 RTP/SAVP 0 8 101')
        expect(sdp).toContain(`a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${key}`)
        expect(parseSdp(sdp).crypto).toEqual({ tag: 1, key })
        // Pega a primeira cifra que a Íris fala, e ignora a chave quando o áudio é RTP comum.
        const offer = `v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 4000 RTP/SAVP 0\r\na=crypto:1 AES_256_CM_HMAC_SHA1_80 inline:${key}\r\na=crypto:2 AES_CM_128_HMAC_SHA1_80 inline:${key}|2^31\r\n`
        expect(parseSdp(offer).crypto).toEqual({ tag: 2, key })
        expect(parseSdp(offer.replace('RTP/SAVP', 'RTP/AVP')).crypto).toBeUndefined()
    })

    it('recusa cifra desconhecida, falta de áudio e falta de codec em comum', () => {
        expect(() => parseSdp('v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 4000 RTP/SAVP 0\r\n')).toThrow(/cifra em comum/)
        expect(() => parseSdp('v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 4000 UDP/TLS/RTP/SAVPF 0\r\n')).toThrow(SdpError)
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
            // Os pacotes do '#' são os últimos a chegar; espera por eles em vez de um tempo fixo.
            for (let i = 0; i < 100 && (got.dtmf.length < 2 || b.getStats().packetsReceived < 27); i++)
                await new Promise((done) => setTimeout(done, 20))

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

describe('SRTP (RF-39)', () => {
    const hex = (text: string): Buffer => Buffer.from(text, 'hex')

    it('deriva as chaves de sessão como no exemplo da RFC 3711 (apêndice B.3)', () => {
        const key = hex('E1F97A0D3E018BE0D64FA32C06DE4139')
        const salt = hex('0EC675AD498AFEEBB6960B3AABE6')
        expect(deriveKey(key, salt, 0x00, 16).toString('hex').toUpperCase()).toBe('C61E7A93744F39EE10734AFE3FF7A087')
        expect(deriveKey(key, salt, 0x02, 14).toString('hex').toUpperCase()).toBe('30CBBC08863D8C85D49DB34A9AE1')
        expect(deriveKey(key, salt, 0x01, 20).toString('hex').toUpperCase()).toBe(
            'CEBE321F6FF7716B6FD4AB49AF256A156D38BAA4'
        )
    })

    const packet = (sequence: number, payload = 'voz em G.711'): Buffer =>
        buildRtp({
            payloadType: 0,
            marker: false,
            sequence,
            timestamp: sequence * 160,
            ssrc: 0x1234abcd,
            payload: Buffer.from(payload)
        })

    it('cifra a carga, mantém o cabeçalho e desfaz do outro lado', () => {
        const key = newSrtpKey()
        const [sender, receiver] = [new SrtpContext(key), new SrtpContext(key)]
        const plain = packet(100)
        const secret = sender.protect(plain)
        expect(secret).toHaveLength(plain.length + 10)
        expect(secret.subarray(0, 12)).toEqual(plain.subarray(0, 12))
        expect(secret.subarray(12, plain.length)).not.toEqual(plain.subarray(12))
        expect(receiver.unprotect(secret)).toEqual(plain)
    })

    it('recusa pacote adulterado, chave errada e pacote curto demais', () => {
        const sender = new SrtpContext(newSrtpKey())
        const secret = sender.protect(packet(1))
        const tampered = Buffer.from(secret)
        tampered[14] = tampered[14]! ^ 1
        const key = newSrtpKey()
        expect(new SrtpContext(key).unprotect(secret)).toBeNull()
        const receiver = new SrtpContext(key)
        expect(receiver.unprotect(new SrtpContext(key).protect(packet(1)))).not.toBeNull()
        expect(receiver.unprotect(tampered)).toBeNull()
        expect(receiver.unprotect(Buffer.alloc(8))).toBeNull()
        expect(() => new SrtpContext('curta')).toThrow(/tamanho errado/)
    })

    it('continua conferindo depois que o número de sequência dá a volta', () => {
        const key = newSrtpKey()
        const [sender, receiver] = [new SrtpContext(key), new SrtpContext(key)]
        for (const sequence of [65533, 65534, 65535, 0, 1, 2]) {
            const plain = packet(sequence, `pacote ${sequence}`)
            expect(receiver.unprotect(sender.protect(plain))).toEqual(plain)
        }
        // Um atrasado, de antes da volta, ainda confere.
        const late = new SrtpContext(key)
        const before = late.protect(packet(65535, 'atrasado'))
        for (const sequence of [0, 1]) late.protect(packet(sequence))
        const fresh = new SrtpContext(key)
        for (const sequence of [65534, 0, 1]) fresh.unprotect(sender.protect(packet(sequence)))
        expect(late.unprotect(before)).not.toBeNull()
    })

    it('duas sessões RTP com cifra se entendem, e sem a chave certa o áudio é descartado', async () => {
        const heard: Int16Array[] = []
        const a = new RtpSession({ audio: () => undefined, dtmf: () => undefined })
        const b = new RtpSession({ audio: (pcm) => heard.push(pcm), dtmf: () => undefined })
        try {
            const [, portB] = [await a.open(), await b.open()]
            const [keyA, keyB] = [newSrtpKey(), newSrtpKey()]
            const remote = { address: '127.0.0.1', codec: 'PCMA' as const, payload: 8, dtmfPayload: 101 }
            a.setRemote({ ...remote, port: portB })
            b.setRemote({ ...remote, port: 9 })
            a.setCrypto({ local: keyA, remote: keyB })
            b.setCrypto({ local: keyB, remote: keyA })
            for (let i = 0; i < 3; i++) a.sendPcm(sine(160))
            for (let i = 0; i < 100 && heard.length < 3; i++) await new Promise((done) => setTimeout(done, 20))
            expect(heard).toHaveLength(3)

            b.setCrypto({ local: keyB, remote: newSrtpKey() })
            a.sendPcm(sine(160))
            await new Promise((done) => setTimeout(done, 50))
            expect(heard).toHaveLength(3)
        } finally {
            a.close()
            b.close()
        }
    })
})

describe('RTCP (RF-39)', () => {
    it('mede o tempo de ida e volta com os relatórios dos dois lados', async () => {
        const quiet = { audio: () => undefined, dtmf: () => undefined }
        const [a, b] = [new RtpSession(quiet), new RtpSession(quiet)]
        const report = (session: RtpSession): void => (session as unknown as { sendRtcp(): void }).sendRtcp()
        const pause = (): Promise<void> => new Promise((done) => setTimeout(done, 40))
        try {
            const [portA, portB] = [await a.open(), await b.open()]
            const remote = { address: '127.0.0.1', codec: 'PCMU' as const, payload: 0 }
            a.setRemote({ ...remote, port: portB })
            b.setRemote({ ...remote, port: portA })
            a.sendPcm(sine(160))
            b.sendPcm(sine(160))
            // Numa máquina lenta os datagramas demoram: espera cada etapa acontecer em vez de um tempo fixo.
            for (let i = 0; i < 50 && !(a.getStats().packetsReceived && b.getStats().packetsReceived); i++)
                await pause()
            expect(a.getStats().rttMs).toBeUndefined()
            // A manda o relatório; B responde dizendo qual relatório viu e quanto tempo o segurou.
            for (let i = 0; i < 25 && a.getStats().rttMs === undefined; i++) {
                report(a)
                await pause()
                report(b)
                await pause()
            }
            const rtt = a.getStats().rttMs
            expect(rtt).toBeDefined()
            expect(rtt!).toBeLessThan(500)
        } finally {
            a.close()
            b.close()
        }
    })
})

describe('captura em PCAP (RF-44)', () => {
    const local = { address: '192.168.0.10', port: 5060 }
    const pbx = { address: '10.0.0.5', port: 5060 }

    it('monta um pacote IPv4 + UDP com endereços, portas e soma de verificação certos', () => {
        const packet = udpPacket(local, pbx, Buffer.from('OPTIONS'))
        expect(packet[0]).toBe(0x45)
        expect(packet.readUInt16BE(2)).toBe(28 + 7)
        expect(packet[9]).toBe(17)
        expect([...packet.subarray(12, 16)]).toEqual([192, 168, 0, 10])
        expect([...packet.subarray(16, 20)]).toEqual([10, 0, 0, 5])
        expect(packet.readUInt16BE(20)).toBe(5060)
        expect(packet.readUInt16BE(24)).toBe(8 + 7)
        expect(packet.subarray(28).toString()).toBe('OPTIONS')
        // A soma de todas as palavras do cabeçalho IP, com a soma de verificação, dá 0xffff.
        let sum = 0
        for (let i = 0; i < 20; i += 2) sum += packet.readUInt16BE(i)
        while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16)
        expect(sum).toBe(0xffff)
        // Endereço que não é IPv4 (IPv6, nome) vira 127.0.0.1 para o arquivo continuar legível.
        expect([...udpPacket({ address: '::1', port: 1 }, pbx, Buffer.alloc(0)).subarray(12, 16)]).toEqual([
            127, 0, 0, 1
        ])
    })

    it('escreve o arquivo em ordem de tempo e deixa o áudio de fora quando não é pedido', () => {
        const capture = new PacketCapture()
        capture.add(pbx, local, 'SIP/2.0 200 OK', false, 2000)
        capture.add(local, { address: '10.0.0.5', port: 10000 }, Buffer.alloc(172), true, 1500)
        capture.add(local, pbx, 'REGISTER sip:pbx SIP/2.0', false, 1000)
        expect(capture.count).toBe(3)

        const sip = capture.toPcap(false)
        expect(sip.readUInt32LE(0)).toBe(0xa1b2c3d4)
        expect(sip.readUInt32LE(20)).toBe(101)
        // Dois pacotes: o REGISTER (mais antigo) vem antes do 200.
        const first = sip.readUInt32LE(24 + 8)
        expect(sip.readUInt32LE(24)).toBe(1)
        expect(sip.subarray(24 + 16 + 28, 24 + 16 + first).toString()).toBe('REGISTER sip:pbx SIP/2.0')
        expect(sip.length).toBe(24 + 2 * 16 + 2 * 28 + 'REGISTER sip:pbx SIP/2.0'.length + 'SIP/2.0 200 OK'.length)
        expect(capture.toPcap(true).length).toBe(sip.length + 16 + 28 + 172)
    })

    it('ao passar do limite, descarta os pacotes mais antigos', () => {
        const capture = new PacketCapture(1000)
        for (let i = 0; i < 20; i++) capture.add(local, pbx, Buffer.alloc(172), true, i)
        expect(capture.count).toBe(5)
        expect(capture.toPcap(true).readUInt32LE(24 + 4)).toBe(15 * 1000)
    })
})
