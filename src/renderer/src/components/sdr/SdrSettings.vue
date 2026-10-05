<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@renderer/i18n'
import { useDialog } from '@renderer/lib/dialog'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useSdrStore } from '@renderer/stores/sdr'
import { isWebhookUrl } from '@shared/monitor'
import { isHhMm, type Opening, type SdrSettings, type VoicemailAction } from '@shared/sdr'
import WavPicker from './WavPicker.vue'

/** Opções da campanha do modo SDR: conta, aberturas, caixa postal, horário, tentativas e CRM. */
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const sdr = useSdrStore()
const accounts = useAccountsStore()

const form = ref<SdrSettings>(JSON.parse(JSON.stringify(sdr.settings)))
const error = ref('')
const days = computed(() => [
    t('sdrSettings.dom'),
    t('sdrSettings.seg'),
    t('sdrSettings.ter'),
    t('sdrSettings.qua'),
    t('sdrSettings.qui'),
    t('sdrSettings.sex'),
    t('sdrSettings.sab')
])
const actions: { id: VoicemailAction; name: string }[] = [
    { id: 'hangup', name: t('sdrSettings.cp_desligar') },
    { id: 'message', name: t('sdrSettings.cp_recado') },
    { id: 'nothing', name: t('sdrSettings.cp_nada') }
]

function toggleDay(day: number, on: boolean): void {
    const set = new Set(form.value.hours.days)
    if (on) set.add(day)
    else set.delete(day)
    form.value.hours.days = [...set].sort()
}

function addOpening(): void {
    form.value.openings.push({ id: crypto.randomUUID(), segment: '', script: '' })
}

function removeOpening(opening: Opening): void {
    form.value.openings = form.value.openings.filter((o) => o !== opening)
}

