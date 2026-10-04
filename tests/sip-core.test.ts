// Motor SIP próprio: roda no processo principal, então este teste é conferido pelo tsconfig.node.json.
import { describe, expect, it } from 'vitest'
import {
    addressOf,
    cseqOf,
    formatUri,
    header,
    headerParams,
    headers,
    parseMessage,
    parseUri,
    serializeMessage,
    SipParseError,
    StreamFramer
} from '../src/main/sip/message'
import { digestAuthorization, parseChallenge } from '../src/main/sip/digest'

const crlf = (lines: string[]): string => lines.join('\r\n')

describe('mensagens SIP (motor próprio)', () => {
    const invite = crlf([
        'INVITE sip:1002@pbx.local SIP/2.0',
        'v: SIP/2.0/UDP 10.0.0.5:5060;branch=z9hG4bK1, SIP/2.0/UDP proxy:5060;branch=z9hG4bK2',
        'f: "Ramal, 1001" <sip:1001@pbx.local>;tag=abc',
        't: <sip:1002@pbx.local>',
        'i: 123@10.0.0.5',
        'CSeq: 1 INVITE',
        'Subject: linha',
        '  continuada',
        'c: application/sdp',
        'l: 4',
        '',
        'v=0\r\nsobra'
    ])

    it('lê formas compactas, listas, linhas continuadas e respeita o Content-Length', () => {
        const m = parseMessage(invite)
        expect(m.kind).toBe('request')
        if (m.kind !== 'request') return
        expect(m.method).toBe('INVITE')
        expect(headers(m, 'Via')).toHaveLength(2)
        expect(header(m, 'From')).toBe('"Ramal, 1001" <sip:1001@pbx.local>;tag=abc')
        expect(header(m, 'call-id')).toBe('123@10.0.0.5')
        expect(header(m, 'Subject')).toBe('linha continuada')
        expect(m.body).toBe('v=0\r')
        expect(cseqOf(m)).toEqual({ seq: 1, method: 'INVITE' })
    })

    it('lê respostas e parâmetros de cabeçalho', () => {
        const m = parseMessage(crlf(['SIP/2.0 401 Unauthorized', 'To: <sip:a@b>;tag=99', 'Content-Length: 0', '', '']))
        expect(m.kind === 'response' && m.status).toBe(401)
        expect(headerParams(header(m, 'To')!)).toEqual({ tag: '99' })
        expect(headerParams('SIP/2.0/UDP h:5060;branch=z9hG4bKx;rport')).toEqual({ branch: 'z9hG4bKx', rport: null })
    })

    it('escreve com o Content-Length certo, contando bytes', () => {
        const text = serializeMessage({
            kind: 'request',
            method: 'MESSAGE',
            uri: 'sip:a@b',
            headers: [['Content-Length', '999']],
            body: 'ação'
        })
        expect(text).toBe('MESSAGE sip:a@b SIP/2.0\r\nContent-Length: 6\r\n\r\nação')
        expect(parseMessage(text).body).toBe('ação')
    })

    it('recusa mensagem quebrada com erro próprio', () => {
        expect(() => parseMessage('lixo')).toThrow(SipParseError)
        expect(() => parseMessage('INVITE sip:a SIP/2.0\r\nsem dois pontos\r\n\r\n')).toThrow(SipParseError)
    })

    it('lê e escreve endereços SIP', () => {
        expect(addressOf('"Nome" <sip:1001@pbx;transport=tcp>;tag=1')).toEqual({
            display: 'Nome',
            uri: 'sip:1001@pbx;transport=tcp'
        })
        expect(addressOf('sip:1001@pbx;tag=1')).toEqual({ uri: 'sip:1001@pbx' })
        const uri = parseUri('sips:+5511@[::1]:5061;transport=tls;lr')
        expect(uri).toEqual({
            scheme: 'sips',
            user: '+5511',
            host: '[::1]',
            port: 5061,
            params: { transport: 'tls', lr: null }
        })
        expect(formatUri(uri)).toBe('sips:+5511@[::1]:5061;transport=tls;lr')
    })

    it('separa mensagens de um fluxo TCP que chega em pedaços e juntas', () => {
        const a = serializeMessage({ kind: 'response', status: 200, reason: 'OK', headers: [], body: 'abc' })
        const b = serializeMessage({ kind: 'response', status: 180, reason: 'Ringing', headers: [], body: '' })
        const framer = new StreamFramer()
        const all = Buffer.from(`\r\n\r\n${a}${b}`)
        expect(framer.push(all.subarray(0, 20))).toEqual([])
        expect(framer.push(all.subarray(20))).toEqual([a, b])
    })
})

describe('autenticação digest (motor próprio)', () => {
    it('confere com o exemplo da RFC 2617 (MD5 com qop)', () => {
        const challenge = parseChallenge(
            'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"'
        )
        const value = digestAuthorization({
            challenge,
            method: 'GET',
            uri: '/dir/index.html',
            username: 'Mufasa',
            password: 'Circle Of Life',
            cnonce: '0a4f113b'
        })
        expect(value).toContain('response="6629fae49393a05397450978507c4ef1"')
        expect(value).toContain('qop=auth, nc=00000001, cnonce="0a4f113b"')
        expect(value).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"')
    })

    it('confere com o exemplo da RFC 7616 (SHA-256 e MD5)', () => {
        const base = {
            method: 'GET',
            uri: '/dir/index.html',
            username: 'Mufasa',
            password: 'Circle of Life',
            cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ'
        }
        const nonce = '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v'
        const sha = parseChallenge(
            `Digest realm="http-auth@example.org", qop="auth", algorithm=SHA-256, nonce="${nonce}"`
        )
        expect(digestAuthorization({ ...base, challenge: sha })).toContain(
            'response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"'
        )
        const md5 = parseChallenge(`Digest realm="http-auth@example.org", qop="auth", algorithm=MD5, nonce="${nonce}"`)
        expect(digestAuthorization({ ...base, challenge: md5 })).toContain(
            'response="8ca523f5e9506fed4657c9700eebdbec"'
        )
    })

    it('sem qop responde no modo antigo e marca nonce vencido', () => {
        const challenge = parseChallenge('Digest realm="asterisk", nonce="abc", stale=TRUE')
        expect(challenge.stale).toBe(true)
        const value = digestAuthorization({
            challenge,
            method: 'REGISTER',
            uri: 'sip:pbx',
            username: '1001',
            password: '1234'
        })
        expect(value).not.toContain('qop=')
        expect(value).toContain('algorithm=MD5')
    })

    it('recusa algoritmo desconhecido', () => {
        expect(() => parseChallenge('Digest realm="r", nonce="n", algorithm=SHA-512-256')).toThrow(/não suportado/)
    })
})
