import { describe, expect, it } from 'vitest'
import {
    describeStatus,
    explainRegError,
    newAccount,
    normalizeImported,
    parseAccountsCsv,
    validateAccount
} from '@renderer/lib/accounts'
import { matches, type LogEntry } from '@renderer/stores/log'
import { describeSipError } from '@renderer/sip/engine'

describe('validateAccount', () => {
    it('pede os campos obrigatórios de uma conta real', () => {
        const errors = validateAccount(newAccount({ wssUrl: 'http://x' }), '')
        expect(Object.keys(errors).sort()).toEqual(['domain', 'extension', 'name', 'password', 'wssUrl'])
    })

    it('não exige WSS nem senha em conta simulada', () => {
        const errors = validateAccount(newAccount({ name: 'a', extension: '1', domain: 'd', simulated: true }), '')
        expect(errors).toEqual({})
    })
})

describe('normalizeImported', () => {
    it('separa a senha e completa campos que faltam', () => {
        const [item] = normalizeImported({
            format: 'iris/accounts',
            schemaVersion: 1,
            exportedAt: '',
            accounts: [{ id: 'x', name: 'A', extension: '1', domain: 'd', password: 's3' }]
        })
        expect(item.password).toBe('s3')
        expect(item.account).not.toHaveProperty('password')
        expect(item.account.dtmfMode).toBe('auto')
        expect(item.account.id).toBe('x')
    })

    it('recusa arquivos que não são exportação da Íris', () => {
        expect(() => normalizeImported({ accounts: [] })).toThrow(/não é uma exportação/)
    })
})

describe('describeStatus e describeSipError', () => {
    it('mostra código e frase do erro de registro', () => {
        expect(describeStatus({ state: 'error', code: 403, reason: 'Forbidden' })).toBe('403 Forbidden')
        expect(describeStatus({ state: 'registered' })).toBe('registrada')
    })

    it('lê a resposta do SIP.js', () => {
        expect(describeSipError({ message: { statusCode: 401, reasonPhrase: 'Unauthorized' } })).toEqual({
            code: 401,
            reason: 'Unauthorized'
        })
        expect(describeSipError(new Error('WebSocket closed'))).toEqual({ code: undefined, reason: 'WebSocket closed' })
    })
})

describe('explainRegError', () => {
    it('só explica quando há erro', () => {
        expect(explainRegError({ state: 'registered' })).toBeNull()
    })

    it('traduz os códigos mais comuns', () => {
        expect(explainRegError({ state: 'error', code: 403, reason: 'Forbidden' })?.title).toBe('O PBX recusou o login')
        expect(explainRegError({ state: 'error', code: 401, reason: 'Unauthorized' })?.title).toMatch(/senha/)
        expect(explainRegError({ state: 'error', code: 404 })?.title).toMatch(/não existe/)
    })

    it('reconhece falha de conexão do WebSocket', () => {
        expect(explainRegError({ state: 'error', code: 1006, reason: 'WebSocket closed' })?.title).toBe(
            'Não conectou ao PBX'
        )
        expect(explainRegError({ state: 'error', reason: 'Falha ao conectar no WebSocket' })?.title).toBe(
            'Não conectou ao PBX'
        )
    })

    it('tem uma explicação genérica para o resto', () => {
        expect(explainRegError({ state: 'error', code: 500, reason: 'Server Error' })?.title).toBe('O registro falhou')
    })
})

describe('filtro do log', () => {
    const entry: LogEntry = { id: 1, ts: 0, accountId: 'a', level: 'info', kind: 'event', text: 'REGISTER 200 OK' }
    it('combina conta, tipo, nível e texto', () => {
        expect(matches(entry, { accountId: 'a', kind: 'event', minLevel: 'debug', text: 'register' })).toBe(true)
        expect(matches(entry, { accountId: 'b', kind: 'all', minLevel: 'debug', text: '' })).toBe(false)
        expect(matches(entry, { accountId: null, kind: 'sip', minLevel: 'debug', text: '' })).toBe(false)
        expect(matches(entry, { accountId: null, kind: 'all', minLevel: 'warn', text: '' })).toBe(false)
    })
})

describe('contas em lote por CSV (RF-48)', () => {
    it('cria contas de WebSocket e de SIP puro, com ponto e vírgula, vírgula ou tabulação', () => {
        const csv = [
            'Nome;Ramal;Domínio;Senha;Transporte;Endereço;Auto-atender;SRTP',
            'Suporte 1001;1001;pbx.empresa.com;segredo;;wss://pbx.empresa.com:8089/ws;sim;',
            '"Fila; vendas";2001;10.0.0.5;"se""nha";TLS;10.0.0.5:5061;;sim'
        ].join('\r\n')
        const [web, pure] = parseAccountsCsv(`\uFEFF${csv}`)
        expect(web).toMatchObject({
            password: 'segredo',
            account: {
                name: 'Suporte 1001',
                extension: '1001',
                domain: 'pbx.empresa.com',
                transport: 'ws',
                wssUrl: 'wss://pbx.empresa.com:8089/ws',
                autoAnswer: { enabled: true }
            }
        })
        expect(pure).toMatchObject({
            password: 'se"nha',
            account: { name: 'Fila; vendas', transport: 'tls', sipServer: '10.0.0.5:5061', wssUrl: '', srtp: true }
        })
        expect(web!.account.id).not.toBe(pure!.account.id)

        const comma = parseAccountsCsv('name,extension,domain,password,transport\nA,2002,pbx.teste,1234,udp')
        expect(comma[0]!.account).toMatchObject({ extension: '2002', transport: 'udp', sipServer: '' })
        const tab = parseAccountsCsv('nome\tramal\tdominio\tsenha\ttransporte\nB\t2003\tpbx.teste\t1234\ttcp')
        expect(tab[0]!.account.transport).toBe('tcp')
    })

    it('para no primeiro erro e diz a linha', () => {
        expect(() => parseAccountsCsv('nome;ramal;dominio')).toThrow(/pelo menos uma conta/)
        expect(() => parseAccountsCsv('nome;senha\nA;1')).toThrow(/colunas nome, ramal e dominio/)
        expect(() => parseAccountsCsv('nome;ramal;dominio;senha;transporte\nA;1;pbx;1;udp\nB;2;pbx;1;sctp')).toThrow(
            'Linha 3: transporte "sctp" desconhecido; use ws, udp, tcp ou tls'
        )
        expect(() => parseAccountsCsv('nome;ramal;dominio;senha;transporte\nA;1;pbx;;udp')).toThrow(
            'Linha 2: Informe a senha do ramal'
        )
        expect(() => parseAccountsCsv('nome;ramal;dominio;senha\nA;1;pbx;1')).toThrow(
            /Linha 2: Use um endereço como wss/
        )
    })
})
