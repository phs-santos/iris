<script setup lang="ts">
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
    settings.trustedHosts = settings.trustedHosts.filter((h) => h !== host)
    await window.iris.settings.save(settings)
    log.add(null, 'warn', 'event', `Certificado de ${host} não é mais aceito`)
    await refresh()
}

onMounted(refresh)
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>Certificados</h3>
            <p>
                PBX com certificado autoassinado que você aceitou pelo aviso "Confiar neste host". Ao remover, a Íris
                volta a recusar o certificado na próxima conexão.
            </p>
        </div>
        <div v-if="hosts.length" class="set-group">
            <div v-for="host in hosts" :key="host" class="set-row">
                <span class="what mono">{{ host }}</span>
                <button class="btn small" :aria-label="`Remover ${host}`" @click="remove(host)">Remover</button>
            </div>
        </div>
        <p v-else class="set-hint">Nenhum certificado aceito à mão.</p>
    </section>
</template>
