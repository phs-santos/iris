<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '@renderer/i18n'
import { MESSAGE_MAX_BYTES, messageBytes, type ChatMessage, type Conversation } from '@shared/messages'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { useMessagesStore } from '@renderer/stores/messages'

/** Mensagens de texto entre ramais (SIP MESSAGE, RF-54): conversas à esquerda, a escolhida à direita. */
const emit = defineEmits<{ dialed: [] }>()
const accounts = useAccountsStore()
const calls = useCallsStore()
const contacts = useContactsStore()
const store = useMessagesStore()

const newPeer = ref('')
const draft = ref('')
const error = ref('')
const sending = ref(false)
const confirming = ref(false)
const threadEl = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)

const current = computed(() => store.open)
const account = computed(() => (current.value ? accounts.byId(current.value.accountId) : undefined))
const registered = computed(() =>
    current.value ? accounts.statusOf(current.value.accountId).state === 'registered' : false
)
const peerName = computed(() => {
    const at = current.value
    if (!at) return ''
    return (
        contacts.nameOf(at.peer) ?? store.list.find((c) => c.accountId === at.accountId && c.peer === at.peer)?.peerName
    )
})
const bytes = computed(() => messageBytes(draft.value.trim()))
const tooLong = computed(() => bytes.value > MESSAGE_MAX_BYTES)

const nameOf = (c: Conversation): string => contacts.nameOf(c.peer) ?? c.peerName ?? c.peer
const time = (message: ChatMessage): string =>
    new Date(message.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
const isOpen = (c: Conversation): boolean => current.value?.accountId === c.accountId && current.value.peer === c.peer

/** Nova conversa com o número digitado, pela conta escolhida no discador. */
function start(): void {
    const peer = newPeer.value.trim()
    const from = accounts.selected
    error.value = ''
    if (!peer) return
    if (!from) return void (error.value = t('messagesPane.sem_conta'))
    if (!/^[A-Za-z0-9+*#._-]+$/.test(peer)) return void (error.value = t('messagesPane.numero_invalido'))
    store.show(from.id, peer)
    newPeer.value = ''
    void nextTick(() => composer.value?.focus())
}

async function send(): Promise<void> {
    const at = current.value
    if (!at || !draft.value.trim() || tooLong.value || sending.value) return
    error.value = ''
    sending.value = true
    try {
        await store.send(at.accountId, at.peer, draft.value)
        draft.value = ''
    } catch (cause) {
        error.value = (cause as Error).message
    } finally {
        sending.value = false
        void nextTick(() => composer.value?.focus())
    }
}

/** Enter manda; Shift+Enter quebra a linha. */
function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    void send()
}

async function call(): Promise<void> {
    const at = current.value
    if (!at) return
    accounts.selectedId = at.accountId
    emit('dialed')
    await calls.dial(at.accountId, at.peer).catch(() => undefined)
}

function remove(): void {
    const at = current.value
    if (at) store.remove(at.accountId, at.peer)
    confirming.value = false
}

// A conversa aberta acompanha a última mensagem, e o que chega nela já conta como lido.
watch(
    () => store.thread.length,
    () => {
        store.markRead()
        void nextTick(() => threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight }))
    },
    { immediate: true }
)
// O erro vale até a pessoa mexer de novo no texto.
watch([draft, newPeer], () => (error.value = ''))
watch(current, () => {
    confirming.value = false
    error.value = ''
})
onMounted(() => {
    store.visible = true
    store.markRead()
})
onUnmounted(() => (store.visible = false))
</script>

