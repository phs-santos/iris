// Ajuda da IA para ler o log (RF-38), pela OpenRouter. A chave do usuário fica no cofre de senhas
// e nunca vai para a interface: quem fala com a OpenRouter é este processo, por canais fixos de IPC.
// A interface continua sem poder abrir conexões fora dos PBX (CSP, RNF-08).

import { app, net } from 'electron'
import { promises as fs } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseWav, SAMPLE_RATE, wavHeader } from '@shared/audio'
import { IPC } from '@shared/types'
import {
    AI_MAX_CHARS,
    buildMessages,
    stripCredentials,
    type AiModel,
    type AiRequest,
    type AiResult,
    type AiStatus
} from '@shared/ai'
import { check, handle, isPlainObject, isString } from './ipc-guard'
import { getSecret, loadSettings, setSecret, updateSettings } from './storage'

/** Id reservado no cofre de senhas; os canais de senha das contas recusam ids com este prefixo. */
export const AI_SECRET_PREFIX = 'ai:'
const KEY_ID = `${AI_SECRET_PREFIX}openrouter`
const TIMEOUT_MS = 90_000

/** Só os testes trocam o endereço, e só fora do app empacotado: senão a chave iria para qualquer servidor. */
function baseUrl(): string {
    const test = process.env['IRIS_AI_URL']
    return test && !app.isPackaged ? test : 'https://openrouter.ai/api/v1'
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        return await net.fetch(`${baseUrl()}${path}`, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

function describe(status: number, body: string): string {
    if (status === 401) return 'A OpenRouter recusou a chave. Confira se ela foi copiada inteira.'
    if (status === 402) return 'A chave está sem créditos na OpenRouter.'
    if (status === 404) return 'O modelo escolhido não existe mais na OpenRouter. Escolha outro.'
    if (status === 429) return 'A OpenRouter pediu para esperar um pouco (limite de uso). Tente de novo em instantes.'
    let detail = ''
    try {
        detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
        // corpo que não é JSON: fica só o código
    }
    return `A OpenRouter respondeu com erro ${status}${detail ? `: ${detail.slice(0, 200)}` : ''}.`
}

async function status(): Promise<AiStatus> {
    const { ai } = await loadSettings()
    return { hasKey: Boolean(await getSecret(KEY_ID)), model: ai?.model ?? null, mask: ai?.mask ?? true }
}

async function explain(input: AiRequest): Promise<AiResult> {
    const key = await getSecret(KEY_ID)
    if (!key) return { ok: false, error: 'Cadastre a chave da OpenRouter antes de pedir a explicação.' }
    try {
        const response = await request('/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/phs-santos/iris',
                'X-Title': 'Iris'
            },
            body: JSON.stringify({
                model: input.model,
                messages: buildMessages({ question: input.question, log: stripCredentials(input.log) })
            })
        })
        const body = await response.text()
        if (!response.ok) return { ok: false, error: describe(response.status, body) }
        const data = JSON.parse(body) as {
            choices?: { message?: { content?: unknown } }[]
            error?: { message?: string }
        }
        const text = data.choices?.[0]?.message?.content
        if (typeof text !== 'string' || !text.trim())
            return { ok: false, error: data.error?.message?.slice(0, 200) ?? 'A OpenRouter respondeu sem texto.' }
        return { ok: true, text }
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        return {
            ok: false,
            error: aborted
                ? 'A OpenRouter demorou demais para responder.'
                : 'Não deu para falar com a OpenRouter. Confira a conexão com a internet.'
        }
    }
}

/** Até 5 minutos de conversa: o resto da gravação fica de fora, para o pedido não ficar enorme. */
const SUMMARY_MAX_SAMPLES = SAMPLE_RATE * 300

/**
 * Resumo de uma chamada do modo SDR: a gravação (só da pasta gravacoes) vai em mono a 8 kHz para um
 * modelo que entende áudio. A interface manda só o caminho, e ele é conferido aqui.
 */
