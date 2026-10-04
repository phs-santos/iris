import { defineStore } from 'pinia'
import { ref } from 'vue'
import { accentTokens, INTERFACE_ZOOM, type Appearance, type InterfaceSize, type Profile } from '@shared/appearance'
import { DEFAULT_RECONNECT } from '@shared/reconnect'
import type { ReconnectSettings } from '@shared/types'

/** Seções da tela de Configurações. */
export type SettingsSection = 'profile' | 'appearance' | 'audio' | 'connection' | 'ai' | 'security' | 'data' | 'update'

/** Perfil e aparência da tela de Configurações, aplicados na hora e salvos em settings.json. */
export const usePreferencesStore = defineStore('preferences', () => {
    const profile = ref<Profile>({})
    const appearance = ref<Appearance>({})
    const reconnect = ref<ReconnectSettings>({ ...DEFAULT_RECONNECT })

    function apply(): void {
        const root = document.documentElement
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

    return { profile, appearance, reconnect, load, setProfile, setAccent, setSize, setReconnect }
})
