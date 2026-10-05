import { describe, expect, it } from 'vitest'
import {
    addMessage,
    conversations,
    isChatMessage,
    isTextContent,
    messageBytes,
    type ChatMessage
} from '../src/shared/messages'

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
    id: 'm1',
    accountId: 'a1',
    peer: '1002',
    direction: 'in',
    text: 'oi',
    at: 1000,
    ...over
})

describe('mensagens de texto (RF-54)', () => {
    it('junta as mensagens por conta e ramal, com a conversa mais recente primeiro', () => {
        const list = conversations([
            msg({ id: '1', at: 1, unread: true, peerName: 'Vendas' }),
            msg({ id: '2', at: 5, direction: 'out', text: 'tudo bem?' }),
            msg({ id: '3', at: 9, peer: '1003', unread: true }),
            msg({ id: '4', at: 3, accountId: 'a2', unread: true }),
            msg({ id: '5', at: 4, unread: true })
        ])
        expect(list.map((c) => `${c.accountId}/${c.peer}`)).toEqual(['a1/1003', 'a1/1002', 'a2/1002'])
        const vendas = list[1]
        expect(vendas.last.text).toBe('tudo bem?')
        expect(vendas.unread).toBe(2)
        expect(vendas.peerName).toBe('Vendas')
    })

    it('guarda as mais novas e troca a que tem o mesmo id', () => {
        let list: ChatMessage[] = []
        for (let i = 0; i < 5; i++) list = addMessage(list, msg({ id: `m${i}`, at: i }), 3)
        expect(list.map((m) => m.id)).toEqual(['m2', 'm3', 'm4'])
        list = addMessage(list, msg({ id: 'm3', at: 3, failed: '404 Not Found' }), 3)
        expect(list.map((m) => m.id)).toEqual(['m2', 'm4', 'm3'])
        expect(list[2].failed).toBe('404 Not Found')
    })

    it('confere o que vem do arquivo', () => {
        expect(isChatMessage(msg({}))).toBe(true)
        expect(isChatMessage(msg({ unread: true, failed: '480', peerName: 'x' }))).toBe(true)
        expect(isChatMessage({ ...msg({}), direction: 'lado' })).toBe(false)
        expect(isChatMessage({ ...msg({}), text: 'x'.repeat(4001) })).toBe(false)
        expect(isChatMessage({ ...msg({}), at: 'ontem' })).toBe(false)
        expect(isChatMessage(null)).toBe(false)
    })

    it('conta o tamanho em bytes, não em letras', () => {
        expect(messageBytes('abc')).toBe(3)
        expect(messageBytes('ação')).toBe(6)
        expect(messageBytes('👍')).toBe(4)
    })

    it('só texto simples entra na conversa', () => {
        expect(isTextContent(undefined)).toBe(true)
        expect(isTextContent('text/plain')).toBe(true)
        expect(isTextContent('Text/Plain; charset=UTF-8')).toBe(true)
        expect(isTextContent('application/im-iscomposing+xml')).toBe(false)
        expect(isTextContent('text/html')).toBe(false)
    })
})
