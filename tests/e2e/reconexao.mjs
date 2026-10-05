// Reconexão (RNF-06, RF-08): derruba o contêiner do PBX e confere que as contas voltam sozinhas,
// tanto a que já estava registrada quanto a que tentou a primeira conexão com o PBX fora do ar.
// Uso: docker compose up -d && npm run build && node tests/e2e/reconexao.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const WSS = process.env.PBX_WS ?? 'wss://127.0.0.1:8089/ws'
const DOMAIN = process.env.PBX_DOMAIN ?? '127.0.0.1'
const CONTAINER = process.env.PBX_CONTAINER ?? 'iris-asterisk-1'
const userData = mkdtempSync(join(tmpdir(), 'iris-reconexao-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const docker = (command) => execSync(`docker ${command} ${CONTAINER}`, { stdio: 'pipe' })

const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const account = (name) => page.locator('.acc', { hasText: name })

async function addAccount(name, ext) {
    await page.getByRole('button', { name: '+ Nova' }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('textbox', { name: 'Nome' }).fill(name)
    await form.getByRole('textbox', { name: 'Ramal' }).fill(ext)
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill(DOMAIN)
    await form.getByLabel('Senha').fill('1234')
    await form.getByRole('textbox', { name: 'WebSocket (WSS)' }).fill(WSS)
    await form.getByRole('button', { name: 'Salvar e registrar' }).click()
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    await addAccount('PBX 1001', '1001')
    await page.getByRole('button', { name: 'Confiar neste host' }).click({ timeout: 10000 })
    await account('PBX 1001').locator('.dot.registered').waitFor({ timeout: 15000 })
    step('PBX 1001 registrada')

    docker('stop')
    await account('PBX 1001').locator('.dot:not(.registered)').waitFor({ timeout: 30000 })
    step('PBX fora do ar: a conta deixou de estar registrada')

    // Primeira conexão com o PBX fora do ar: antes ficava em erro até alguém clicar em Registrar.
    await addAccount('PBX 1002', '1002')
    await account('PBX 1002').getByText('tentando de novo').waitFor({ timeout: 20000 })
    step('PBX 1002 falhou na primeira conexão e agendou nova tentativa')

    docker('start')
    await account('PBX 1001').locator('.dot.registered').waitFor({ timeout: 120000 })
    step('PBX 1001 voltou a registrada sem ninguém clicar')
    await account('PBX 1002').locator('.dot.registered').waitFor({ timeout: 120000 })
    step('PBX 1002 registrou na nova tentativa')
    if (await account('PBX 1002').getByText('tentando de novo').count())
        throw new Error('a conta registrada ainda mostra "tentando de novo"')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
    // O PBX volta a ficar no ar mesmo se o teste parar no meio.
    try {
        docker('start')
    } catch {
        // sem Docker: nada a religar
    }
}
if (failed) process.exit(1)
console.log('Reconexão OK')
