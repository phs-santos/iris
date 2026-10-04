import { describe, expect, it } from 'vitest'
import { describeStatus, explainRegError, newAccount, normalizeImported, validateAccount } from '@renderer/lib/accounts'
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
