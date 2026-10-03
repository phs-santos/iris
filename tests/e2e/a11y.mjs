// Acessibilidade (RNF-12): varre as telas com o axe-core (regras WCAG 2.1 A e AA) e confere que
// as ações principais têm atalho. Uso: npm run build && node tests/e2e/a11y.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const userData = mkdtempSync(join(tmpdir(), 'iris-a11y-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const problems = []

async function scan(name) {
    await page.waitForTimeout(300)
    if (!(await page.evaluate(() => Boolean(window.axe)))) await page.evaluate(axeSource)
    const result = await page.evaluate(() =>
        window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    )
    for (const v of result.violations) {
        problems.push(`[${name}] ${v.id} (${v.impact}): ${v.help}`)
        for (const node of v.nodes.slice(0, 4))
            problems.push(`    ${node.target.join(' ')} · ${node.failureSummary.split('\n').slice(1).join(' ').trim()}`)
    }
    if (result.violations.length) console.log(`✗ ${name}: ${result.violations.length} regras violadas`)
    else step(`${name}: nenhuma violação WCAG A/AA`)
}

try {
    await page.getByText('3 contas').waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()
    await scan('tela principal')

    await page.locator('.chip', { hasText: '1002' }).click()
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 5000 })
    await page.locator('.call', { hasText: '→' }).getByRole('button', { name: 'DTMF' }).click()
    await scan('chamadas em andamento')
    await page.locator('.call', { hasText: '→' }).getByRole('button', { name: 'Desligar' }).click()

    await page.getByRole('button', { name: '+ Nova' }).click()
    await scan('formulário de conta')
    await page.keyboard.press('Escape')
    await page
        .locator('form.dialog')
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[formulário de conta] Esc não fecha'))
    if (await page.locator('form.dialog').count()) await page.getByRole('button', { name: 'Fechar' }).click()

    await page.getByRole('button', { name: 'Áudio' }).click()
    await scan('diálogo de áudio')
    await page.keyboard.press('Escape')
    await page
        .getByRole('dialog', { name: 'Áudio' })
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[áudio] Esc não fecha'))

    await page.getByRole('button', { name: 'Saúde' }).first().click()
    await scan('saúde da conta')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Importar / Exportar' }).click()
    await scan('importar e exportar')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Atualização' }).click()
    await page.getByText('funciona só no app instalado').waitFor()
    await scan('atualização')
    await page.keyboard.press('Escape')
    await page
        .getByRole('dialog', { name: 'Atualização' })
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[atualização] Esc não fecha'))

    await page.getByRole('tab', { name: 'Cenários' }).click()
    await page.getByRole('button', { name: '+ Exemplo de URA' }).click()
    await page.getByRole('button', { name: 'Executar', exact: true }).click()
    await page.getByText(/^Passou em/).waitFor({ timeout: 20000 })
    await scan('cenários')

    // Atalhos da especificação (RNF-12).
    await page.getByRole('tab', { name: 'Telefone' }).click()
    await page.keyboard.press('ControlOrMeta+l')
    if (!(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Número')))
        problems.push('[atalhos] Ctrl/Cmd+L não focou o discador')
    await page.keyboard.type('1002')
    await page.keyboard.press('Enter')
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 5000 })
    await page.keyboard.press('ControlOrMeta+m')
    await page
        .locator('.call.selected')
        .getByRole('button', { name: 'Ativar mic' })
        .waitFor({ timeout: 2000 })
        .catch(() => problems.push('[atalhos] Ctrl/Cmd+M não ativou o mudo'))
    await page.keyboard.press('ControlOrMeta+h')
    await page
        .locator('.call.selected .pill', { hasText: 'em espera' })
        .waitFor({ timeout: 2000 })
        .catch(() => problems.push('[atalhos] Ctrl/Cmd+H não pôs em espera'))
    await page.keyboard.press('ControlOrMeta+e')
    await page
        .getByText('0 chamadas')
        .waitFor({ timeout: 3000 })
        .catch(() => problems.push('[atalhos] Ctrl/Cmd+E não desligou'))
    await page.keyboard.press('ControlOrMeta+2')
    const origin = page.locator('.dialer').getByLabel('Conta de origem')
    const chosen = await origin.locator(`option[value="${await origin.inputValue()}"]`).textContent()
    if (!/Vendas 1002/.test(chosen)) problems.push('[atalhos] Ctrl/Cmd+2 não trocou a conta de origem')
    if (!problems.some((p) => p.startsWith('[atalhos]'))) step('atalhos Ctrl/Cmd + L, Enter, M, H, E e 1 a 9 funcionam')

    if (problems.length) {
        console.error(problems.join('\n'))
        process.exitCode = 1
    } else console.log('Acessibilidade OK')
} catch (error) {
    console.error(problems.join('\n'))
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
