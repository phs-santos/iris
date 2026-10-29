// Modos (pedido do usuário em 05/10/2026): sem nada ligado, só o padrão de chamada aparece; a área
// secreta abre com cinco cliques no logo e liga cada modo. Uso: npm run build && node tests/e2e/modos.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
// Sem IRIS_MODES: o app abre como para quem acabou de instalar.
const env = { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
delete env.IRIS_MODES
const app = await electron.launch({ args, env })
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const absent = async (locator, what) => {
    if (await locator.count()) throw new Error(`${what} deveria estar escondido`)
}
const settings = () => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.getByRole('tab', { name: 'Telefone' }).waitFor()
    await absent(page.getByRole('tab', { name: 'Eventos' }), 'o log')
    await absent(page.getByRole('button', { name: 'Ligar com vídeo' }), 'o botão de vídeo')
    await absent(page.getByRole('button', { name: 'cabeçalhos SIP' }), 'os cabeçalhos SIP')
    await page.getByRole('tab', { name: 'Contatos' }).waitFor()
    await page.locator('.acc', { hasText: 'Suporte 1001' }).locator('.row').click()
    await page.getByRole('button', { name: /^Mais ações de Suporte/ }).click()
    await page.getByRole('menuitem', { name: 'Duplicar' }).waitFor()
    await absent(page.getByRole('menuitem', { name: 'Saúde' }), 'a Saúde no menu da conta')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+,')
    const dialog = page.getByRole('dialog', { name: 'Configurações' })
    await dialog.getByRole('tab', { name: 'Perfil' }).waitFor()
    await absent(dialog.getByRole('tab', { name: 'Modos' }), 'a área dos modos')
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    step('sem modos ligados: só contas, telefone e contatos; log, vídeo e diagnóstico escondidos')

    // Quatro cliques não abrem; o quinto, sim.
    const logo = page.locator('.brand')
    for (let i = 0; i < 4; i++) await logo.click()
    await page.waitForTimeout(200)
    await absent(dialog, 'as Configurações com quatro cliques')
    await logo.click()
    await dialog.getByRole('tab', { name: 'Modos', selected: true }).waitFor()
    step('cinco cliques seguidos no logo abrem a área secreta')

    await dialog.getByLabel('Log e diagnóstico').check()
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.getByRole('tab', { name: 'Eventos' }).waitFor()
    await page.getByRole('button', { name: 'cabeçalhos SIP' }).waitFor()
    const saved = settings().modes
    if (!saved?.enabled?.log || !saved.unlocked) throw new Error(`modos gravados errado: ${JSON.stringify(saved)}`)
    step('ligar o Log mostra o log e os cabeçalhos, e fica gravado')

    // Esconder a área tira a seção, mas os modos ligados continuam; Ctrl+Alt+Shift+M volta.
    await page.keyboard.press('ControlOrMeta+,')
    await dialog.getByRole('tab', { name: 'Modos' }).click()
    await dialog.getByRole('button', { name: 'Esconder esta área' }).click()
    await dialog.getByRole('tab', { name: 'Perfil', selected: true }).waitFor()
    await absent(dialog.getByRole('tab', { name: 'Modos' }), 'a área depois de esconder')
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.getByRole('tab', { name: 'Eventos' }).waitFor()
    await page.keyboard.press('Control+Alt+Shift+M')
    await dialog.getByRole('tab', { name: 'Modos', selected: true }).waitFor()
    await dialog.getByLabel('Log e diagnóstico').uncheck()
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await absent(page.getByRole('tab', { name: 'Eventos' }), 'o log desligado')
    step('esconder a área mantém os modos; o atalho reabre; desligar tira o log')

    console.log('Modos OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
