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
            <h3>{{ $t('profileSection.perfil') }}</h3>
            <p>{{ $t('profileSection.quem_esta_usando_a_iris') }}</p>
        </div>
        <div class="set-group">
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('profileSection.seu_nome') }}</b>
                    <small>{{ $t('profileSection.ja_vem_preenchido_como_nome') }}</small>
                </span>
                <input
                    class="input control"
                    :value="prefs.profile.name ?? ''"
                    maxlength="120"
                    :placeholder="$t('profileSection.ex_ana_do_suporte')"
                    @change="prefs.setProfile({ name: ($event.target as HTMLInputElement).value.trim() || undefined })"
                />
            </label>
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('profileSection.conta_principal') }}</b>
                    <small>{{ $t('profileSection.fica_escolhida_no_discador_quando') }}</small>
                </span>
                <select
                    class="input control"
                    :value="prefs.profile.mainAccountId ?? ''"
                    @change="setMain(($event.target as HTMLSelectElement).value)"
                >
                    <option value="">{{ $t('profileSection.a_primeira_da_lista') }}</option>
                    <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">
                        {{ a.name }} · {{ a.extension }}@{{ a.domain }}
                    </option>
                </select>
            </label>
        </div>
    </section>
</template>
