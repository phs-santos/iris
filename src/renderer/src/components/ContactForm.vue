<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useContactsStore } from '@renderer/stores/contacts'
import { digits, type Contact } from '@shared/contacts'
import { t } from '@renderer/i18n'

/** Cadastrar ou editar um contato da agenda (RF-50). */
const props = defineProps<{ contact: Contact }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const accounts = useAccountsStore()
const contacts = useContactsStore()
const form = reactive<Contact>(JSON.parse(JSON.stringify(props.contact)))
const isNew = !contacts.contacts.some((c) => c.id === props.contact.id)
const tried = ref(false)

const errors = computed(() => ({
    name: form.name.trim() ? '' : t('contactForm.erro_nome'),
    number: digits(form.number) ? '' : t('contactForm.erro_numero')
}))

async function save(): Promise<void> {
    tried.value = true
    if (errors.value.name || errors.value.number) return
    await contacts.save({
        id: form.id,
        name: form.name.trim(),
        number: form.number.trim(),
        company: form.company?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        favorite: form.favorite || undefined,
        accountId: form.accountId || undefined
    })
    emit('close')
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <form
            ref="dialogEl"
            class="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
            tabindex="-1"
            @submit.prevent="save"
        >
            <header>
                <h2 id="contact-title">
                    {{ isNew ? $t('contactForm.novo') : $t('contactForm.editar', { name: contact.name }) }}
                </h2>
                <button
                    type="button"
                    class="btn small ghost"
                    :aria-label="$t('contactForm.fechar')"
                    @click="emit('close')"
                >
                    ✕
                </button>
            </header>
            <div class="body grid">
                <label class="field">
                    <span class="label">{{ $t('contactForm.nome') }}</span>
                    <input v-model="form.name" class="input" :class="{ invalid: tried && errors.name }" />
                    <small v-if="tried && errors.name">{{ errors.name }}</small>
                </label>
                <label class="field">
                    <span class="label">{{ $t('contactForm.numero') }}</span>
                    <input v-model="form.number" class="input mono" :class="{ invalid: tried && errors.number }" />
                    <small v-if="tried && errors.number">{{ errors.number }}</small>
                </label>
                <label class="field">
                    <span class="label">{{ $t('contactForm.empresa') }}</span>
                    <input v-model="form.company" class="input" />
                </label>
                <label class="field">
                    <span class="label">{{ $t('contactForm.conta') }}</span>
                    <select v-model="form.accountId" class="input">
                        <option :value="undefined">{{ $t('contactForm.conta_do_discador') }}</option>
                        <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                            {{ a.name }} · {{ a.extension }}
                        </option>
                    </select>
                </label>
                <label class="field wide">
                    <span class="label">{{ $t('contactForm.observacao') }}</span>
                    <textarea v-model="form.notes" class="input" rows="2"></textarea>
                </label>
                <label class="check wide">
                    <input v-model="form.favorite" type="checkbox" /> {{ $t('contactForm.favorito') }}
                </label>
            </div>
            <footer>
                <button type="button" class="btn" @click="emit('close')">{{ $t('contactForm.cancelar') }}</button>
                <button type="submit" class="btn primary">{{ $t('contactForm.salvar') }}</button>
            </footer>
        </form>
    </div>
</template>

<style scoped>
.dialog {
    width: min(560px, 100%);
}
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.wide {
    grid-column: 1 / -1;
}
.field small {
    color: var(--bad);
}
</style>
