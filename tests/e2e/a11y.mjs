// Acessibilidade (RNF-12): varre as telas com o axe-core (regras WCAG 2.1 A e AA) e confere que
// as ações principais têm atalho. Uso: npm run build && node tests/e2e/a11y.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    abrirDepuracao,
    abrirSeletor,
    esperarContasSimuladas,
    fecharSeletor,
    linhaDaConta,
    seletor,
    tituloDiscar
} from './helpers/tela.mjs'

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const userData = mkdtempSync(join(tmpdir(), 'iris-a11y-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
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
    await esperarContasSimuladas(page)
    await scan('tela principal')

    // Seletor de contas (RNF-12): foco na busca ao abrir, setas andam, ações à vista com o foco do teclado,
    // Esc fecha e devolve o foco ao avatar.
    await abrirSeletor(page)
    const focused = (fn) => page.evaluate(fn)
    if (!(await focused(() => document.activeElement?.getAttribute('aria-label') === 'Procurar conta')))
        problems.push('[seletor] o foco não foi para a busca ao abrir')
    await page.keyboard.press('ArrowDown')
    const row = await focused(() => document.activeElement?.closest('.row')?.querySelector('.name')?.textContent)
    if (!row) problems.push('[seletor] seta para baixo não foi para uma conta')
    const actsVisible = await focused(
        () => getComputedStyle(document.activeElement?.closest('.row')?.querySelector('.acts')).visibility
    )
    if (actsVisible !== 'visible') problems.push('[seletor] as ações da linha não aparecem com o foco do teclado')
    await scan('seletor de contas')
    await page.keyboard.press('Shift+F10')
    await seletor(page)
        .getByRole('menu')
        .waitFor({ timeout: 2000 })
        .catch(() => problems.push('[seletor] Shift+F10 não abre o menu'))
    await scan('menu da conta')
    await page.keyboard.press('Escape')
    if (!(await focused(() => document.activeElement?.classList.contains('pick'))))
        problems.push('[menu da conta] Esc não devolve o foco à conta')
    await page.keyboard.press('Escape')
    await seletor(page)
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[seletor] Esc não fecha'))
    if (!(await focused(() => /^Conta atual/.test(document.activeElement?.getAttribute('aria-label') ?? ''))))
        problems.push('[seletor] ao fechar, o foco não volta ao avatar')

    await page.locator('.chip', { hasText: '1002' }).click()
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 5000 })
    await page.locator('.call', { hasText: '→' }).getByRole('button', { name: 'DTMF' }).click()
    await scan('chamadas em andamento')
    await page.locator('.call', { hasText: '→' }).getByRole('button', { name: 'Desligar' }).click()

    await abrirSeletor(page)
    await seletor(page).getByRole('button', { name: 'Nova conta' }).click()
    await scan('formulário de conta')
    await page.keyboard.press('Escape')
    await page
        .locator('form.dialog')
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[formulário de conta] Esc não fecha'))
    if (await page.locator('form.dialog').count())
        await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()

    await abrirDepuracao(page)
    await scan('depuração aberta')
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
    for (const name of ['Aparência', 'Áudio', 'Servidores', 'Conexão', 'Certificados', 'Importar e exportar']) {
        await settings.getByRole('tab', { name }).click()
        await scan(`configurações › ${name}`)
    }
    await settings.getByRole('tab', { name: 'Aparência' }).click()
    await page.keyboard.press('ArrowDown')
    if ((await settings.getByRole('tab', { name: 'Áudio' }).getAttribute('aria-selected')) !== 'true')
        problems.push('[configurações] seta para baixo não troca de seção')
    await settings.getByRole('tab', { name: 'Atualização' }).click()
    await page.getByText('funciona só no app instalado').waitFor()
    await scan('configurações › atualização')
    await page.keyboard.press('Escape')
    await settings
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => problems.push('[configurações] Esc não fecha'))

    const menuDe = async (nome) => {
        await abrirSeletor(page)
        await linhaDaConta(page, nome).locator('.pick').focus()
        await seletor(page)
            .getByRole('button', { name: `Mais ações de ${nome}` })
            .click()
    }
    await menuDe('Suporte 1001')
    await page.keyboard.press('ArrowDown')
    if (!(await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Saúde')))
        problems.push('[menu da conta] seta para baixo não anda pelos itens')
    await page.getByRole('menuitem', { name: 'Saúde' }).click()
    await scan('saúde da conta')
    await page.keyboard.press('Escape')
    await menuDe('Suporte 1001')
    await page.getByRole('menuitem', { name: 'Contatos' }).click()
    const contacts = page.getByRole('dialog', { name: 'Contatos de Suporte 1001' })
    await contacts.waitFor()
    await scan('contatos da conta')
    await contacts.getByRole('button', { name: '+ Novo contato' }).click()
    await scan('novo contato')
    await page.keyboard.press('Escape')
    if (!(await contacts.isVisible())) problems.push('[contatos] Esc no formulário fechou também a lista')
    await page.keyboard.press('Escape')
    await contacts.waitFor({ state: 'detached', timeout: 2000 }).catch(() => problems.push('[contatos] Esc não fecha'))
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
    await guide.getByRole('button', { name: 'Seus dados e segurança', exact: true }).click()
    await scan('guia, seção com tabela')
    await guide.getByLabel('Buscar no guia').fill('chave-local')
    if ((await entries.count()) !== 1)
        problems.push('[guia] a busca por "chave-local" deveria deixar só a seção de dados')
    await page.keyboard.press('Escape')
    await guide.waitFor({ state: 'detached', timeout: 2000 }).catch(() => problems.push('[guia] Esc não fecha'))
    step(`guia com ${total} seções, capturas carregadas e busca`)

    // Atalhos da especificação (RNF-12).
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
        .getByText('0 ativas')
        .waitFor({ timeout: 3000 })
        .catch(() => problems.push('[atalhos] Ctrl/Cmd+E não desligou'))
    await page.keyboard.press('ControlOrMeta+2')
    await tituloDiscar(page)
        .filter({ hasText: 'Vendas 1002' })
        .waitFor({ timeout: 2000 })
        .catch(() => problems.push('[atalhos] Ctrl/Cmd+2 não trocou a conta atual'))
    await page.keyboard.press('ControlOrMeta+1')
    if (!problems.some((p) => p.startsWith('[atalhos]'))) step('atalhos Ctrl/Cmd + L, Enter, M, H, E e 1 a 9 funcionam')

    // Tema escuro: as mesmas telas principais, com o contraste conferido de novo (o claro é o padrão).
    await page.keyboard.press('ControlOrMeta+,')
    await settings.getByRole('tab', { name: 'Aparência' }).click()
    await settings.getByRole('radio', { name: 'Escuro' }).click()
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'dark')
        problems.push('[tema escuro] o tema não mudou')
    for (const name of ['Aparência', 'Servidores', 'Notificações']) {
        await settings.getByRole('tab', { name }).click()
        await scan(`tema escuro › configurações › ${name}`)
    }
    await page.keyboard.press('Escape')
    await scan('tema escuro › janela principal')
    await abrirSeletor(page)
    await linhaDaConta(page, 'Suporte 1001').locator('.pick').focus()
    await scan('tema escuro › seletor de contas')
    await fecharSeletor(page)
    await page.getByRole('button', { name: 'teclado' }).click()
    await scan('tema escuro › teclado do discador')
    await page.getByRole('button', { name: 'teclado' }).click()
    await menuDe('Suporte 1001')
    await page.getByRole('menuitem', { name: 'Contatos' }).click()
    await scan('tema escuro › contatos')
    await page.keyboard.press('Escape')
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'tema-escuro.png') })

    if (problems.length) {
        console.error(problems.join('\n'))
        process.exitCode = 1
    } else console.log('Acessibilidade OK')
} catch (error) {
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'a11y-falha.png') })
    console.error(problems.join('\n'))
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
