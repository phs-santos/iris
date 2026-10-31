import { describe, expect, it } from 'vitest'
import {
    contactsToCsv,
    digits,
    findContact,
    isContact,
    parseContactsCsv,
    searchContacts,
    suggestContacts,
    type Contact
} from '@shared/contacts'
import { applyServer, isSipServer, matchesServer, serverFromAccount, type SipServer } from '@shared/servers'
import { newAccount } from '@renderer/lib/accounts'

const contact = (name: string, number: string, extra: Partial<Contact> = {}): Contact => ({
    id: name,
    name,
    number,
    accountId: 'c1',
    ...extra
})
const book = [
    contact('Ana Souza', '+55 (11) 4000-1002', { notes: 'Matriz' }),
    contact('Bruno', '1003'),
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

    it('busca sem acento e sem maiúscula, em nome, número e observação, em ordem de nome', () => {
        expect(searchContacts(book, '').map((c) => c.name)).toEqual(['Ana Souza', 'Bruno', 'Céu Lima'])
        expect(searchContacts(book, 'ceu').map((c) => c.name)).toEqual(['Céu Lima'])
        expect(searchContacts(book, 'matriz').map((c) => c.name)).toEqual(['Ana Souza'])
        expect(searchContacts(book, 'ura').map((c) => c.name)).toEqual(['Céu Lima'])
        expect(searchContacts(book, '4000').map((c) => c.name)).toEqual(['Ana Souza'])
    })

    it('planilha CSV: ida e volta, com aspas e ponto e vírgula dentro do campo', () => {
        const withQuote = [...book, contact('Fila "Vendas"; noite', '2001')]
        let n = 0
        const { contacts, skipped } = parseContactsCsv(contactsToCsv(withQuote), 'c2', () => `novo-${n++}`)
        expect(skipped).toBe(0)
        expect(contacts.map((c) => [c.name, c.number, c.notes])).toEqual(
            withQuote.map((c) => [c.name, c.number, c.notes])
        )
        expect(contacts[0]!.id).toBe('novo-0')
        expect(contacts.every((c) => c.accountId === 'c2')).toBe(true)
    })

    it('planilha CSV: aceita outros nomes de coluna e pula linhas sem nome ou número', () => {
        const { contacts, skipped } = parseContactsCsv(
            'Name,Phone,Notes\nAna,1002,X\n,1004,\nSem número,,',
            'c1',
            () => 'x'
        )
        expect(contacts).toEqual([{ id: 'x', name: 'Ana', number: '1002', notes: 'X', accountId: 'c1' }])
        expect(skipped).toBe(2)
        expect(() => parseContactsCsv('nome;observacao\nAna;X', 'c1', () => 'x')).toThrow(/colunas nome e numero/)
        expect(() => parseContactsCsv('nome;numero', 'c1', () => 'x')).toThrow(/pelo menos um contato/)
    })

    it('confere o formato que vem da interface', () => {
        expect(isContact(book[0])).toBe(true)
        // O contato sempre pertence a uma conta (esquema 2).
        const { accountId: _sem, ...withoutAccount } = book[0]!
        expect(isContact(withoutAccount)).toBe(false)
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

describe('sugestão de contatos no discador', () => {
    it('sugere só da conta atual', () => {
        const all = [...book, contact('Ana Outra', '1002', { accountId: 'c2' })]
        expect(suggestContacts(all, 'c1', 'ana').map((c) => c.name)).toEqual(['Ana Souza'])
        expect(suggestContacts(all, 'c2', 'ana').map((c) => c.name)).toEqual(['Ana Outra'])
    })

    it('sugere por dígitos e por nome sem acento', () => {
        const people = [contact('João', '2000'), ...book]
        expect(suggestContacts(people, 'c1', 'joao').map((c) => c.name)).toEqual(['João'])
        expect(suggestContacts(people, 'c1', 'ceu').map((c) => c.name)).toEqual(['Céu Lima'])
        expect(suggestContacts(people, 'c1', '4000').map((c) => c.name)).toEqual(['Ana Souza'])
    })

    it('prefixo vem antes de contém', () => {
        const people = [contact('Luana', '1'), contact('Ana', '2'), contact('Anita', '3'), contact('Joana', '4')]
        expect(suggestContacts(people, 'c1', 'an').map((c) => c.name)).toEqual(['Ana', 'Anita', 'Joana', 'Luana'])
        expect(suggestContacts([contact('X', '9001'), contact('Y', '1900')], 'c1', '900').map((c) => c.name)).toEqual([
            'X',
            'Y'
        ])
    })

    it('texto vazio não sugere nada', () => {
        expect(suggestContacts(book, 'c1', '')).toEqual([])
        expect(suggestContacts(book, 'c1', '   ')).toEqual([])
    })

    it('respeita o limite', () => {
        const many = Array.from({ length: 10 }, (_, i) => contact(`Pessoa ${i}`, String(1000 + i)))
        expect(suggestContacts(many, 'c1', 'pessoa')).toHaveLength(6)
        expect(suggestContacts(many, 'c1', 'pessoa', 3)).toHaveLength(3)
    })
})
