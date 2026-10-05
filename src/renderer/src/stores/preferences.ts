import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    accentTokens,
    DEFAULT_LANGUAGE,
    type Language,
    INTERFACE_ZOOM,
    type Appearance,
    type InterfaceSize,
    type Profile,
    type Theme
} from '@shared/appearance'
import { DEFAULT_RECONNECT } from '@shared/reconnect'
import type { ReconnectSettings } from '@shared/types'
import type { NotificationSettings } from '@shared/notifications'
import type { LinkSettings } from '@shared/links'
import { modeOn, type ModeId, type ModeSettings } from '@shared/modes'
import type { ShortcutSettings } from '@shared/shortcuts'
import { setLocale } from '@renderer/i18n'

/** Seções da tela de Configurações. */
export type SettingsSection =
    | 'profile'
    | 'appearance'
    | 'audio'
    | 'notifications'
    | 'shortcuts'
    | 'servers'
    | 'connection'
    | 'ai'
    | 'security'
    | 'data'
    | 'update'
    | 'modes'

/** Perfil e aparência da tela de Configurações, aplicados na hora e salvos em settings.json. */
export const usePreferencesStore = defineStore('preferences', () => {
    const profile = ref<Profile>({})
    const appearance = ref<Appearance>({})
    const reconnect = ref<ReconnectSettings>({ ...DEFAULT_RECONNECT })
    const notifications = ref<NotificationSettings>({})
    const links = ref<LinkSettings>({})
    /** Modos ligados na área secreta; sem nada, só o padrão de chamada aparece. */
    const modes = ref<ModeSettings>({})
    const shortcuts = ref<ShortcutSettings>({})
    /** O botão do fone (tecla Tocar/Pausar) atende e desliga (RF-55). */
    const mediaKey = ref(false)
    /** Tema em uso agora, já resolvido: para o que não dá para trocar só por CSS (o logo). */
    const theme = ref<'dark' | 'light'>('dark')

    /** O tema escolhido, resolvendo "sistema" pelo que o sistema operacional usa agora. */
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)')
    const resolvedTheme = (): 'dark' | 'light' => {
        const theme = appearance.value.theme ?? 'dark'
        return theme === 'system' ? (dark?.matches === false ? 'light' : 'dark') : theme
    }
    dark?.addEventListener?.('change', () => apply())

    function apply(): void {
        const root = document.documentElement
        theme.value = resolvedTheme()
        root.dataset.theme = theme.value
        root.dataset.density = appearance.value.compact ? 'compact' : 'normal'
        setLocale(appearance.value.language ?? DEFAULT_LANGUAGE)
        const tokens = accentTokens(appearance.value.accent)
        root.style.setProperty('--accent', tokens.accent)
        root.style.setProperty('--accent-strong', tokens.strong)
        root.style.zoom = String(INTERFACE_ZOOM[appearance.value.size ?? 'medium'])
    }

    async function load(): Promise<void> {
        const settings = await window.iris.settings.load()
        profile.value = settings.profile ?? {}
        appearance.value = settings.appearance ?? {}
        reconnect.value = settings.reconnect ?? { ...DEFAULT_RECONNECT }
        notifications.value = settings.notifications ?? {}
        links.value = settings.links ?? {}
        modes.value = settings.modes ?? {}
        shortcuts.value = settings.shortcuts ?? {}
        mediaKey.value = Boolean(settings.mediaKey)
        apply()
    }

    /** Só os campos desta tela: Áudio, IA e certificados gravam no mesmo arquivo. */
    async function persist(): Promise<void> {
        await window.iris.settings.update({ profile: { ...profile.value }, appearance: { ...appearance.value } })
    }

    async function setProfile(patch: Partial<Profile>): Promise<void> {
        profile.value = { ...profile.value, ...patch }
        await persist()
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

    async function setLanguage(language: Language): Promise<void> {
        appearance.value = { ...appearance.value, language: language === DEFAULT_LANGUAGE ? undefined : language }
        apply()
        await persist()
    }

    async function setCompact(compact: boolean): Promise<void> {
        appearance.value = { ...appearance.value, compact: compact || undefined }
        apply()
        await persist()
    }

    async function setSize(size: InterfaceSize): Promise<void> {
        appearance.value = { ...appearance.value, size }
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

    async function setLinks(next: LinkSettings): Promise<void> {
        links.value = next
        await window.iris.settings.update({ links: { ...next } })
    }

    /** O processo principal registra os atalhos no sistema assim que grava (RF-34). */
    async function setShortcuts(next: ShortcutSettings): Promise<void> {
        shortcuts.value = next
        await window.iris.settings.update({ shortcuts: { ...next } })
    }

    const isOn = (mode: ModeId): boolean => modeOn(modes.value, mode)

    async function setModes(next: ModeSettings): Promise<void> {
        modes.value = next
        await window.iris.settings.update({ modes: JSON.parse(JSON.stringify(next)) })
    }

    const setMode = (mode: ModeId, on: boolean): Promise<void> =>
        setModes({ ...modes.value, enabled: { ...modes.value.enabled, [mode]: on || undefined } })

    async function setMediaKey(on: boolean): Promise<void> {
        mediaKey.value = on
        await window.iris.settings.update({ mediaKey: on })
    }

    return {
        modes,
        isOn,
        setModes,
        setMode,
        mediaKey,
        setMediaKey,
        links,
        shortcuts,
        setLinks,
        setShortcuts,
        profile,
        appearance,
        reconnect,
        notifications,
        theme,
        setNotifications,
        load,
        setProfile,
        setAccent,
        setSize,
        setTheme,
        setCompact,
        setLanguage,
        setReconnect
    }
})
