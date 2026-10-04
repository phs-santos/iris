import { app, safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Account, AccountsFile, Scenario, ScenariosFile, SecretsStatus, Settings } from '@shared/types'

const dataDir = (): string => app.getPath('userData')
const file = (name: string): string => join(dataDir(), name)

async function readJson<T>(name: string): Promise<T | null> {
    try {
        return JSON.parse(await fs.readFile(file(name), 'utf8')) as T
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
    }
}

/** Grava em arquivo temporário e renomeia, para não corromper o JSON se o app cair no meio. */
async function writeJson(name: string, value: unknown): Promise<void> {
    await fs.mkdir(dataDir(), { recursive: true })
    const target = file(name)
    const tmp = `${target}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(tmp, target)
}

export async function loadAccounts(): Promise<Account[]> {
    const data = await readJson<AccountsFile>('accounts.json')
    if (!data) return []
    // Única versão até agora; novas versões de esquema migram aqui (RNF-19).
    return Array.isArray(data.accounts) ? data.accounts : []
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
    const data: AccountsFile = { schemaVersion: 1, accounts }
    await writeJson('accounts.json', data)
}

export async function loadScenarios(): Promise<Scenario[]> {
    const data = await readJson<ScenariosFile>('scenarios.json')
    return Array.isArray(data?.scenarios) ? data.scenarios : []
}

export async function saveScenarios(scenarios: Scenario[]): Promise<void> {
    const data: ScenariosFile = { schemaVersion: 1, scenarios }
    await writeJson('scenarios.json', data)
}

const defaultSettings: Settings = { schemaVersion: 1, trustedHosts: [] }

export async function loadSettings(): Promise<Settings> {
    const data = await readJson<Settings>('settings.json')
    return { ...defaultSettings, ...(data ?? {}) }
}

export async function saveSettings(settings: Settings): Promise<void> {
    await writeJson('settings.json', settings)
}

// ─── Senhas ────────────────────────────────────────────────────────────────
// Guardadas num arquivo local da pasta de dados (`senhas.json`), cifradas com AES-256-GCM por uma
// chave aleatória em `chave-local.bin`; os dois só podem ser lidos pelo usuário (0600). Decisão do
// usuário em 04/10/2026 (RNF-07): o cofre do sistema pedia a senha de login do macOS a cada versão
// nova, porque o app não é assinado. A cifra evita que a senha apareça ao abrir ou copiar só o
// arquivo de senhas; quem tem acesso à pasta de dados inteira consegue ler as duas coisas.

interface LocalSecretsFile {
    schemaVersion: 1
    /** id → base64 de iv (12 bytes) + etiqueta (16 bytes) + texto cifrado. */
    entries: Record<string, string>
}

const SECRETS_FILE = 'senhas.json'
const KEY_FILE = 'chave-local.bin'
/** Formato antigo, cifrado pelo cofre do sistema: migrado ao abrir o app (RNF-19). */
const LEGACY_SECRETS_FILE = 'secrets.json'
const memorySecrets = new Map<string, string>()
let keyPromise: Promise<Buffer> | null = null
let queue: Promise<unknown> = Promise.resolve()
/** Problemas encontrados nesta execução, mostrados na tela por `secretsStatus`. */
const problems = new Set<string>()

/** Uma operação de cada vez: as contas registram juntas e duas gravações ao mesmo tempo perdem senhas. */
function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
}

/** Sufixo para guardar um arquivo estragado ao lado do original, sem apagar nada. */
const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

/** Tira um arquivo do caminho, guardando uma cópia para recuperar à mão. */
async function setAside(name: string, reason: string): Promise<void> {
    await fs.rename(file(name), file(`${name}.${reason}-${stamp()}`)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
}

/**
 * Lê a chave local ou cria uma na primeira vez. Uma chave estragada nunca é sobrescrita: ela e o
 * arquivo de senhas vão para o lado, e as senhas são pedidas de novo.
 */
function localKey(): Promise<Buffer> {
    if (keyPromise) return keyPromise
    keyPromise = (async () => {
        const path = file(KEY_FILE)
        try {
            const key = await fs.readFile(path)
            if (key.length === 32) return key
            await setAside(KEY_FILE, 'invalida')
            await lostKey(`A chave das senhas (${KEY_FILE}) estava estragada e foi guardada à parte`)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            // Sem a chave, as senhas já gravadas não abrem mais.
            await lostKey(`A chave das senhas (${KEY_FILE}) sumiu`)
        }
        await fs.mkdir(dataDir(), { recursive: true })
        const key = randomBytes(32)
        await fs.writeFile(path, key, { mode: 0o600, flag: 'wx' })
        return key
    })()
    // Um erro de leitura (permissão, disco) não fica guardado: a próxima operação tenta de novo.
    keyPromise.catch(() => (keyPromise = null))
    return keyPromise
}

/** Guarda à parte o arquivo de senhas que dependia de uma chave perdida, e avisa. */
async function lostKey(what: string): Promise<void> {
    if (!(await exists(SECRETS_FILE))) return
    await setAside(SECRETS_FILE, 'sem-chave')
    problems.add(`${what}, e o ${SECRETS_FILE} foi guardado à parte. Digite as senhas das contas de novo.`)
}

async function encrypt(text: string): Promise<string> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', await localKey(), iv)
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

async function decrypt(encoded: string): Promise<string | null> {
    const key = await localKey()
    try {
        const raw = Buffer.from(encoded, 'base64')
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
        decipher.setAuthTag(raw.subarray(12, 28))
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    } catch {
        // Entrada mexida: a senha precisa ser digitada de novo.
        return null
    }
}

/** Um `senhas.json` que não é JSON vai para o lado; as contas seguem e pedem a senha de novo. */
async function readSecrets(): Promise<LocalSecretsFile> {
    await localKey()
    let data: Partial<LocalSecretsFile> | null
    try {
        data = await readJson<LocalSecretsFile>(SECRETS_FILE)
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        data = null
    }
    if (data !== null && (typeof data !== 'object' || typeof data.entries !== 'object' || data.entries === null))
        data = null
    if (data === null && (await exists(SECRETS_FILE))) {
        await setAside(SECRETS_FILE, 'corrompido')
        problems.add(
            `O arquivo de senhas (${SECRETS_FILE}) estava estragado e foi guardado à parte. Digite as senhas das contas de novo.`
        )
    }
    return { schemaVersion: 1, entries: { ...(data?.entries ?? {}) } }
}

async function exists(name: string): Promise<boolean> {
    return fs.access(file(name)).then(
        () => true,
        () => false
    )
}

async function writeSecrets(data: LocalSecretsFile): Promise<void> {
    await writeJson(SECRETS_FILE, data)
    await fs.chmod(file(SECRETS_FILE), 0o600)
}

async function readLegacy(): Promise<Record<string, string> | null> {
    try {
        return await readJson<Record<string, string>>(LEGACY_SECRETS_FILE)
    } catch {
        return null
    }
}

async function writeLegacy(legacy: Record<string, string>): Promise<void> {
    if (Object.keys(legacy).length) await writeJson(LEGACY_SECRETS_FILE, legacy)
    else await fs.rm(file(LEGACY_SECRETS_FILE), { force: true })
}

/**
 * Traz as senhas do formato antigo (até a 1.0.5) para o arquivo local, todas de uma vez, ao abrir o
 * app. Pode mostrar o pedido de senha do sistema. Só apaga do arquivo antigo o que foi lido; se o
 * usuário negar o pedido, as senhas continuam lá e a migração tenta de novo na próxima abertura.
 */
export function migrateLegacySecrets(): Promise<SecretsStatus> {
    return serial(async () => {
        const legacy = await readLegacy()
        if (!legacy) return status()
        const data = await readSecrets()
        let failed = 0
        for (const [id, encrypted] of Object.entries(legacy)) {
            if (data.entries[id]) {
                // Já existe senha nova para esta conta: a antiga não serve mais.
                delete legacy[id]
                continue
            }
            try {
                if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('cofre indisponível')
                const { result } = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'))
                data.entries[id] = await encrypt(result)
                memorySecrets.set(id, result)
                delete legacy[id]
            } catch {
                failed++
            }
        }
        await writeSecrets(data)
        await writeLegacy(legacy)
        if (failed)
            problems.add(
                `${failed === 1 ? 'Uma senha salva' : `${failed} senhas salvas`} por uma versão anterior não ${failed === 1 ? 'pôde' : 'puderam'} ser lida${failed === 1 ? '' : 's'} do cofre do sistema. A Íris tenta de novo na próxima abertura; se preferir, digite a senha na conta.`
            )
        return status()
    })
}

async function status(): Promise<SecretsStatus> {
    return { legacy: (await readLegacy()) !== null, problem: [...problems].join(' ') || null }
}

/** Situação do arquivo de senhas, para os avisos da tela. Não mostra o pedido de senha do sistema. */
export function secretsStatus(): Promise<SecretsStatus> {
    return serial(async () => {
        // Abre a chave e o arquivo, para que um problema neles já apareça no aviso.
        await readSecrets()
        return status()
    })
}

export function getSecret(accountId: string): Promise<string | null> {
    return serial(async () => {
        if (memorySecrets.has(accountId)) return memorySecrets.get(accountId) ?? null
        const encoded = (await readSecrets()).entries[accountId]
        const password = encoded ? await decrypt(encoded) : null
        if (password !== null) memorySecrets.set(accountId, password)
        return password
    })
}

export function setSecret(accountId: string, password: string | null, persist = true): Promise<void> {
    if (password === null) memorySecrets.delete(accountId)
    else memorySecrets.set(accountId, password)
    return persist ? serial(() => storeSecret(accountId, password)) : Promise.resolve()
}

async function storeSecret(accountId: string, password: string | null): Promise<void> {
    const data = await readSecrets()
    if (password === null) delete data.entries[accountId]
    else data.entries[accountId] = await encrypt(password)
    await writeSecrets(data)
    // A senha digitada vale mais que a antiga: não pergunta mais ao cofre do sistema por ela.
    const legacy = await readLegacy()
    if (legacy && accountId in legacy) {
        delete legacy[accountId]
        await writeLegacy(legacy)
    }
}
