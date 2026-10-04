<script setup lang="ts">
import { computed, ref } from 'vue'
import { searchContacts, type Contact } from '@shared/contacts'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { t } from '@renderer/i18n'
import ContactForm from './ContactForm.vue'

/** Agenda de contatos (RF-50): busca, favoritos e ligar com um clique. */
const emit = defineEmits<{ dialed: [] }>()
const contacts = useContactsStore()
const accounts = useAccountsStore()
const calls = useCallsStore()
const query = ref('')
const editing = ref<Contact | null>(null)
const confirmDelete = ref<string | null>(null)
const message = ref<{ ok: boolean; text: string } | null>(null)

const list = computed(() => searchContacts(contacts.contacts, query.value))

/** A conta preferida do contato, se estiver registrada; senão, a escolhida no discador. */
function fromAccount(contact: Contact): string | null {
    const own = contact.accountId
    if (own && accounts.statusOf(own).state === 'registered') return own
    const selected = accounts.selectedId
    return selected && accounts.statusOf(selected).state === 'registered' ? selected : null
}

async function call(contact: Contact): Promise<void> {
    const from = fromAccount(contact)
    if (!from) return
    accounts.selectedId = from
    emit('dialed')
    await calls.dial(from, contact.number).catch(() => undefined)
}

function create(): void {
    editing.value = { id: crypto.randomUUID(), name: query.value.trim(), number: '' }
}

async function importCsv(): Promise<void> {
    const text = await window.iris.files.openText('csv')
    if (text === null) return
    try {
        const r = await contacts.importCsv(text)
        message.value = { ok: true, text: t('contactsPane.importados', r) }
    } catch (error) {
        message.value = { ok: false, text: (error as Error).message }
    }
}

async function exportCsv(): Promise<void> {
    const path = await window.iris.files.saveText('iris-contatos.csv', contacts.exportCsv())
    if (path) message.value = { ok: true, text: t('contactsPane.exportados', { path }) }
}

async function remove(id: string): Promise<void> {
    await contacts.remove(id)
    confirmDelete.value = null
}
</script>

<template>
    <div class="contacts">
        <div class="head">
            <input
                v-model="query"
                class="input search"
                type="search"
                :placeholder="$t('contactsPane.buscar')"
                :aria-label="$t('contactsPane.buscar')"
            />
            <button class="btn small primary" @click="create">{{ $t('contactsPane.novo') }}</button>
            <button class="btn small" @click="importCsv">{{ $t('contactsPane.importar') }}</button>
            <button class="btn small" :disabled="!contacts.contacts.length" @click="exportCsv">
                {{ $t('contactsPane.exportar') }}
            </button>
        </div>
        <p v-if="message" class="message" :class="message.ok ? 'ok' : 'bad'" role="status">{{ message.text }}</p>
        <p v-if="contacts.contacts.length === 0" class="empty">{{ $t('contactsPane.vazio') }}</p>
        <p v-else-if="list.length === 0" class="empty">{{ $t('contactsPane.nada', { query }) }}</p>
        <ul v-else class="list">
            <li v-for="c in list" :key="c.id" class="contact">
                <button
                    class="star"
                    :class="{ on: c.favorite }"
                    :aria-pressed="Boolean(c.favorite)"
                    :aria-label="$t('contactsPane.favorito_de', { name: c.name })"
                    @click="contacts.toggleFavorite(c.id)"
                >
                    ★
                </button>
                <span class="who">
                    <b>{{ c.name }}</b>
                    <small class="mono"
                        >{{ c.number }}<template v-if="c.company"> · {{ c.company }}</template></small
                    >
                    <small v-if="c.notes" class="notes">{{ c.notes }}</small>
                </span>
                <span class="actions">
                    <template v-if="confirmDelete === c.id">
                        <button class="btn small stop" @click="remove(c.id)">{{ $t('contactsPane.confirmar') }}</button>
                        <button class="btn small" @click="confirmDelete = null">
                            {{ $t('contactsPane.cancelar') }}
                        </button>
                    </template>
                    <template v-else>
                        <button
                            class="btn small go"
                            :disabled="!fromAccount(c)"
                            :title="fromAccount(c) ? '' : $t('contactsPane.registre')"
                            :aria-label="$t('contactsPane.ligar_para', { name: c.name })"
                            @click="call(c)"
                        >
                            {{ $t('contactsPane.ligar') }}
                        </button>
                        <button
                            class="btn small"
                            :aria-label="$t('contactsPane.editar_nome', { name: c.name })"
                            @click="editing = c"
                        >
                            {{ $t('contactsPane.editar') }}
                        </button>
                        <button
                            class="btn small"
                            :aria-label="$t('contactsPane.excluir_nome', { name: c.name })"
                            @click="confirmDelete = c.id"
                        >
                            {{ $t('contactsPane.excluir') }}
                        </button>
                    </template>
                </span>
            </li>
        </ul>
        <ContactForm v-if="editing" :contact="editing" @close="editing = null" />
    </div>
</template>

<style scoped>
.contacts {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
.star {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    padding: 2px 4px;
}
.star.on {
    color: var(--warn);
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
