// Notificações do sistema, no modo simulado: chamada recebida (com Atender pela notificação), chamada
// perdida, a escolha em Configurações → Notificações e o botão de teste. Cada aviso deixa uma linha no
// log interno; é por ela que o teste sabe que a notificação saiu.
// Uso: npm run build && node tests/e2e/notificacoes.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/notificacoes.mjs)
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-notificacoes-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const notices = () =>
    readFileSync(join(userData, 'logs', 'iris.log'), 'utf8')
        .split('\n')
        .filter((line) => line.includes(' Notificação '))
const account = (name) => page.locator('.acc', { hasText: name })

/** Liga de Vendas 1002 para Suporte 1001, que não tem auto-atender, e espera tocar. */
async function ring() {
    await account('Vendas 1002').locator('.row').click()
    await page.getByLabel('Número').fill('1001')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    await page.getByRole('region', { name: /Chamada recebida de/ }).waitFor({ timeout: 8000 })
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()

    await ring()
    await page.waitForTimeout(300)
    const incoming = notices().find((line) => line.includes('Notificação incoming: Suporte 1001 está tocando'))
    if (!incoming) throw new Error(`a notificação de chamada recebida não saiu:\n${notices().join('\n')}`)
    step('chamada recebida gera notificação')

    // Clicar em Atender na notificação: o processo principal manda a ação para a interface.
    const callId = /\(([^)]+)\)$/.exec(incoming)[1]
    await app.evaluate(({ BrowserWindow }, id) => {
        BrowserWindow.getAllWindows()[0].webContents.send('app:notify-action', id, 'answer')
    }, callId)
    await page
        .locator('.call', { hasText: /1001\s*←\s*1002/ })
        .locator('.pill', { hasText: 'em chamada' })
        .waitFor()
    step('Atender na notificação atende a chamada')
    await page
        .locator('.call', { hasText: /1001\s*←\s*1002/ })
        .getByRole('button', { name: 'Desligar' })
        .click()
    await page.locator('.pill', { hasText: 'encerrada' }).nth(1).waitFor()

    // Quem liga desiste antes de atender: chamada perdida.
    await ring()
    await page
        .locator('.call', { hasText: /1002\s*→\s*1001/ })
        .getByRole('button', { name: 'Desligar' })
        .click()
    await page.waitForTimeout(500)
    if (!notices().some((line) => line.includes('Notificação missed: Chamada perdida em Suporte 1001')))
        throw new Error(`a notificação de chamada perdida não saiu:\n${notices().join('\n')}`)
    step('desistir antes de atender gera "chamada perdida"')

    // Desligar o aviso de chamada recebida em Configurações → Notificações.
    await page.getByRole('button', { name: 'Configurações' }).click()
    const settings = page.getByRole('dialog')
    await settings.getByRole('tab', { name: 'Notificações' }).click()
    await settings
        .getByText('Chamada recebida', { exact: true })
        .locator('xpath=ancestor::label')
        .locator('input')
        .uncheck()
    await settings.getByRole('button', { name: 'Testar notificação' }).click()
    await settings.getByText('Não apareceu?').waitFor()
    await settings.getByRole('button', { name: 'Fechar' }).first().click()
    if (!notices().some((line) => line.includes('Se você está lendo') || line.includes('registration: Íris')))
        throw new Error('o botão de teste não mandou notificação')
    step('o botão Testar notificação manda um aviso')
    const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
    if (saved.notifications?.enabled?.incoming !== false) throw new Error('a escolha não foi salva')

    const before = notices().filter((line) => line.includes('incoming')).length
    await page.getByRole('tab', { name: 'Telefone' }).click()
    await ring()
    await page.waitForTimeout(300)
    if (notices().filter((line) => line.includes('incoming')).length !== before)
        throw new Error('a notificação de chamada recebida saiu mesmo desligada')
    step('com o aviso desligado em Configurações, a chamada toca sem notificação')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('Notificações OK')
