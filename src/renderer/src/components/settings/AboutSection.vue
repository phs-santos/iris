<script setup lang="ts">
import { onMounted, ref } from 'vue'

/** Sobre: a versão da Íris e do que ela usa por baixo, para pôr num relato de defeito. */
const info = ref<{ version: string; platform: string; electron: string; chrome: string } | null>(null)
onMounted(async () => (info.value = await window.iris.appInfo()))
</script>

<template>
    <section class="set-section">
        <div class="set-head">
            <h3>{{ $t('aboutSection.titulo') }}</h3>
            <p>{{ $t('aboutSection.descricao') }}</p>
        </div>
        <dl v-if="info" class="set-group facts">
            <div class="set-row">
                <dt>{{ $t('aboutSection.versao') }}</dt>
                <dd class="mono">{{ info.version }}</dd>
            </div>
            <div class="set-row">
                <dt>{{ $t('aboutSection.electron') }}</dt>
                <dd class="mono">{{ $t('aboutSection.motor', { electron: info.electron, chrome: info.chrome }) }}</dd>
            </div>
            <div class="set-row">
                <dt>{{ $t('aboutSection.sistema') }}</dt>
                <dd class="mono">{{ info.platform }}</dd>
            </div>
            <div class="set-row">
                <dt>{{ $t('aboutSection.licenca') }}</dt>
                <dd>{{ $t('aboutSection.licenca_valor') }}</dd>
            </div>
        </dl>
    </section>
</template>

<style scoped>
.facts {
    margin: 0;
}
dt {
    flex: 1;
    color: var(--muted);
}
dd {
    margin: 0;
}
</style>
