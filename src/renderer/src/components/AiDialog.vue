<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { maskLog, stripCredentials, suggestModel, trimLog, type AiModel, type AiStatus } from '@shared/ai'
import { useDialog } from '@renderer/lib/dialog'
import { useAiStore, type AiAsk } from '@renderer/stores/ai'

/** Ajuda da IA para ler o log (RF-38): mostra exatamente o que vai sair da máquina antes de enviar. */
const props = defineProps<{ ask: AiAsk }>()
const emit = defineEmits<{ close: [] }>()
const dialogEl = ref<HTMLElement | null>(null)
useDialog(dialogEl, () => emit('close'))
const ai = useAiStore()

const status = ref<AiStatus | null>(null)
const keyInput = ref('')
const keyError = ref('')
const models = ref<AiModel[]>([])
const modelsError = ref('')
const model = ref('')
const mask = ref(true)
const sending = ref(false)
const answer = ref('')
const error = ref('')
const copied = ref(false)

const trimmed = computed(() => trimLog(props.ask.lines))
/**
 * A pergunta e o log que vão para a OpenRouter, iguais aos que o processo principal envia.
 * A máscara passa pelos dois juntos: a pergunta cita o número da chamada, e ele tem que virar o
 * mesmo marcador que aparece no log.
 */
const outgoing = computed(() => {
    const log = stripCredentials(trimmed.value.text)
    if (!mask.value) return { question: props.ask.question, log }
    const [question = '', ...rest] = maskLog(`${props.ask.question}\n\n${log}`, ai.known()).split('\n\n')
    return { question, log: rest.join('\n\n') }
})
const canSend = computed(() => Boolean(model.value.trim()) && props.ask.lines.length > 0 && !sending.value)

async function loadModels(): Promise<void> {
    modelsError.value = ''
    try {
        models.value = await window.iris.ai.models()
        if (!model.value) model.value = suggestModel(models.value) ?? ''
    } catch {
        modelsError.value =
            'Não deu para carregar a lista de modelos. Digite o nome do modelo (ex.: fornecedor/modelo).'
    }
}

async function refresh(): Promise<void> {
    status.value = await window.iris.ai.status()
    mask.value = status.value.mask
    model.value = status.value.model ?? ''
    if (status.value.hasKey) await loadModels()
}

async function saveKey(): Promise<void> {
    keyError.value = ''
    if (!keyInput.value.trim()) {
        keyError.value = 'Cole a chave da OpenRouter.'
        return
    }
    await window.iris.ai.setKey(keyInput.value)
    keyInput.value = ''
    await refresh()
}

async function removeKey(): Promise<void> {
    await window.iris.ai.setKey(null)
    answer.value = ''
    await refresh()
}

async function send(): Promise<void> {
    sending.value = true
    error.value = ''
    answer.value = ''
    await window.iris.ai.setOptions({ model: model.value.trim(), mask: mask.value })
    const result = await window.iris.ai.explain({
        model: model.value.trim(),
        question: outgoing.value.question,
        log: outgoing.value.log
    })
    if (result.ok) answer.value = result.text
    else error.value = result.error
    sending.value = false
}

async function copy(): Promise<void> {
    await navigator.clipboard.writeText(answer.value).catch(() => undefined)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
}

onMounted(refresh)
</script>

<template>
    <div class="overlay" @click.self="emit('close')">
        <div
            ref="dialogEl"
            class="dialog wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-title"
            tabindex="-1"
        >
            <header>
                <h2 id="ai-title">{{ ask.title }} · IA</h2>
                <button class="btn small ghost" aria-label="Fechar" @click="emit('close')">✕</button>
            </header>

            <div v-if="status && !status.hasKey" class="body">
                <p>
                    A explicação é feita por um modelo de IA da OpenRouter, com a sua chave. O uso é cobrado na sua
                    conta de lá. Crie a chave em <span class="mono">openrouter.ai/keys</span> e cole aqui.
                </p>
                <label class="field">
                    <span class="label">Chave da OpenRouter</span>
                    <input v-model="keyInput" class="input mono" type="password" autocomplete="off" />
                </label>
                <p v-if="keyError" class="error" role="alert">{{ keyError }}</p>
                <p class="hint">
                    A chave fica no arquivo de senhas da Íris, cifrada, junto com as senhas das contas. Ela não aparece
                    de novo na tela nem entra em exportações.
                </p>
            </div>

            <div v-else-if="status" class="body">
                <label class="field">
                    <span class="label">Modelo</span>
                    <select v-if="models.length" v-model="model" class="input">
                        <option v-if="model && !models.some((m) => m.id === model)" :value="model">{{ model }}</option>
                        <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }}</option>
                    </select>
                    <input v-else v-model="model" class="input mono" placeholder="fornecedor/modelo" />
                </label>
                <p v-if="modelsError" class="error" role="alert">{{ modelsError }}</p>

                <label class="check">
                    <input v-model="mask" type="checkbox" />
                    Mascarar ramais, números, IPs, domínios e nomes de conta
                </label>

                <div class="label">Texto que será enviado para a OpenRouter</div>
                <pre class="preview mono" tabindex="0" aria-label="Texto que será enviado"
                    >{{ outgoing.question }}

{{ outgoing.log || '(nenhuma linha de log neste recorte)' }}</pre>
                <p v-if="trimmed.dropped" class="hint">
                    O recorte é grande: as {{ trimmed.dropped }} linhas mais antigas ficaram de fora.
                </p>
                <p class="hint">
                    Além deste texto, vai só uma instrução fixa de como responder. Senhas e dados de autenticação nunca
                    são enviados. Com a máscara desligada, ramais, números e endereços do seu PBX vão para a OpenRouter
                    como aparecem acima.
                </p>

                <p v-if="sending" role="status">Esperando a resposta da IA…</p>
                <p v-if="error" class="error" role="alert">{{ error }}</p>
                <template v-if="answer">
                    <div class="label">Resposta</div>
                    <div class="answer" tabindex="0" aria-label="Resposta da IA">{{ answer }}</div>
                    <p class="hint">A IA pode errar. Confira a explicação com o log antes de mexer no PBX.</p>
                </template>
            </div>

            <footer v-if="status && !status.hasKey">
                <button class="btn primary" @click="saveKey">Salvar chave</button>
            </footer>
            <footer v-else-if="status">
                <button class="btn" @click="removeKey">Remover chave</button>
                <button v-if="answer" class="btn" @click="copy">{{ copied ? 'Copiada' : 'Copiar resposta' }}</button>
                <button class="btn primary" :disabled="!canSend" @click="send">
                    {{ answer ? 'Enviar de novo' : 'Enviar para a OpenRouter' }}
                </button>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.dialog.wide {
    width: min(760px, 100%);
}
.check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
}
.preview,
.answer {
    max-height: 220px;
    overflow: auto;
    margin: 6px 0;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    white-space: pre-wrap;
    word-break: break-word;
}
.preview {
    font-size: 11.5px;
}
.answer {
    max-height: 320px;
}
.hint {
    color: var(--muted);
    font-size: 12px;
}
.error {
    color: var(--bad);
}
</style>
