import { describe, expect, it } from 'vitest'
import {
    contactsToCsv,
    digits,
    findContact,
    isContact,
    parseContactsCsv,
    searchContacts,
    type Contact
} from '@shared/contacts'
import { applyServer, isSipServer, matchesServer, serverFromAccount, type SipServer } from '@shared/servers'
import { newAccount } from '@renderer/lib/accounts'

const contact = (name: string, number: string, extra: Partial<Contact> = {}): Contact => ({
    id: name,
    name,
    number,
    ...extra
})
const book = [
    contact('Ana Souza', '+55 (11) 4000-1002', { company: 'Matriz' }),
    contact('Bruno', '1003', { favorite: true }),
    contact('Céu Lima', '8000', { notes: 'URA de testes' })
]

describe('agenda de contatos (RF-50)', () => {
    it('compara números só pelos dígitos e aceita o número sem o prefixo', () => {
        expect(digits('+55 (11) 4000-1002')).toBe('+551140001002')
        expect(findContact(book, '+551140001002')?.name).toBe('Ana Souza')
        expect(findContact(book, '40001002')?.name).toBe('Ana Souza')
        expect(findContact(book, '1003')?.name).toBe('Bruno')
        // Um ramal curto não casa com o fim de um número longo qualquer.
        expect(findContact(book, '002')).toBeUndefined()
        expect(findContact(book, '')).toBeUndefined()
    })

    it('busca sem acento e sem maiúscula, em nome, número, empresa e observação, com favoritos primeiro', () => {
        expect(searchContacts(book, '').map((c) => c.name)).toEqual(['Bruno', 'Ana Souza', 'Céu Lima'])
        expect(searchContacts(book, 'ceu').map((c) => c.name)).toEqual(['Céu Lima'])
        expect(searchContacts(book, 'matriz').map((c) => c.name)).toEqual(['Ana Souza'])
        expect(searchContacts(book, 'ura').map((c) => c.name)).toEqual(['Céu Lima'])
        expect(searchContacts(book, '4000').map((c) => c.name)).toEqual(['Ana Souza'])
    })

    it('planilha CSV: ida e volta, com aspas e ponto e vírgula dentro do campo', () => {
        const withQuote = [...book, contact('Fila "Vendas"; noite', '2001')]
        let n = 0
        const { contacts, skipped } = parseContactsCsv(contactsToCsv(withQuote), () => `novo-${n++}`)
        expect(skipped).toBe(0)
        expect(contacts.map((c) => [c.name, c.number, c.company, c.notes, c.favorite])).toEqual(
            withQuote.map((c) => [c.name, c.number, c.company, c.notes, c.favorite])
        )
        expect(contacts[0]!.id).toBe('novo-0')
    })

    it('planilha CSV: aceita outros nomes de coluna e pula linhas sem nome ou número', () => {
        const { contacts, skipped } = parseContactsCsv(
            'Name,Phone,Company\nAna,1002,X\n,1004,\nSem número,,',
            () => 'x'
        )
        expect(contacts).toEqual([
            { id: 'x', name: 'Ana', number: '1002', company: 'X', notes: undefined, favorite: undefined }
        ])
        expect(skipped).toBe(2)
        expect(() => parseContactsCsv('nome;empresa\nAna;X', () => 'x')).toThrow(/colunas nome e numero/)
        expect(() => parseContactsCsv('nome;numero', () => 'x')).toThrow(/pelo menos um contato/)
    })

    it('confere o formato que vem da interface', () => {
        expect(isContact(book[0])).toBe(true)
        expect(isContact({ ...book[0], favorite: 'sim' })).toBe(false)
        expect(isContact({ ...book[0], number: 'x'.repeat(101) })).toBe(false)
        expect(isContact(null)).toBe(false)
    })
})

describe('servidores cadastrados (RF-51)', () => {
    const server: SipServer = {
        id: 's1',
        name: 'Matriz',
        domain: 'pbx.empresa.com',
        transport: 'tls',
        wssUrl: '',
        sipServer: 'pbx.empresa.com:5061',
        iceServers: 'stun:stun.empresa.com',
        preset: 'kamailio',
        srtp: true
    }

    it('copia a conexão do servidor para a conta e mantém ramal, nome e senha da conta', () => {
        const account = newAccount({ name: 'Suporte', extension: '1001', domain: 'antigo', wssUrl: 'wss://antigo/ws' })
        const linked = applyServer(account, server)
        expect(linked).toMatchObject({
            serverId: 's1',
            name: 'Suporte',
            extension: '1001',
            domain: 'pbx.empresa.com',
            transport: 'tls',
            wssUrl: '',
            sipServer: 'pbx.empresa.com:5061',
            iceServers: 'stun:stun.empresa.com',
            preset: 'kamailio',
            srtp: true
        })
        expect(matchesServer(linked, server)).toBe(true)
        expect(matchesServer({ ...linked, domain: 'outro' }, server)).toBe(false)
    })

    it('monta um servidor a partir de uma conta, e WebSocket não leva SRTP nem servidor SIP', () => {
        const account = newAccount({
            domain: 'pbx',
            transport: 'ws',
            wssUrl: 'wss://pbx/ws',
            sipServer: 'lixo',
            srtp: true
        })
        expect(serverFromAccount(account, 'n')).toMatchObject({
            id: 'n',
            name: 'pbx',
            transport: 'ws',
            wssUrl: 'wss://pbx/ws',
            sipServer: '',
            srtp: undefined
        })
        expect(isSipServer(serverFromAccount(account, 'n'))).toBe(true)
        expect(isSipServer({ ...server, transport: 'sctp' })).toBe(false)
        expect(isSipServer({ ...server, preset: 'outro' })).toBe(false)
    })
})
