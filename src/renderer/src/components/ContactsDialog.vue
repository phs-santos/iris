<script setup lang="ts">
import { computed, ref } from 'vue'
import { searchContacts, type Contact } from '@shared/contacts'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { useDialog } from '@renderer/lib/dialog'
import { t } from '@renderer/i18n'
import ContactForm from './ContactForm.vue'
import Icon from './icons/Icon.vue'

/** Contatos de uma conta (RF-50), aberto pelo clique direito da conta no seletor. */
const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
const contacts = useContactsStore()
const accounts = useAccountsStore()
const calls = useCallsStore()
const query = ref('')
const editing = ref<Contact | null>(null)
const confirmDelete = ref<string | null>(null)
const message = ref<{ ok: boolean; text: string } | null>(null)
// Com o formulário do contato aberto, o Esc fecha só o formulário.
useDialog(dialogEl, () => editing.value || emit('close'))

const account = computed(() => accounts.byId(props.accountId))
const own = computed(() => contacts.contacts.filter((c) => c.accountId === props.accountId))
const list = computed(() => searchContacts(own.value, query.value))
const registered = computed(() => accounts.statusOf(props.accountId).state === 'registered')

async function call(contact: Contact): Promise<void> {
    if (!registered.value) return
    accounts.setCurrent(props.accountId)
    emit('close')
    await calls.dial(props.accountId, contact.number).catch(() => undefined)
}

function create(): void {
    editing.value = { id: crypto.randomUUID(), name: query.value.trim(), number: '', accountId: props.accountId }
}

async function importCsv(): Promise<void> {
    const text = await window.iris.files.openText('csv')
    if (text === null) return
    try {
        const r = await contacts.importCsv(text, props.accountId)
        message.value = { ok: true, text: t('contactsDialog.importados', r) }
    } catch (error) {
        message.value = { ok: false, text: (error as Error).message }
    }
}

async function exportCsv(): Promise<void> {
    const path = await window.iris.files.saveText('iris-contatos.csv', contacts.exportCsv())
    if (path) message.value = { ok: true, text: t('contactsDialog.exportados', { path }) }
}

async function remove(id: string): Promise<void> {
    await contacts.remove(id)
    confirmDelete.value = null
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <div
            ref="dialogEl"
            class="dialog contacts"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-title"
            tabindex="-1"
        >
            <header>
                <h2 id="contacts-title">{{ $t('contactsDialog.titulo', { name: account?.name ?? '' }) }}</h2>
                <button class="btn small ghost" :aria-label="$t('contactsDialog.fechar')" @click="emit('close')">
                    <Icon name="close" />
                </button>
            </header>
            <div class="head">
                <input
                    v-model="query"
                    class="input search"
                    type="search"
                    :placeholder="$t('contactsDialog.buscar')"
                    :aria-label="$t('contactsDialog.buscar')"
                />
                <button class="btn small primary" @click="create">{{ $t('contactsDialog.novo') }}</button>
                <button class="btn small" @click="importCsv">{{ $t('contactsDialog.importar') }}</button>
                <button class="btn small" :disabled="!contacts.contacts.length" @click="exportCsv">
                    {{ $t('contactsDialog.exportar') }}
                </button>
            </div>
            <p v-if="message" class="message" :class="message.ok ? 'ok' : 'bad'" role="status">{{ message.text }}</p>
            <p v-if="own.length === 0" class="empty">{{ $t('contactsDialog.vazio') }}</p>
            <p v-else-if="list.length === 0" class="empty">{{ $t('contactsDialog.nada', { query }) }}</p>
            <ul v-else class="list">
                <li v-for="c in list" :key="c.id" class="contact">
                    <span class="who">
                        <b>{{ c.name }}</b>
                        <small class="mono">{{ c.number }}</small>
                        <small v-if="c.notes" class="notes">{{ c.notes }}</small>
                    </span>
                    <span class="actions">
                        <template v-if="confirmDelete === c.id">
                            <button class="btn small stop" @click="remove(c.id)">
                                {{ $t('contactsDialog.confirmar') }}
                            </button>
                            <button class="btn small" @click="confirmDelete = null">
                                {{ $t('contactsDialog.cancelar') }}
                            </button>
                        </template>
                        <template v-else>
                            <button
                                class="btn small go"
                                :disabled="!registered"
                                :title="registered ? '' : $t('contactsDialog.registre')"
                                :aria-label="$t('contactsDialog.ligar_para', { name: c.name })"
                                @click="call(c)"
                            >
                                {{ $t('contactsDialog.ligar') }}
                            </button>
                            <button
                                class="btn small"
                                :aria-label="$t('contactsDialog.editar_nome', { name: c.name })"
                                @click="editing = c"
                            >
                                {{ $t('contactsDialog.editar') }}
                            </button>
                            <button
                                class="btn small"
                                :aria-label="$t('contactsDialog.excluir_nome', { name: c.name })"
                                @click="confirmDelete = c.id"
                            >
                                {{ $t('contactsDialog.excluir') }}
                            </button>
                        </template>
                    </span>
                </li>
            </ul>
            <ContactForm v-if="editing" :contact="editing" @close="editing = null" />
        </div>
    </div>
</template>

<style scoped>
.contacts {
    width: min(620px, 100%);
    height: min(560px, 100%);
}
.head {
    display: flex;
    gap: 8px;
    padding: 10px 14px 6px;
}
.search {
    flex: 1;
    min-width: 0;
}
.message {
    margin: 0 14px 6px;
}
.ok {
    color: var(--ok);
}
.bad {
    color: var(--bad);
}
.empty {
    color: var(--muted);
    margin: 8px 14px;
}
.list {
    flex: 1;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: 0 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.contact {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
}
.who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.35;
}
.who small {
    color: var(--muted);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.actions {
    display: flex;
    gap: 6px;
}
</style>
