import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
vi.mock('electron', () => ({ app: { getPath: () => dir } }))

import { discardLegacyData, isLegacyFile, LEGACY_FILES, loadAccounts } from '../src/main/storage'

const write = (name: string, data: unknown): void =>
    writeFileSync(join(dir, name), typeof data === 'string' ? data : JSON.stringify(data))

describe('dados de versões anteriores à 2.0', () => {
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'iris-antigos-'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('arquivo sem schemaVersion ou com 1 é antigo', () => {
        expect(isLegacyFile({ accounts: [] })).toBe(true)
        expect(isLegacyFile({ schemaVersion: 1, accounts: [] })).toBe(true)
    })

    it('schemaVersion 2 não é', () => {
        expect(isLegacyFile({ schemaVersion: 2, accounts: [] })).toBe(false)
        // O que não é objeto segue o caminho de arquivo estragado.
        expect(isLegacyFile(null)).toBe(false)
        expect(isLegacyFile([1, 2, 3])).toBe(false)
    })

    it('com um accounts.json antigo, todos os arquivos de dados somem', async () => {
        write('accounts.json', { schemaVersion: 1, accounts: [{ id: 'a', simulated: true }] })
        write('settings.json', { schemaVersion: 2, trustedHosts: [] })
        for (const name of LEGACY_FILES.filter((n) => n !== 'accounts.json' && n !== 'settings.json')) write(name, '{}')
        write('outro.txt', 'fica')

        expect(await discardLegacyData()).toBe(true)
        for (const name of LEGACY_FILES) expect(existsSync(join(dir, name)), name).toBe(false)
        expect(existsSync(join(dir, 'outro.txt'))).toBe(true)
        expect(await loadAccounts()).toEqual([])
    })

    it('arquivos da 2.0 ficam como estão', async () => {
        const accounts = { schemaVersion: 2, accounts: [{ id: 'a' }] }
        write('accounts.json', accounts)
        write('contacts.json', { schemaVersion: 2, contacts: [] })
        write('history.json', '[]')
        write('senhas.json', '{}')

        expect(await discardLegacyData()).toBe(false)
        for (const name of ['accounts.json', 'contacts.json', 'history.json', 'senhas.json'])
            expect(existsSync(join(dir, name)), name).toBe(true)
        expect(await loadAccounts()).toEqual(accounts.accounts)
    })

    it('instalação nova não apaga nada nem falha', async () => {
        expect(await discardLegacyData()).toBe(false)
    })

    it('arquivo que não é JSON não conta como antigo', async () => {
        write('accounts.json', '{ isto não é JSON')
        write('senhas.json', '{}')
        expect(await discardLegacyData()).toBe(false)
        expect(existsSync(join(dir, 'senhas.json'))).toBe(true)
    })
})
