// Toque por conta e volume do toque (RF-55), no modo simulado.
// Uso: npm run build && node tests/e2e/toques.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { abrirSeletor, esperarContasSimuladas, linhaDaConta, seletor } from './helpers/tela.mjs'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
const step = (msg) => console.log(`✓ ${msg}`)
const settings = () => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))

try {
    await esperarContasSimuladas(page)

    // Volume do toque: vale na hora e fica gravado.
    await page.keyboard.press('ControlOrMeta+,')
    const dialog = page.getByRole('dialog', { name: 'Configurações' })
    await dialog.getByRole('tab', { name: 'Áudio' }).click()
    await dialog.getByLabel('Volume do toque').fill('80')
    await dialog.getByText('Volume do toque: 80%').waitFor()
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.waitForFunction(() => true)
    if (settings().ringVolume !== 80) throw new Error('o volume do toque não foi gravado')
    step('volume do toque gravado')

    // Toque por conta: a escolha vai para accounts.json; o clássico não grava campo nenhum.
    await abrirSeletor(page)
    await linhaDaConta(page, 'Suporte 1001').hover()
    await seletor(page).getByRole('button', { name: 'Editar Suporte 1001' }).click()
    const form = page.locator('form.dialog')
    await form.getByLabel('Toque das chamadas recebidas').selectOption('sino')
    await form.getByRole('button', { name: 'Ouvir' }).click()
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    const saved = JSON.parse(readFileSync(join(userData, 'accounts.json'), 'utf8')).accounts
    if (saved.find((a) => a.name === 'Suporte 1001')?.ringtone !== 'sino') throw new Error('o toque não foi gravado')
    if (saved.some((a) => a.name !== 'Suporte 1001' && a.ringtone)) throw new Error('toque gravado em conta errada')
    step('toque por conta escolhido, ouvido e gravado')

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('Toques OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
