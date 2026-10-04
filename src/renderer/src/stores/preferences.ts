import { defineStore } from 'pinia'
import { ref } from 'vue'
import { accentTokens, INTERFACE_ZOOM, type Appearance, type InterfaceSize, type Profile } from '@shared/appearance'

/** Seções da tela de Configurações. */
export type SettingsSection = 'profile' | 'appearance' | 'audio' | 'ai' | 'security' | 'data' | 'update'

/** Perfil e aparência da tela de Configurações, aplicados na hora e salvos em settings.json. */
export const usePreferencesStore = defineStore('preferences', () => {
    const profile = ref<Profile>({})
    const appearance = ref<Appearance>({})

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
        apply()
    }

    /** Relê o arquivo antes de gravar: Áudio, IA e certificados gravam nele também. */
    async function persist(): Promise<void> {
        const settings = await window.iris.settings.load()
        await window.iris.settings.save({
            ...settings,
            profile: { ...profile.value },
            appearance: { ...appearance.value }
        })
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

    return { profile, appearance, load, setProfile, setAccent, setSize }
})
