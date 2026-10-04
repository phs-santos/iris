import { app, safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Account, AccountsFile, Scenario, ScenariosFile, Settings } from '@shared/types'

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
/** Formato antigo, cifrado pelo cofre do sistema: lido uma vez e migrado (RNF-19). */
const LEGACY_SECRETS_FILE = 'secrets.json'
const memorySecrets = new Map<string, string>()
let keyPromise: Promise<Buffer> | null = null
let queue: Promise<unknown> = Promise.resolve()

/** Uma operação de cada vez: as contas registram juntas e duas gravações ao mesmo tempo perdem senhas. */
function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
}

/** Lê a chave local ou cria uma na primeira vez. */
function localKey(): Promise<Buffer> {
    keyPromise ??= (async () => {
        const path = file(KEY_FILE)
        try {
            const key = await fs.readFile(path)
            if (key.length === 32) return key
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await fs.mkdir(dataDir(), { recursive: true })
        const key = randomBytes(32)
        await fs.writeFile(path, key, { mode: 0o600 })
        return key
    })()
    return keyPromise
}

async function encrypt(text: string): Promise<string> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', await localKey(), iv)
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

async function decrypt(encoded: string): Promise<string | null> {
    try {
        const raw = Buffer.from(encoded, 'base64')
        const decipher = createDecipheriv('aes-256-gcm', await localKey(), raw.subarray(0, 12))
        decipher.setAuthTag(raw.subarray(12, 28))
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    } catch {
        // Chave trocada ou arquivo mexido: a senha precisa ser digitada de novo.
        return null
    }
}

async function readSecrets(): Promise<LocalSecretsFile> {
    const data = await readJson<LocalSecretsFile>(SECRETS_FILE)
    return { schemaVersion: 1, entries: { ...(data?.entries ?? {}) } }
}

async function writeSecrets(data: LocalSecretsFile): Promise<void> {
    await writeJson(SECRETS_FILE, data)
    await fs.chmod(file(SECRETS_FILE), 0o600)
}

/**
 * Traz uma senha do formato antigo. Só acontece com quem usou uma versão até a 1.0.5, e pode
 * mostrar o pedido de senha do sistema uma última vez. Se falhar, a senha é pedida de novo na tela.
 */
async function migrateLegacy(accountId: string): Promise<string | null> {
    const legacy = await readJson<Record<string, string>>(LEGACY_SECRETS_FILE)
    const encrypted = legacy?.[accountId]
    if (!legacy || !encrypted) return null
    let password: string | null = null
    try {
        if (await safeStorage.isAsyncEncryptionAvailable())
            password = (await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'))).result
    } catch {
        password = null
    }
    if (password !== null) await storeSecret(accountId, password)
    delete legacy[accountId]
    if (Object.keys(legacy).length) await writeJson(LEGACY_SECRETS_FILE, legacy)
    else await fs.rm(file(LEGACY_SECRETS_FILE), { force: true })
    return password
}

/** O arquivo local sempre existe; o canal continua para a interface não mudar. */
export function encryptionAvailable(): Promise<boolean> {
    return Promise.resolve(true)
}

export function getSecret(accountId: string): Promise<string | null> {
    return serial(async () => {
        if (memorySecrets.has(accountId)) return memorySecrets.get(accountId) ?? null
        const encoded = (await readSecrets()).entries[accountId]
        const password = encoded ? await decrypt(encoded) : await migrateLegacy(accountId)
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
}
