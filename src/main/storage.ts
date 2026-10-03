import { app, safeStorage } from 'electron'
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
// Guardadas com a criptografia do sistema (Keychain, DPAPI, libsecret). Quando o
// sistema não oferece criptografia, a senha fica só na memória desta execução:
// nunca vai para o disco em texto puro (RNF-07).

type SecretsFile = Record<string, string>
const memorySecrets = new Map<string, string>()

export function encryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
}

export async function getSecret(accountId: string): Promise<string | null> {
    if (memorySecrets.has(accountId)) return memorySecrets.get(accountId) ?? null
    if (!encryptionAvailable()) return null
    const secrets = (await readJson<SecretsFile>('secrets.json')) ?? {}
    const encrypted = secrets[accountId]
    if (!encrypted) return null
    const password = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    memorySecrets.set(accountId, password)
    return password
}

export async function setSecret(accountId: string, password: string | null): Promise<void> {
    if (password === null) memorySecrets.delete(accountId)
    else memorySecrets.set(accountId, password)
    if (!encryptionAvailable()) return
    const secrets = (await readJson<SecretsFile>('secrets.json')) ?? {}
    if (password === null) delete secrets[accountId]
    else secrets[accountId] = safeStorage.encryptString(password).toString('base64')
    await writeJson('secrets.json', secrets)
}
