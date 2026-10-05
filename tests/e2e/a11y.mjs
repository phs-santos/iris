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
    if (await page.locator('form.dialog').count())
        await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()

    await page.getByRole('button', { name: 'Fluxo SIP' }).click()
    await page
        .getByRole('dialog', { name: 'Fluxo SIP' })
        .getByRole('button', { name: /^INVITE, / })
        .first()
        .click()
    await scan('fluxo SIP')
    await page.keyboard.press('Escape')
    await page
        .getByRole('dialog', { name: 'Fluxo SIP' })
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[fluxo SIP] Esc não fecha'))

    // Configurações: cada seção passa pela varredura; as setas trocam de seção (RNF-12).
    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.getByRole('dialog', { name: 'Configurações' })
    await settings.waitFor({ timeout: 2000 }).catch(() => problems.push('[configurações] Ctrl/Cmd+, não abre'))
    for (const name of [
        'Perfil',
        'Aparência',
        'Áudio',
        'Servidores',
        'Conexão',
        'Ajuda da IA',
        'Certificados',
        'Importar e exportar'
    ]) {
        await settings.getByRole('tab', { name }).click()
        await scan(`configurações › ${name}`)
    }
    await settings.getByRole('tab', { name: 'Perfil' }).click()
    await page.keyboard.press('ArrowDown')
    if ((await settings.getByRole('tab', { name: 'Aparência' }).getAttribute('aria-selected')) !== 'true')
        problems.push('[configurações] seta para baixo não troca de seção')
    await settings.getByRole('tab', { name: 'Atualização' }).click()
    await page.getByText('funciona só no app instalado').waitFor()
    await scan('configurações › atualização')
    await page.keyboard.press('Escape')
    await settings
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[configurações] Esc não fecha'))

    await page.getByRole('button', { name: /^Mais ações de / }).click()
    await scan('menu de ações da conta')
    await page.keyboard.press('ArrowDown')
    if (!(await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Duplicar')))
        problems.push('[menu da conta] seta para baixo não anda pelos itens')
    await page.keyboard.press('Escape')
    if (!(await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') === 'menu')))
        problems.push('[menu da conta] Esc não devolve o foco ao botão')
    await page.getByRole('button', { name: /^Mais ações de / }).click()
    await page.getByRole('menuitem', { name: 'Saúde' }).click()
    await scan('saúde da conta')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Mais ações de / }).click()
    await page.getByRole('menuitem', { name: 'Requisição SIP…' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click()
    await page
        .getByRole('dialog')
        .getByText(/^200 OK em \d+ ms$/)
        .waitFor()
    await scan('requisição SIP manual')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Histórico' }).click()
    await scan('histórico de chamadas')
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('dialog', { name: 'Paleta de comandos' }).waitFor()
    await scan('paleta de comandos')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Contatos' }).click()
    await page.getByRole('button', { name: '+ Novo contato' }).click()
    await scan('novo contato')
    await page.keyboard.press('Escape')
    await scan('agenda de contatos')
    await page.getByRole('tab', { name: 'Mensagens' }).click()
    await scan('mensagens, sem conversa')
    await page.getByLabel('Nova conversa com o ramal').fill('1002')
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await page.getByLabel('Mensagem', { exact: true }).fill('oi')
    await page.keyboard.press('Enter')
    await page.getByRole('log').getByText('oi', { exact: true }).waitFor()
    await scan('mensagens, com conversa')
    await page.getByRole('tab', { name: 'Telefone' }).click()
    await page.getByLabel('Número', { exact: true }).fill('1002')
    await page.getByRole('button', { name: 'Ligar com vídeo' }).click()
    await page.locator('.call', { hasText: '→' }).locator('video.local').waitFor({ timeout: 8000 })
    await scan('chamada de vídeo')
    await page.locator('.call', { hasText: '→' }).getByRole('button', { name: 'Desligar', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.call').length === 0, null, { timeout: 15000 })

    await page.getByRole('button', { name: 'Explicar com IA' }).last().click()
    await page.getByLabel('Chave da OpenRouter').waitFor()
    await scan('ajuda da IA')
    await page.keyboard.press('Escape')
    await page
        .getByRole('dialog', { name: /IA$/ })
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[ajuda da IA] Esc não fecha'))

    // Guia: todas as seções abrem, as capturas carregam e a busca filtra o índice.
    await page.keyboard.press('F1')
    const guide = page.getByRole('dialog', { name: 'Guia da Íris' })
    await guide.waitFor()
    await scan('guia')
    const entries = guide.locator('.entry')
    const total = await entries.count()
    for (let i = 0; i < total; i++) {
        await entries.nth(i).click()
        const broken = await guide.locator('figure img').evaluateAll((imgs) =>
            Promise.all(
                imgs.map((img) =>
                    img.decode().then(
                        () => (img.naturalWidth ? null : img.alt),
                        () => img.alt
                    )
                )
            )
        )
        for (const alt of broken.filter(Boolean)) problems.push(`[guia] imagem não carregou: ${alt}`)
    }
    await guide.getByRole('button', { name: 'Cenários', exact: true }).click()
    await scan('guia, seção com tabela e imagem')
    await guide.getByLabel('Buscar no guia').fill('p95')
    if ((await entries.count()) !== 1) problems.push('[guia] a busca por "p95" deveria deixar só a seção de cenários')
    await page.keyboard.press('Escape')
    await guide.waitFor({ state: 'detached', timeout: 2000 }).catch(() => problems.push('[guia] Esc não fecha'))
    step(`guia com ${total} seções, capturas carregadas e busca`)

    await page.getByRole('tab', { name: 'Cenários' }).click()
    await page.getByRole('button', { name: '+ Exemplo de URA' }).click()
    await page.getByRole('button', { name: 'Executar', exact: true }).click()
    await page.getByText(/^Passou em/).waitFor({ timeout: 20000 })
    await scan('cenários')

    // Modo Telefone: teclado, chamada recebida e chamada em andamento.
    await page.getByRole('tab', { name: 'Telefone' }).click()
    await page.getByRole('button', { name: 'Modo Telefone' }).click()
    await page.getByRole('region', { name: 'Discar' }).waitFor()
    await scan('telefone, teclado')
    await page.getByLabel('Conta').selectOption({ label: 'Vendas 1002 · 1002' })
    await page.getByLabel('Número').fill('1001')
    await page.getByRole('button', { name: 'Ligar' }).click()
    await page.getByRole('region', { name: 'Chamada recebida' }).waitFor()
    await scan('telefone, chamada recebida')
    await page.getByRole('button', { name: 'Atender' }).click()
    await page.getByRole('region', { name: 'Chamada em andamento' }).waitFor()
    await page.getByRole('button', { name: 'Teclado' }).click()
    await scan('telefone, em chamada com o teclado DTMF')
    await page.getByRole('button', { name: 'Desligar' }).click()
    await page.getByRole('region', { name: 'Discar' }).waitFor()
    await page.getByLabel('Conta').selectOption({ label: 'Suporte 1001 · 1001' })
    await page.getByRole('button', { name: 'Bancada', exact: true }).click()
    await page.getByRole('tab', { name: 'Telefone' }).waitFor()

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

    // Tema claro: as mesmas telas principais, com o contraste conferido de novo.
    await page.keyboard.press('ControlOrMeta+,')
    await settings.getByRole('tab', { name: 'Aparência' }).click()
    await settings.getByRole('radio', { name: 'Claro' }).click()
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'light')
        problems.push('[tema claro] o tema não mudou')
    for (const name of ['Aparência', 'Servidores', 'Notificações', 'Atalhos e links']) {
        await settings.getByRole('tab', { name }).click()
        await scan(`tema claro › configurações › ${name}`)
    }
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Telefone' }).click()
    await scan('tema claro › janela principal')
    await page.getByRole('button', { name: 'teclado' }).click()
    await scan('tema claro › teclado do discador')
    await page.getByRole('button', { name: 'teclado' }).click()
    await page.getByRole('tab', { name: 'Contatos' }).click()
    await scan('tema claro › contatos')
    await page.getByRole('tab', { name: /^Mensagens/ }).click()
    await scan('tema claro › mensagens')
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'tema-claro.png') })
    await page.getByRole('tab', { name: 'Telefone' }).click()

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