<template>
    <div class="messages">
        <aside class="side">
            <form class="new" @submit.prevent="start">
                <input
                    v-model="newPeer"
                    class="input mono"
                    list="message-contacts"
                    :placeholder="$t('messagesPane.ramal')"
                    :aria-label="$t('messagesPane.nova_conversa_com')"
                />
                <datalist id="message-contacts">
                    <option v-for="c in contacts.contacts" :key="c.id" :value="c.number">{{ c.name }}</option>
                </datalist>
                <button class="btn small" type="submit">{{ $t('messagesPane.nova') }}</button>
            </form>
            <p v-if="store.list.length === 0" class="empty">{{ $t('messagesPane.vazio') }}</p>
            <ul v-else class="list" :aria-label="$t('messagesPane.conversas')">
                <li v-for="c in store.list" :key="`${c.accountId} ${c.peer}`">
                    <button
                        class="conv"
                        :class="{ on: isOpen(c) }"
                        :aria-current="isOpen(c) ? 'true' : undefined"
                        @click="store.show(c.accountId, c.peer)"
                    >
                        <span class="who">
                            <b>{{ nameOf(c) }}</b>
                            <span v-if="c.unread" class="badge tabular">
                                {{ c.unread }}<span class="sr-only">{{ $t('messagesPane.nao_lidas') }}</span>
                            </span>
                        </span>
                        <small class="mono">{{ c.peer }} · {{ accounts.nameOf(c.accountId) }}</small>
                        <small class="preview">{{ c.last.direction === 'out' ? '→ ' : '' }}{{ c.last.text }}</small>
                    </button>
                </li>
            </ul>
        </aside>

        <section
            v-if="current"
            class="chat"
            :aria-label="$t('messagesPane.conversa_com', { name: peerName || current.peer })"
        >
            <header class="chat-head">
                <span class="who">
                    <b>{{ peerName || current.peer }}</b>
                    <small class="mono">
                        {{ current.peer }} · {{ account?.name ?? $t('messagesPane.conta_apagada') }}
                    </small>
                </span>
                <button class="btn small" :disabled="!registered" @click="call">{{ $t('messagesPane.ligar') }}</button>
                <button v-if="!confirming" class="btn small ghost" @click="confirming = true">
                    {{ $t('messagesPane.apagar') }}
                </button>
                <template v-else>
                    <button class="btn small stop" @click="remove">{{ $t('messagesPane.confirmar_apagar') }}</button>
                    <button class="btn small" @click="confirming = false">{{ $t('messagesPane.cancelar') }}</button>
                </template>
            </header>
            <!-- tabindex: a lista rola, então precisa ser alcançável pelo teclado (RNF-12). -->
            <div ref="threadEl" class="thread" role="log" aria-live="polite" tabindex="0">
                <p v-if="store.thread.length === 0" class="empty">{{ $t('messagesPane.primeira_mensagem') }}</p>
                <div v-for="m in store.thread" :key="m.id" class="bubble" :class="[m.direction, { failed: m.failed }]">
                    <span class="sr-only">
                        {{ m.direction === 'out' ? $t('messagesPane.voce') : peerName || current.peer }}:
                    </span>
                    <span class="text">{{ m.text }}</span>
                    <small>
                        {{ time(m) }}
                        <template v-if="m.failed">
                            · {{ $t('messagesPane.nao_entregue', { reason: m.failed }) }}</template
                        >
                    </small>
                </div>
            </div>
            <form class="compose" @submit.prevent="send">
                <textarea
                    ref="composer"
                    v-model="draft"
                    class="input"
                    rows="2"
                    :placeholder="$t('messagesPane.escreva')"
                    :aria-label="$t('messagesPane.mensagem')"
                    :disabled="!registered"
                    @keydown="onKey"
                ></textarea>
                <button
                    class="btn primary"
                    type="submit"
                    :disabled="!registered || !draft.trim() || tooLong || sending"
                >
                    {{ $t('messagesPane.enviar') }}
                </button>
            </form>
            <p v-if="error" class="hint bad" role="alert">{{ error }}</p>
            <p v-else-if="!registered" class="hint">{{ $t('messagesPane.registre_antes') }}</p>
            <p v-else-if="tooLong" class="hint bad" role="alert">
                {{ $t('messagesPane.grande_demais', { bytes, max: MESSAGE_MAX_BYTES }) }}
            </p>
        </section>
        <section v-else class="chat none">
            <p class="empty">{{ $t('messagesPane.escolha') }}</p>
            <p v-if="error" class="hint bad" role="alert">{{ error }}</p>
        </section>
    </div>
</template>

<style scoped>
.messages {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
}
.side {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line);
}
.new {
    display: flex;
    gap: 6px;
    padding: 10px;
}
.new .input {
    flex: 1;
    min-width: 0;
}
.list {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 0 6px 10px;
    list-style: none;
}
.conv {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
    padding: 7px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
}
.conv:hover,
.conv.on {
    background: var(--raise);
}
.who {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.chat-head .who {
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
}
small {
    color: var(--muted);
    font-size: 11px;
}
.preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.badge {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--accent-strong);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
}
.chat {
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.chat.none {
    justify-content: center;
    align-items: center;
}
.chat-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
}
.thread {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
}
.bubble {
    max-width: 78%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--raise);
    align-self: flex-start;
}
.bubble.out {
    align-self: flex-end;
    background: color-mix(in srgb, var(--accent) 22%, var(--panel));
}
/* A hora sobre o fundo do balão: o cinza de sempre não dá contraste AA ali. */
.bubble small {
    color: color-mix(in srgb, var(--fg) 78%, var(--raise));
}
.bubble.failed {
    outline: 1px solid var(--bad);
}
.bubble.failed small {
    color: var(--bad-text);
}
.text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.compose {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding: 8px 12px;
    border-top: 1px solid var(--line);
}
.compose textarea {
    flex: 1;
    resize: none;
    font-family: inherit;
}
.hint {
    margin: 0 12px 8px;
    color: var(--muted);
    font-size: 12px;
}
.bad {
    color: var(--bad-text);
}
.empty {
    color: var(--muted);
    margin: 8px 12px;
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
}
</style>
