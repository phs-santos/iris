<script setup lang="ts">
import { MAX_RECONNECT_ATTEMPTS } from '@shared/reconnect'
import { usePreferencesStore } from '@renderer/stores/preferences'

/** Reconexão das contas depois de uma queda (RNF-06). */
const prefs = usePreferencesStore()

function setMax(text: string): void {
    const value = Math.round(Number(text))
    if (!Number.isFinite(value)) return
    void prefs.setReconnect({ maxAttempts: Math.max(0, Math.min(MAX_RECONNECT_ATTEMPTS, value)) })
}
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('connectionSection.conexao') }}</h3>
            <p>
                {{ $t('connectionSection.quando_a_rede_cai_ou') }}
            </p>
        </div>
        <div class="set-group">
            <label class="set-row">
                <span class="what">
                    <b>{{ $t('connectionSection.tentativas_de_reconexao') }}</b>
                    <small>{{ $t('connectionSection.depois_disso_a_conta_fica') }}</small>
                </span>
                <input
                    class="input control"
                    type="number"
                    min="0"
                    :max="MAX_RECONNECT_ATTEMPTS"
                    step="1"
                    :value="prefs.reconnect.maxAttempts"
                    @change="setMax(($event.target as HTMLInputElement).value)"
                />
            </label>
        </div>
        <p class="set-hint">
            {{ $t('connectionSection.senha_errada_ramal_inexistente_e') }}
        </p>
    </section>
</template>
