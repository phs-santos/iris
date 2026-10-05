import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
    addMessage,
    conversations,
    MESSAGE_MAX_BYTES,
    messageBytes,
    type ChatMessage,
    type Conversation
} from '@shared/messages'
import { notify } from '@renderer/lib/notify'
import { useAccountsStore } from './accounts'
import { useContactsStore } from './contacts'
import { useLogStore } from './log'
import { useToastsStore } from './toasts'
import { usePreferencesStore } from './preferences'

let nextId = 1

/** Conversas por mensagem de texto (SIP MESSAGE, RF-54), guardadas em messages.json. */
export const useMessagesStore = defineStore('messages', () => {
    const messages = ref<ChatMessage[]>([])
    /** Conversa aberta na tela; null com a lista sem nada escolhido. */
    const open = ref<{ accountId: string; peer: string } | null>(null)
    /** A aba Mensagens está na tela: o que chega na conversa aberta já conta como lido. */
    const visible = ref(false)

    const list = computed<Conversation[]>(() => conversations(messages.value))
    const unread = computed(() => messages.value.filter((m) => m.unread).length)
    const thread = computed(() => {
        const at = open.value
        return at ? messages.value.filter((m) => m.accountId === at.accountId && m.peer === at.peer) : []
    })

    async function load(): Promise<void> {
        messages.value = await window.iris.messages.load()
    }

    function persist(): void {
        // Nos testes de unidade não há processo principal para gravar.
        void window.iris.messages?.save(JSON.parse(JSON.stringify(messages.value))).catch(() => undefined)
    }

    const newId = (): string => `${Date.now()}-${nextId++}`
    const watching = (accountId: string, peer: string): boolean =>
        visible.value && open.value?.accountId === accountId && open.value.peer === peer

    function receive(accountId: string, from: string, text: string, fromName?: string): void {
        // Com o modo Mensagens desligado, o que chega é respondido pelo motor e ignorado aqui.
        if (!usePreferencesStore().isOn('messages')) return
        const accounts = useAccountsStore()
        const peerName = fromName || useContactsStore().nameOf(from)
        const seen = watching(accountId, from)
        messages.value = addMessage(messages.value, {
            id: newId(),
            accountId,
            peer: from,
            peerName,
            direction: 'in',
            text,
            at: Date.now(),
            unread: seen ? undefined : true
        })
        persist()
        const who = peerName ? `${peerName} (${from})` : from
        useLogStore().add(accountId, 'info', 'event', `Mensagem de ${who}: ${text}`)
        if (seen) return
        notify('message', `Mensagem de ${who}`, text.slice(0, 200))
        useToastsStore().show(`${accounts.nameOf(accountId)} · mensagem de ${who}`, 'info')
    }

    /** Manda a mensagem e guarda na conversa; se o PBX recusar, ela fica marcada com o motivo. */
    async function send(accountId: string, peer: string, text: string): Promise<void> {
        const accounts = useAccountsStore()
        const body = text.trim()
        const to = peer.trim()
        if (!body || !to) return
        if (messageBytes(body) > MESSAGE_MAX_BYTES) throw new Error('A mensagem é grande demais para um SIP MESSAGE')
        const engine = accounts.engineOf(accountId)
        if (!engine || accounts.statusOf(accountId).state !== 'registered')
            throw new Error('Registre a conta antes de mandar mensagem')
        const message: ChatMessage = {
            id: newId(),
            accountId,
            peer: to,
            peerName: useContactsStore().nameOf(to),
            direction: 'out',
            text: body,
            at: Date.now()
        }
        messages.value = addMessage(messages.value, message)
        try {
            await engine.sendMessage(to, body)
            useLogStore().add(accountId, 'info', 'event', `Mensagem para ${to}: ${body}`)
        } catch (error) {
            const reason = (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
            messages.value = addMessage(messages.value, { ...message, failed: reason })
            useLogStore().add(accountId, 'warn', 'event', `Mensagem para ${to} não foi entregue: ${reason}`)
        }
        persist()
    }

    function show(accountId: string, peer: string): void {
        open.value = { accountId, peer }
        markRead()
    }

    /** O que está na conversa aberta deixa de contar como não lido. */
    function markRead(): void {
        const at = open.value
        if (!at || !messages.value.some((m) => m.unread && m.accountId === at.accountId && m.peer === at.peer)) return
        messages.value = messages.value.map((m) =>
            m.unread && m.accountId === at.accountId && m.peer === at.peer ? { ...m, unread: undefined } : m
        )
        persist()
    }

    function remove(accountId: string, peer: string): void {
        messages.value = messages.value.filter((m) => m.accountId !== accountId || m.peer !== peer)
        if (open.value?.accountId === accountId && open.value.peer === peer) open.value = null
        persist()
    }

    return { messages, open, visible, list, unread, thread, load, receive, send, show, markRead, remove }
})
