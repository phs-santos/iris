import { defineStore } from 'pinia'
import { ref } from 'vue'
import { accentTokens, DEFAULT_THEME, type Appearance, type Theme } from '@shared/appearance'
import { DEFAULT_RECONNECT } from '@shared/reconnect'
import type { ReconnectSettings } from '@shared/types'
import type { NotificationSettings } from '@shared/notifications'

/** Seções da tela de Configurações. */
export type SettingsSection =
    'appearance' | 'audio' | 'notifications' | 'servers' | 'connection' | 'security' | 'data' | 'update'

/** Aparência e conexão da tela de Configurações, aplicadas na hora e salvas em settings.json. */
export const usePreferencesStore = defineStore('preferences', () => {
    const appearance = ref<Appearance>({})
    const reconnect = ref<ReconnectSettings>({ ...DEFAULT_RECONNECT })
    const notifications = ref<NotificationSettings>({})
    /** Tema em uso agora, já resolvido: para o que não dá para trocar só por CSS (o logo). */
    const theme = ref<'dark' | 'light'>('light')

    /** O tema escolhido, resolvendo "sistema" pelo que o sistema operacional usa agora. */
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)')
    const resolvedTheme = (): 'dark' | 'light' => {
        const chosen = appearance.value.theme ?? DEFAULT_THEME
        return chosen === 'system' ? (dark?.matches ? 'dark' : 'light') : chosen
    }
    dark?.addEventListener?.('change', () => apply())

    function apply(): void {
        const root = document.documentElement
        theme.value = resolvedTheme()
        root.dataset.theme = theme.value
        const tokens = accentTokens(appearance.value.accent, theme.value)
        root.style.setProperty('--accent', tokens.accent)
        root.style.setProperty('--accent-strong', tokens.strong)
    }

    async function load(): Promise<void> {
        const settings = await window.iris.settings.load()
        appearance.value = settings.appearance ?? {}
        reconnect.value = settings.reconnect ?? { ...DEFAULT_RECONNECT }
        notifications.value = settings.notifications ?? {}
        apply()
    }

    /** Só o campo desta tela: Áudio e certificados gravam no mesmo arquivo. */
    async function persist(): Promise<void> {
        await window.iris.settings.update({ appearance: { ...appearance.value } })
    }

    async function setAccent(accent: string): Promise<void> {
        appearance.value = { ...appearance.value, accent }
        apply()
        await persist()
    }

    async function setTheme(theme: Theme): Promise<void> {
        appearance.value = { ...appearance.value, theme }
        apply()
        await persist()
    }

    /** Vale para as próximas quedas; as contas já registradas pegam o valor novo ao registrar de novo. */
    async function setReconnect(next: ReconnectSettings): Promise<void> {
        reconnect.value = next
        await window.iris.settings.update({ reconnect: { ...next } })
    }

    async function setNotifications(next: NotificationSettings): Promise<void> {
        notifications.value = next
        await window.iris.settings.update({ notifications: JSON.parse(JSON.stringify(next)) })
    }

    return { appearance, reconnect, notifications, theme, setNotifications, load, setAccent, setTheme, setReconnect }
})
