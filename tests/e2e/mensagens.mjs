// Mensagens de texto por SIP MESSAGE (RF-54), no modo simulado.
// Uso: npm run build && node tests/e2e/mensagens.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const launch = () =>
    electron.launch({
        args,
        env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
    })
let app = await launch()
let page = await app.firstWindow()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
const step = (msg) => console.log(`✓ ${msg}`)
const stored = () => JSON.parse(readFileSync(join(userData, 'messages.json'), 'utf8')).messages

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.locator('.acc', { hasText: 'Suporte 1001' }).locator('.row').click()
    await page.getByRole('tab', { name: 'Mensagens' }).click()
    await page.getByText('Nenhuma conversa ainda').waitFor()

    // 1001 escreve para 1002: as duas contas estão neste app, então aparecem as duas pontas.
    await page.getByLabel('Nova conversa com o ramal').fill('1002')
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    const box = page.getByLabel('Mensagem', { exact: true })
    await box.fill('Olá, Vendas')
    await page.keyboard.press('Enter')
    const log = page.getByRole('log')
    await log.locator('.bubble.out', { hasText: 'Olá, Vendas' }).waitFor()
    const other = page.getByRole('button', { name: /Suporte.*1001 · Vendas 1002/s })
    await other.waitFor()
    await page.getByRole('tab', { name: /Mensagens\s*1/ }).waitFor()
    await page.getByText(/Vendas 1002 · mensagem de/).waitFor()
    step('mensagem enviada chega à outra conta, com aviso e contagem de não lidas')

    // Abrir a conversa do outro lado tira o "não lida"; a resposta volta para a primeira.
    await other.click()
    await log.locator('.bubble.in', { hasText: 'Olá, Vendas' }).waitFor()
    await page.getByRole('tab', { name: /^Mensagens$/ }).waitFor()
    await box.fill('Oi! Em que posso ajudar?\nSegunda linha')
    await page.getByRole('button', { name: 'Enviar' }).click()
    await log.locator('.bubble.out', { hasText: 'Segunda linha' }).waitFor()
    await page.getByRole('tab', { name: /Mensagens\s*1/ }).waitFor()
    step('responder pela outra conta; ler a conversa zera as não lidas')

    // Shift+Enter quebra a linha em vez de mandar.
    await box.fill('linha 1')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('linha 2')
    if (!(await box.inputValue()).includes('\n')) throw new Error('Shift+Enter não quebrou a linha')
    await box.fill('')

    // Ramal que não existe: a mensagem fica marcada com a resposta do PBX.
    await page.getByLabel('Nova conversa com o ramal').fill('1999')
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await box.fill('tem alguém aí?')
    await page.keyboard.press('Enter')
    await log.getByText('não entregue: 404 Not Found').waitFor()
    await page.getByLabel('Nova conversa com o ramal').fill('10 02')
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await page.getByText('Use só o ramal ou o número, sem espaços.').waitFor()
    step('ramal inexistente mostra "não entregue" com o motivo; ramal com espaço é recusado')

    // Mensagem grande demais para um SIP MESSAGE não sai.
    await box.fill('x'.repeat(1400))
    await page.getByText(/A mensagem tem 1400 bytes/).waitFor()
    if (!(await page.getByRole('button', { name: 'Enviar' }).isDisabled()))
        throw new Error('mensagem grande demais deveria travar o Enviar')
    await box.fill('')
    step('mensagem acima de 1300 bytes não é enviada')

    const saved = stored()
    if (saved.length !== 5) throw new Error(`esperava 5 mensagens gravadas, há ${saved.length}`)
    if (!saved.some((m) => m.failed === '404 Not Found')) throw new Error('a falha não foi gravada')
    if (saved.filter((m) => m.unread).length !== 1) throw new Error('não lidas gravadas errado')

    // Fechar e abrir: as conversas continuam, com a não lida.
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.getByRole('tab', { name: /Mensagens\s*1/ }).click()
    await page.getByRole('list', { name: 'Conversas' }).getByRole('button').nth(2).waitFor()
    step('as conversas ficam em messages.json e voltam ao abrir o app')

    // Apagar a conversa pede confirmação.
    await page.getByRole('button', { name: /1999/ }).click()
    await page.getByRole('button', { name: 'Apagar conversa' }).click()
    await page.getByRole('button', { name: 'Apagar tudo' }).click()
    await page.getByRole('button', { name: /1999/ }).waitFor({ state: 'detached' })
    if (stored().some((m) => m.peer === '1999')) throw new Error('a conversa apagada continua no arquivo')
    step('apagar a conversa tira as mensagens do arquivo')

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('Mensagens OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
