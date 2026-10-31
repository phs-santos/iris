import { describe, expect, it } from 'vitest'
import {
    describeStatus,
    explainRegError,
    newAccount,
    normalizeImported,
    parseAccountsCsv,
    validateAccount
} from '@renderer/lib/accounts'
import { serversWithSimulated, SIMULATED_SERVER_ID, type SipServer } from '@shared/servers'
import { matches, type LogEntry } from '@renderer/stores/log'
import { describeSipError } from '@renderer/sip/engine'

describe('validateAccount', () => {
    it('pede os campos obrigatórios de uma conta real', () => {
        const errors = validateAccount(newAccount({ wssUrl: 'http://x' }), '')
        expect(Object.keys(errors).sort()).toEqual(['domain', 'extension', 'name', 'password', 'wssUrl'])
    })

    it('não exige WSS em conta simulada, mas exige a senha', () => {
        const account = newAccount({ name: 'a', extension: '1', domain: 'd', serverId: SIMULATED_SERVER_ID })
        expect(validateAccount(account, '1234')).toEqual({})
        expect(Object.keys(validateAccount(account, ''))).toEqual(['password'])
    })
})

describe('normalizeImported', () => {
    it('separa a senha e completa campos que faltam', () => {
        const [item] = normalizeImported({
            format: 'iris/accounts',
            schemaVersion: 2,
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

    it('recusa exportações das versões antigas (esquema 1), que não são migradas', () => {
        expect(() =>
            normalizeImported({ format: 'iris/accounts', schemaVersion: 1, exportedAt: '', accounts: [] })
        ).toThrow(/não é uma exportação/)
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
    it('linha sem conta (do app) aparece com qualquer filtro de conta', () => {
        const app: LogEntry = { ...entry, accountId: null, text: 'Microfone: padrão' }
        expect(matches(app, { accountId: 'b', kind: 'all', minLevel: 'debug', text: '' })).toBe(true)
    })
})

describe('contas em lote por CSV (RF-48)', () => {
    const udp: SipServer = {
        id: 'srv-udp',
        name: 'PBX Matriz',
        domain: 'pbx.empresa.com',
        transport: 'udp',
        wssUrl: '',
        sipServer: '10.0.0.5:5060',
        iceServers: '',
        preset: 'asterisk',
        dtmfMode: 'sip-info'
    }
    const ws: SipServer = {
        ...udp,
        id: 'srv-ws',
        name: 'Nuvem',
        domain: 'nuvem.com',
        transport: 'ws',
        wssUrl: 'wss://nuvem.com/ws',
        sipServer: ''
    }
    const servers = serversWithSimulated([udp, ws])

    it('liga cada conta ao servidor, pelo nome ou pelo domínio, com ; , ou tabulação', () => {
        const csv = [
            'Nome;Ramal;Servidor;Senha',
            'Suporte;1001;pbx matriz;segredo',
            '"Fila; vendas";2001;NUVEM.com;"se""nha"'
        ].join('\r\n')
        const [pure, web] = parseAccountsCsv(`\uFEFF${csv}`, servers)
        expect(pure).toMatchObject({
            password: 'segredo',
            account: {
                name: 'Suporte',
                serverId: 'srv-udp',
                domain: 'pbx.empresa.com',
                transport: 'udp',
                sipServer: '10.0.0.5:5060',
                dtmfMode: 'sip-info'
            }
        })
        expect(web).toMatchObject({
            password: 'se"nha',
            account: { name: 'Fila; vendas', serverId: 'srv-ws', transport: 'ws', wssUrl: 'wss://nuvem.com/ws' }
        })
        expect(pure!.account.id).not.toBe(web!.account.id)

        const comma = parseAccountsCsv('name,extension,server,password\nA,2002,PBX simulado,1234', servers)
        expect(comma[0]!.account.serverId).toBe(SIMULATED_SERVER_ID)
        const tab = parseAccountsCsv('nome\tramal\tservidor\tsenha\nB\t2003\tPBX Matriz\t1234', servers)
        expect(tab[0]!.account.transport).toBe('udp')
    })

    it('para no primeiro erro e diz a linha', () => {
        expect(() => parseAccountsCsv('nome;ramal;servidor', servers)).toThrow(/pelo menos uma conta/)
        expect(() => parseAccountsCsv('nome;ramal;dominio;senha\nA;1;pbx;1', servers)).toThrow(/nome, ramal, servidor/)
        expect(() => parseAccountsCsv('nome;ramal;servidor;senha\nA;1;Nuvem;1\nB;2;outro;1', servers)).toThrow(
            /^Linha 3: servidor "outro" não está cadastrado/
        )
        expect(() => parseAccountsCsv('nome;ramal;servidor;senha\nA;1;PBX Matriz;', servers)).toThrow(
            'Linha 2: Informe a senha do ramal'
        )
    })

    it('domínio repetido em dois servidores não escolhe sozinho', () => {
        const twin = { ...udp, id: 'srv-2', name: 'Outro' }
        expect(() => parseAccountsCsv('nome;ramal;servidor;senha\nA;1;pbx.empresa.com;1', [udp, twin])).toThrow(
            /Linha 2: servidor/
        )
    })
})
