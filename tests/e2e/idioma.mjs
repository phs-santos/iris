// Interface em inglês (RF-56), no modo simulado: troca na hora, vale para as telas e o guia, fica
// gravada e volta ao português. Uso: npm run build && node tests/e2e/idioma.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const launch = () => electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
let app = await launch()
let page = await app.firstWindow()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
const step = (msg) => console.log(`✓ ${msg}`)

/**
 * Texto da tela fora do que continua em português de propósito: as linhas do log, o resultado das
 * chamadas e os nomes das contas de exemplo.
 */
const screenText = () =>
    page.evaluate(() => {
        const clone = document.body.cloneNode(true)
        clone
            .querySelectorAll('.log, .line, .acc .name, .status, option, .chip, .end, .sub')
            .forEach((el) => el.remove())
        return clone.innerText
    })
/** Palavras que só existem no português da interface. */
const PORTUGUESE =
    /\b(Configurações|Telefone|Contatos|Mensagens|Histórico|Cenários|Contas|Ligar|Guia|Registrar|Fechar|Aparência|Idioma|Notificações|Servidores|Atalhos|Nenhum|Número|chamadas|registradas)\b/
async function expectEnglish(where) {
    const text = await screenText()
    const found = PORTUGUESE.exec(text)
    if (found) throw new Error(`${where}: sobrou "${found[0]}" em português`)
}

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.getByRole('button', { name: 'Fechar os primeiros passos' }).click()
    await page.keyboard.press('ControlOrMeta+,')
    let dialog = page.getByRole('dialog', { name: 'Configurações' })
    await dialog.getByRole('tab', { name: 'Aparência' }).click()
    await dialog.getByLabel('Idioma').selectOption('en')

    // As telas são refeitas em inglês, com as Configurações de volta em Appearance.
    dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: 'Appearance', selected: true }).waitFor()
    await dialog.getByText('Accent color', { exact: true }).waitFor()
    if ((await page.evaluate(() => document.documentElement.lang)) !== 'en')
        throw new Error('o lang da página não mudou')
    for (const name of [
        'Profile',
        'Audio',
        'Notifications',
        'Shortcuts and links',
        'Servers',
        'Connection',
        'AI help',
        'Certificates',
        'Import and export'
    ]) {
        await dialog.getByRole('tab', { name, exact: true }).click()
        await expectEnglish(`Settings › ${name}`)
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    step('trocar para inglês refaz as telas na hora; todas as seções das Configurações em inglês')

    for (const name of ['Phone', 'Contacts', 'Messages', 'Scenarios', 'History']) {
        await page.getByRole('tab', { name, exact: true }).click()
        await expectEnglish(`aba ${name}`)
    }
    await page.getByRole('tab', { name: 'Phone', exact: true }).click()
    step('abas Phone, Contacts, Messages, Scenarios e History em inglês')

    // Uma chamada: os botões e o estado do cartão em inglês.
    await page.locator('.chip', { hasText: '1002' }).click()
    const outgoing = page.locator('.call', { hasText: '→' })
    await outgoing.locator('.pill', { hasText: 'in call' }).waitFor({ timeout: 8000 })
    await outgoing.getByRole('button', { name: 'Mute', exact: true }).click()
    await outgoing.getByRole('button', { name: 'Unmute' }).waitFor()
    await outgoing.getByRole('button', { name: 'Hang up' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.call').length === 0, null, { timeout: 15000 })
    step('cartão de chamada com estado e botões em inglês')

    await page.getByRole('button', { name: 'New', exact: false }).first().click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Extension', { exact: true }).waitFor()
    await expectEnglish('formulário de conta')
    await page.keyboard.press('Escape')

    await page.keyboard.press('F1')
    const guide = page.getByRole('dialog', { name: 'Íris guide' })
    await guide.getByRole('heading', { name: 'What Íris is' }).waitFor()
    await guide.getByLabel('Search the guide').fill('play/pause')
    await guide.getByRole('heading', { name: 'Keyboard shortcuts' }).waitFor()
    await page.keyboard.press('Escape')
    step('formulário de conta e guia em inglês, com a busca do guia')

    await page.getByRole('button', { name: 'Phone mode' }).click()
    await page.getByRole('button', { name: 'Bench', exact: true }).waitFor()
    await expectEnglish('modo Telefone')
    await page.getByRole('button', { name: 'Bench', exact: true }).click()
    step('modo Telefone em inglês')

    const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
    if (saved.appearance?.language !== 'en') throw new Error('o idioma não foi gravado')

    // Fechar e abrir: continua em inglês. Depois volta ao português.
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.getByRole('tab', { name: 'Phone', exact: true }).waitFor()
    await page.keyboard.press('ControlOrMeta+,')
    dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: 'Appearance' }).click()
    await dialog.getByLabel('Language').selectOption('pt-BR')
    await page.getByRole('dialog', { name: 'Configurações' }).getByText('Cor de destaque', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Telefone', exact: true }).waitFor()
    const back = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
    if (back.appearance?.language !== undefined) throw new Error('o português deveria tirar o campo do arquivo')
    step('o idioma fica gravado, vale ao abrir de novo e volta ao português')

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('Idioma OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