async function summarize(model: string, recording: string): Promise<AiResult> {
    // O caminho vem da interface: só arquivos .wav da pasta das gravações são lidos e enviados.
    const folder = resolve(join(app.getPath('userData'), 'gravacoes')) + sep
    const path = resolve(recording)
    if (!path.startsWith(folder) || !path.endsWith('.wav'))
        return { ok: false, error: 'Gravação fora da pasta das gravações.' }
    const key = await getSecret(KEY_ID)
    if (!key) return { ok: false, error: 'Cadastre a chave da OpenRouter antes de pedir o resumo.' }
    let wav: Buffer
    try {
        const pcm = parseWav(await fs.readFile(path)).subarray(0, SUMMARY_MAX_SAMPLES)
        const body = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
        wav = Buffer.concat([Buffer.from(wavHeader(body.length, 1)), body])
    } catch (error) {
        return { ok: false, error: `Não deu para ler a gravação: ${(error as Error).message}` }
    }
    try {
        const response = await request('/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/phs-santos/iris',
                'X-Title': 'Iris'
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Esta é a gravação de uma ligação de prospecção (o vendedor num canal, o cliente no outro). Escreva, em português, um resumo de no máximo três linhas para o CRM: o interesse do cliente, as objeções e o próximo passo combinado. Não invente o que não foi dito.'
                            },
                            { type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } }
                        ]
                    }
                ]
            })
        })
        const body = await response.text()
        if (!response.ok) return { ok: false, error: describe(response.status, body) }
        const data = JSON.parse(body) as {
            choices?: { message?: { content?: unknown } }[]
            error?: { message?: string }
        }
        const text = data.choices?.[0]?.message?.content
        if (typeof text !== 'string' || !text.trim())
            return {
                ok: false,
                error: data.error?.message?.slice(0, 200) ?? 'O modelo respondeu sem texto. Ele entende áudio?'
            }
        return { ok: true, text: text.trim().slice(0, 5000) }
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        return {
            ok: false,
            error: aborted ? 'A OpenRouter demorou demais para responder.' : 'Não deu para falar com a OpenRouter.'
        }
    }
}

async function models(): Promise<AiModel[]> {
    const response = await request('/models')
    if (!response.ok) throw new Error(describe(response.status, await response.text()))
    const data = (await response.json()) as { data?: { id?: unknown; name?: unknown }[] }
    return (data.data ?? [])
        .filter((m): m is { id: string; name?: unknown } => typeof m.id === 'string')
        .map((m) => ({ id: m.id, name: typeof m.name === 'string' ? m.name : m.id }))
}

export function registerAiIpc(): void {
    handle(IPC.aiStatus, () => status())
    handle(IPC.aiSetKey, async (_e, key: string | null) => {
        check(key === null || (isString(key, 500) && key.trim().length > 0), 'chave da OpenRouter')
        await setSecret(KEY_ID, key === null ? null : key.trim())
    })
    handle(IPC.aiSetOptions, async (_e, options: { model?: string; mask?: boolean }) => {
        check(
            isPlainObject(options) &&
                (options.model === undefined || isString(options.model, 200)) &&
                (options.mask === undefined || typeof options.mask === 'boolean'),
            'opções da IA'
        )
        await updateSettings((settings) => ({ ai: { ...settings.ai, ...options } }))
    })
    handle(IPC.aiModels, () => models())
    handle(IPC.aiSummarize, (_e, model: string, recording: string) => {
        check(isString(model, 200) && model.length > 0 && isString(recording, 2000), 'resumo da chamada')
        return summarize(model, recording)
    })
    handle(IPC.aiExplain, (_e, input: AiRequest) => {
        check(
            isPlainObject(input) &&
                isString(input.model, 200) &&
                input.model.length > 0 &&
                isString(input.question, 2000) &&
                isString(input.log, AI_MAX_CHARS),
            'pedido de explicação'
        )
        return explain(input)
    })
}
