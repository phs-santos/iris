<script setup lang="ts">
import { t } from '@renderer/i18n'
import { onMounted, ref } from 'vue'
import { useLogStore } from '@renderer/stores/log'

/** Hosts com certificado TLS aceito à mão (RF-37): a lista fica visível e dá para desfazer. */
const log = useLogStore()
const hosts = ref<string[]>([])

async function refresh(): Promise<void> {
    hosts.value = (await window.iris.settings.load()).trustedHosts
}

async function remove(host: string): Promise<void> {
    const settings = await window.iris.settings.load()
    await window.iris.settings.update({ trustedHosts: settings.trustedHosts.filter((h) => h !== host) })
    log.add(null, 'warn', 'event', t('securitySection.certificado_de_nao_e_mais', { host }))
    await refresh()
}

onMounted(refresh)
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('securitySection.certificados') }}</h3>
            <p>
                {{ $t('securitySection.pbx_com_certificado_autoassinado_que') }}
            </p>
        </div>
        <div v-if="hosts.length" class="set-group">
            <div v-for="host in hosts" :key="host" class="set-row">
                <span class="what mono">{{ host }}</span>
                <button class="btn small" :aria-label="$t('securitySection.remover_2', { host })" @click="remove(host)">
                    {{ $t('securitySection.remover') }}
                </button>
            </div>
        </div>
        <p v-else class="set-hint">{{ $t('securitySection.nenhum_certificado_aceito_a_mao') }}</p>
    </section>
</template>
