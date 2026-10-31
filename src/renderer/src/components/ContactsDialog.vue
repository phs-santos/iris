<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { digits, searchContacts, type Contact } from '@shared/contacts'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore } from '@renderer/stores/calls'
import { useContactsStore } from '@renderer/stores/contacts'
import { useToastsStore } from '@renderer/stores/toasts'
import { useDialog } from '@renderer/lib/dialog'
import { t } from '@renderer/i18n'
import Icon from './icons/Icon.vue'

/**
 * Contatos de uma conta (RF-50): lista, criar, editar e apagar. Abre pelo menu da conta no seletor e pelo
 * "+ Salvar como contato" do discador ou de uma chamada, que já trazem o número (ou o nome) digitado.
 */
const props = defineProps<{ accountId: string; prefill?: string }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const contacts = useContactsStore()
const accounts = useAccountsStore()
const calls = useCallsStore()
const query = ref('')
const confirmDelete = ref<string | null>(null)
const message = ref<{ ok: boolean; text: string } | null>(null)

/** Contato aberto no formulário (novo ou existente); null com o formulário fechado. */
const form = reactive<{ open: boolean; isNew: boolean; tried: boolean; contact: Contact }>({
    open: false,
    isNew: true,
    tried: false,
    contact: { id: '', name: '', number: '', accountId: props.accountId }
})
// Com o formulário aberto, o Esc fecha só o formulário.
useDialog(dialogEl, () => (form.open ? (form.open = false) : emit('close')))

const account = computed(() => accounts.byId(props.accountId))
const own = computed(() => contacts.forAccount(props.accountId))
const list = computed(() => searchContacts(own.value, query.value))
const registered = computed(() => accounts.statusOf(props.accountId).state === 'registered')

const errors = computed(() => ({
    name: form.contact.name.trim() ? '' : t('contactsDialog.erro_nome'),
    number: digits(form.contact.number) ? '' : t('contactsDialog.erro_numero')
}))

