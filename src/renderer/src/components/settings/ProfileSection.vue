<script setup lang="ts">
import { useAccountsStore } from '@renderer/stores/accounts'
import { usePreferencesStore } from '@renderer/stores/preferences'

const accounts = useAccountsStore()
const prefs = usePreferencesStore()

function setMain(id: string): void {
    void prefs.setProfile({ mainAccountId: id || undefined })
    if (id) accounts.selectedId = id
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>Perfil</h3>
            <p>Quem está usando a Íris e por qual conta ela começa.</p>
        </div>
        <div class="set-group">
            <label class="set-row">
                <span class="what">
                    <b>Seu nome</b>
                    <small>Já vem preenchido como nome de exibição nas contas novas.</small>
                </span>
                <input
                    class="input control"
                    :value="prefs.profile.name ?? ''"
                    maxlength="120"
                    placeholder="Ex.: Ana do suporte"
                    @change="prefs.setProfile({ name: ($event.target as HTMLInputElement).value.trim() || undefined })"
                />
            </label>
            <label class="set-row">
                <span class="what">
                    <b>Conta principal</b>
                    <small>Fica escolhida no discador quando o app abre.</small>
                </span>
                <select
                    class="input control"
                    :value="prefs.profile.mainAccountId ?? ''"
                    @change="setMain(($event.target as HTMLSelectElement).value)"
                >
                    <option value="">A primeira da lista</option>
                    <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                        {{ a.name }} · {{ a.extension }}@{{ a.domain }}
                    </option>
                </select>
            </label>
        </div>
    </section>
</template>