function save(): void {
    const f = form.value
    error.value = ''
    if (!isHhMm(f.hours.start) || !isHhMm(f.hours.end) || f.hours.start >= f.hours.end)
        return void (error.value = t('sdrSettings.erro_horario'))
    if (!f.hours.days.length) return void (error.value = t('sdrSettings.erro_dias'))
    if (!f.openings.length) return void (error.value = t('sdrSettings.erro_abertura'))
    if (f.webhook?.trim() && !isWebhookUrl(f.webhook.trim())) return void (error.value = t('sdrSettings.erro_webhook'))
    sdr.setSettings({ ...f, webhook: f.webhook?.trim() || undefined, accountId: f.accountId || undefined })
    emit('close')
}
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <form
            ref="dialogEl"
            class="dialog sdr-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sdr-settings-title"
            tabindex="-1"
            @submit.prevent="save"
        >
            <header>
                <h2 id="sdr-settings-title">{{ $t('sdrSettings.titulo') }}</h2>
                <button
                    type="button"
                    class="btn small ghost"
                    :aria-label="$t('sdrSettings.fechar')"
                    @click="emit('close')"
                >
                    ✕
                </button>
            </header>
            <div class="body">
                <label class="field">
                    <span class="label">{{ $t('sdrSettings.conta') }}</span>
                    <select v-model="form.accountId" class="input">
                        <option :value="undefined">{{ $t('sdrSettings.conta_do_discador') }}</option>
                        <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                            {{ a.name }} · {{ a.extension }}@{{ a.domain }}
                        </option>
                    </select>
                </label>

                <h3>{{ $t('sdrSettings.aberturas') }}</h3>
                <p class="hint">{{ $t('sdrSettings.aberturas_dica') }}</p>
                <label class="check">
                    <input v-model="form.playOpening" type="checkbox" />
                    {{ $t('sdrSettings.tocar_abertura') }}
                </label>
                <div v-for="(o, i) in form.openings" :key="o.id" class="opening">
                    <div class="row">
                        <label class="field grow">
                            <span class="label">{{ $t('sdrSettings.segmento') }}</span>
                            <input v-model="o.segment" class="input" :placeholder="$t('sdrSettings.segmento_padrao')" />
                        </label>
                        <button
                            v-if="form.openings.length > 1"
                            type="button"
                            class="btn small ghost"
                            :aria-label="$t('sdrSettings.remover_abertura', { n: i + 1 })"
                            @click="removeOpening(o)"
                        >
                            {{ $t('sdrSettings.remover') }}
                        </button>
                    </div>
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.roteiro') }}</span>
                        <textarea v-model="o.script" class="input" rows="3"></textarea>
                    </label>
                    <span class="label">{{ $t('sdrSettings.gravacao') }}</span>
                    <WavPicker
                        :path="o.audio"
                        name="abertura"
                        :label="$t('sdrSettings.gravacao_da', { n: i + 1 })"
                        @change="(p) => (o.audio = p)"
                    />
                </div>
                <button type="button" class="btn small" @click="addOpening">
                    {{ $t('sdrSettings.nova_abertura') }}
                </button>

                <h3>{{ $t('sdrSettings.caixa_postal') }}</h3>
                <label class="check">
                    <input v-model="form.voicemail.detect" type="checkbox" />
                    {{ $t('sdrSettings.detectar') }}
                </label>
                <p class="hint">{{ $t('sdrSettings.detectar_dica') }}</p>
                <div class="seg" role="radiogroup" :aria-label="$t('sdrSettings.ao_cair_na_caixa')">
                    <label v-for="a in actions" :key="a.id" class="check">
                        <input
                            v-model="form.voicemail.action"
                            type="radio"
                            :value="a.id"
                            :disabled="!form.voicemail.detect"
                        />
                        {{ a.name }}
                    </label>
                </div>
                <WavPicker
                    v-if="form.voicemail.action === 'message'"
                    :path="form.voicemail.audio"
                    name="recado"
                    :label="$t('sdrSettings.recado')"
                    @change="(p) => (form.voicemail.audio = p)"
                />

                <h3>{{ $t('sdrSettings.horario') }}</h3>
                <p class="hint">{{ $t('sdrSettings.horario_dica') }}</p>
                <div class="row">
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.de') }}</span>
                        <input v-model="form.hours.start" type="time" class="input" />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.ate') }}</span>
                        <input v-model="form.hours.end" type="time" class="input" />
                    </label>
                </div>
                <div class="days" role="group" :aria-label="$t('sdrSettings.dias')">
                    <label v-for="(d, i) in days" :key="i" class="check">
                        <input
                            type="checkbox"
                            :checked="form.hours.days.includes(i)"
                            @change="toggleDay(i, ($event.target as HTMLInputElement).checked)"
                        />
                        {{ d }}
                    </label>
                </div>

                <h3>{{ $t('sdrSettings.fila') }}</h3>
                <div class="row">
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.tentativas') }}</span>
                        <input v-model.number="form.maxAttempts" type="number" min="1" max="20" class="input" />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.intervalo') }}</span>
                        <input v-model.number="form.retryMinutes" type="number" min="1" max="10080" class="input" />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.proxima_em') }}</span>
                        <input v-model.number="form.advanceSeconds" type="number" min="0" max="120" class="input" />
                    </label>
                    <label class="field">
                        <span class="label">{{ $t('sdrSettings.meta') }}</span>
                        <input v-model.number="form.dailyGoal" type="number" min="0" max="10000" class="input" />
                    </label>
                </div>

                <h3>{{ $t('sdrSettings.crm') }}</h3>
                <label class="field">
                    <span class="label">{{ $t('sdrSettings.webhook') }}</span>
                    <input v-model="form.webhook" class="input mono" :placeholder="$t('sdrSettings.webhook_exemplo')" />
                </label>
                <label class="check">
                    <input v-model="form.record" type="checkbox" />
                    {{ $t('sdrSettings.gravar_chamadas') }}
                </label>
                <p class="hint">{{ $t('sdrSettings.gravar_dica') }}</p>
                <p v-if="error" class="error" role="alert">{{ error }}</p>
            </div>
            <footer>
                <button type="button" class="btn" @click="emit('close')">{{ $t('sdrSettings.cancelar') }}</button>
                <button type="submit" class="btn primary">{{ $t('sdrSettings.salvar') }}</button>
            </footer>
        </form>
    </div>
</template>

<style scoped>
.sdr-settings {
    width: min(720px, 94vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
}
header,
footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
}
footer {
    justify-content: flex-end;
    border-top: 1px solid var(--line);
}
header h2 {
    margin: 0;
    font-size: 16px;
}
.body {
    overflow: auto;
    padding: 0 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
h3 {
    margin: 12px 0 0;
    font-size: 13px;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.grow {
    flex: 1;
}
.row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    flex-wrap: wrap;
}
.row .field {
    min-width: 110px;
}
.check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.seg,
.days {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
}
.opening {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
}
textarea {
    font-family: inherit;
    resize: vertical;
}
.hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
}
.error {
    margin: 0;
    color: var(--bad-text);
}
</style>