async function edit(contact?: Contact, text = ''): Promise<void> {
    const isName = /[^\d\s()+*#.,-]/.test(text)
    form.isNew = !contact
    form.tried = false
    form.contact = contact
        ? { ...contact }
        : {
              id: crypto.randomUUID(),
              name: isName ? text.trim() : '',
              number: isName ? '' : text.trim(),
              accountId: props.accountId
          }
    form.open = true
    await nextTick()
    nameInput.value?.focus()
}

async function save(): Promise<void> {
    form.tried = true
    if (errors.value.name || errors.value.number) return
    const c = form.contact
    const name = c.name.trim()
    await contacts.save({
        id: c.id,
        name,
        number: c.number.trim(),
        notes: c.notes?.trim() || undefined,
        accountId: props.accountId
    })
    useToastsStore().show(form.isNew ? t('contactsDialog.criado', { name }) : t('contactsDialog.salvo'))
    form.open = false
}

async function call(contact: Contact): Promise<void> {
    if (!registered.value) return
    accounts.setCurrent(props.accountId)
    emit('close')
    await calls.dial(props.accountId, contact.number).catch(() => undefined)
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
    const path = await window.iris.files.saveText('iris-contatos.csv', contacts.exportCsv(props.accountId))
    if (path) message.value = { ok: true, text: t('contactsDialog.exportados', { path }) }
}

async function remove(id: string): Promise<void> {
    await contacts.remove(id)
    confirmDelete.value = null
}

if (props.prefill !== undefined) void edit(undefined, props.prefill)
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
                <span class="swatch" :style="{ '--account': account?.color }" aria-hidden="true"></span>
                <h2 id="contacts-title">{{ $t('contactsDialog.titulo', { name: account?.name ?? '' }) }}</h2>
                <button class="btn small ghost" :aria-label="$t('contactsDialog.fechar')" @click="emit('close')">
                    <Icon name="close" />
                </button>
            </header>

            <form
                v-if="form.open"
                class="editor"
                role="group"
                :aria-label="
                    form.isNew
                        ? $t('contactsDialog.form_novo')
                        : $t('contactsDialog.form_editar', { name: form.contact.name })
                "
                novalidate
                @submit.prevent="save"
            >
                <h3>
                    {{
                        form.isNew
                            ? $t('contactsDialog.form_novo')
                            : $t('contactsDialog.form_editar', { name: form.contact.name })
                    }}
                </h3>
                <div class="grid">
                    <div class="field">
                        <label class="label" for="contact-name">{{ $t('contactsDialog.nome') }}</label>
                        <input
                            id="contact-name"
                            ref="nameInput"
                            v-model="form.contact.name"
                            class="input"
                            :class="{ invalid: form.tried && errors.name }"
                            :aria-invalid="Boolean(form.tried && errors.name)"
                            aria-describedby="contact-name-error"
                        />
                        <small v-if="form.tried && errors.name" id="contact-name-error" class="err">{{
                            errors.name
                        }}</small>
                    </div>
                    <div class="field">
                        <label class="label" for="contact-number">{{ $t('contactsDialog.numero') }}</label>
                        <input
                            id="contact-number"
                            v-model="form.contact.number"
                            class="input mono"
                            :class="{ invalid: form.tried && errors.number }"
                            :aria-invalid="Boolean(form.tried && errors.number)"
                            aria-describedby="contact-number-error"
                        />
                        <small v-if="form.tried && errors.number" id="contact-number-error" class="err">{{
                            errors.number
                        }}</small>
                    </div>
                    <div class="field wide">
                        <label class="label" for="contact-notes">{{ $t('contactsDialog.observacao') }}</label>
                        <input id="contact-notes" v-model="form.contact.notes" class="input" />
                    </div>
                </div>
                <div class="editor-actions">
                    <button type="button" class="btn small" @click="form.open = false">
                        {{ $t('contactsDialog.cancelar') }}
                    </button>
                    <button type="submit" class="btn small primary">{{ $t('contactsDialog.salvar') }}</button>
                </div>
            </form>

            <div class="head">
                <input
                    v-model="query"
                    class="input search"
                    type="search"
                    :placeholder="$t('contactsDialog.buscar')"
                    :aria-label="$t('contactsDialog.buscar')"
                />
                <button class="btn small primary" @click="edit()">{{ $t('contactsDialog.novo') }}</button>
                <button class="btn small" @click="importCsv">{{ $t('contactsDialog.importar') }}</button>
                <button class="btn small" :disabled="!own.length" @click="exportCsv">
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
                                <Icon name="phone" />{{ $t('contactsDialog.ligar') }}
                            </button>
                            <button
                                class="btn small"
                                :aria-label="$t('contactsDialog.editar_nome', { name: c.name })"
                                @click="edit(c)"
                            >
                                {{ $t('contactsDialog.editar') }}
                            </button>
                            <button
                                class="btn small ghost"
                                :aria-label="$t('contactsDialog.excluir_nome', { name: c.name })"
                                @click="confirmDelete = c.id"
                            >
                                {{ $t('contactsDialog.excluir') }}
                            </button>
                        </template>
                    </span>
                </li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.contacts {
    width: min(600px, 100%);
    height: min(560px, 100%);
}
.swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--account, var(--muted));
    flex: none;
}
.editor {
    margin: 10px 14px 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--selected);
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.editor h3 {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
}
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.field .input {
    background: var(--panel);
}
.wide {
    grid-column: 1 / -1;
}
.err {
    color: var(--bad-text);
    font-size: 11.5px;
}
.editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
}
.head {
    display: flex;
    gap: 6px;
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
    color: var(--ok-text);
}
.bad {
    color: var(--bad-text);
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
    padding: 0 14px 12px;
}
.contact {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
    border-bottom: 1px solid var(--line);
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
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.actions {
    display: flex;
    gap: 4px;
}
.actions :deep(.icon) {
    width: 12px;
    height: 12px;
}
</style>
