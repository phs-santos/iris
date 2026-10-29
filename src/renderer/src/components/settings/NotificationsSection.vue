<script setup lang="ts">
import { ref } from 'vue'
import { t } from '@renderer/i18n'
import { usePreferencesStore } from '@renderer/stores/preferences'
import { NOTIFICATION_KINDS, notificationOn, type NotificationKind } from '@shared/notifications'

/** Quais eventos viram notificação do sistema. */
const prefs = usePreferencesStore()
const tested = ref(false)

const label = (kind: NotificationKind): { name: string; hint: string } =>
    ({
        incoming: { name: t('notificationsSection.recebida'), hint: t('notificationsSection.recebida_dica') },
        missed: { name: t('notificationsSection.perdida'), hint: t('notificationsSection.perdida_dica') },
        registration: { name: t('notificationsSection.caiu'), hint: t('notificationsSection.caiu_dica') },
        voicemail: { name: t('notificationsSection.correio'), hint: t('notificationsSection.correio_dica') },
        monitor: { name: t('notificationsSection.monitor'), hint: t('notificationsSection.monitor_dica') }
    })[kind]

function toggle(kind: NotificationKind, on: boolean): void {
    void prefs.setNotifications({ ...prefs.notifications, enabled: { ...prefs.notifications.enabled, [kind]: on } })
}

function setFocus(on: boolean): void {
    void prefs.setNotifications({ ...prefs.notifications, focusOnRing: on || undefined })
}

/** Manda uma notificação de teste, ignorando a escolha acima: serve para ver se o sistema bloqueia. */
function test(): void {
    window.iris.notify({
        kind: 'registration',
        title: t('notificationsSection.teste_titulo'),
        body: t('notificationsSection.teste_texto')
    })
    tested.value = true
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('notificationsSection.notificacoes') }}</h3>
            <p>{{ $t('notificationsSection.explicacao') }}</p>
        </div>
        <div class="set-group">
            <label v-for="kind in NOTIFICATION_KINDS" :key="kind" class="set-row">
                <span class="what">
                    <b>{{ label(kind).name }}</b>
                    <small>{{ label(kind).hint }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="notificationOn(prefs.notifications, kind)"
                    @change="toggle(kind, ($event.target as HTMLInputElement).checked)"
                />
            </label>
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('notificationsSection.trazer_janela') }}</b>
                    <small>{{ $t('notificationsSection.trazer_janela_dica') }}</small>
                </span>
                <input
                    type="checkbox"
                    :checked="Boolean(prefs.notifications.focusOnRing)"
                    @change="setFocus(($event.target as HTMLInputElement).checked)"
                />
            </label>
        </div>
        <button class="btn" @click="test">{{ $t('notificationsSection.testar') }}</button>
        <p v-if="tested" class="set-hint" role="status">{{ $t('notificationsSection.nao_apareceu') }}</p>
    </section>
</template>
