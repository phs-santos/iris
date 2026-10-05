// Agenda de contatos (RF-50) e servidores cadastrados (RF-51), no modo simulado.
// Uso: npm run build && node tests/e2e/contatos.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/contatos.mjs)
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-contatos-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const read = (name) => JSON.parse(readFileSync(join(userData, name), 'utf8'))
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()

    // ─── Contatos ───
    await page.getByRole('tab', { name: 'Contatos' }).click()
    await page.getByRole('button', { name: '+ Novo contato' }).click()
    let form = page.getByRole('dialog')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await form.getByText('Dê um nome ao contato').waitFor()
    await form.getByLabel('Nome').fill('Ana do Financeiro')
    await form.getByLabel('Número ou ramal').fill('1002')
    await form.getByLabel('Empresa').fill('Matriz')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await page.locator('.contact', { hasText: 'Ana do Financeiro' }).waitFor()
    await page.getByText('Contato Ana do Financeiro criado').waitFor()
    if (read('contacts.json').contacts[0]?.number !== '1002')
        throw new Error('o contato não foi gravado em contacts.json')
    step('contato criado, com a validação do formulário, o aviso na tela, e gravado em contacts.json')

    await page.getByRole('searchbox').fill('financeiro')
    await page.locator('.contact', { hasText: 'Ana' }).waitFor()
    await page.getByRole('searchbox').fill('zzz')
    await page.getByText('Nenhum contato com "zzz".').waitFor()
    await page.getByRole('searchbox').fill('')
    step('busca por nome, sem diferenciar maiúscula')

    await page.getByRole('button', { name: 'Favorito: Ana do Financeiro' }).click()
    await page.getByRole('button', { name: 'Ligar para Ana do Financeiro' }).click()
    await page.getByRole('tab', { name: 'Telefone' }).waitFor()
    const call = page.locator('.call', { hasText: /1001\s*→\s*1002/ })
    await call.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 8000 })
    // Quem recebe vê o nome que está na agenda, não só o número.
    await page.locator('.call', { hasText: /1002\s*←\s*1001/ }).waitFor()
    await call.getByText('Ana do Financeiro').waitFor()
    step('Ligar disca pela agenda, e o cartão mostra o nome do contato')
    await page
        .locator('.dialer')
        .getByRole('button', { name: /Ana do Financeiro/ })
        .waitFor()
    step('o favorito aparece como atalho no discador')
    await call.getByRole('button', { name: 'Desligar' }).click()
    await page.locator('.pill', { hasText: 'encerrada' }).nth(1).waitFor()

    // Salvar contato a partir do histórico: a chamada recebida pelo 1002 veio do 1001, que não está na agenda.
    await page.getByRole('tab', { name: 'Histórico' }).click()
    await page.getByRole('button', { name: 'Salvar 1001 nos contatos' }).first().click()
    form = page.getByRole('dialog')
    if ((await form.getByLabel('Número ou ramal').inputValue()) !== '1001')
        throw new Error('o número não veio do histórico')
    await form.getByLabel('Nome').fill('Suporte da Matriz')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await page.locator('.history .entry .name', { hasText: 'Suporte da Matriz' }).first().waitFor()
    step('salvar contato a partir do histórico, e o histórico passa a mostrar o nome')

    // ─── Servidores ───
    await page.getByRole('button', { name: 'Configurações' }).click()
    const settings = page.getByRole('dialog')
    await settings.getByRole('tab', { name: 'Servidores' }).click()
    await settings.getByRole('button', { name: '+ Novo servidor' }).click()
    await settings.getByLabel('Nome', { exact: true }).fill('PBX da Matriz')
    await settings.getByLabel('Domínio SIP').fill('pbx.matriz.com')
    await settings.getByLabel('WebSocket (WSS)').fill('wss://pbx.matriz.com:8089/ws')
    await settings.getByRole('button', { name: 'Salvar' }).click()
    await settings.getByText('Servidor salvo.').waitFor()
    await settings.getByRole('button', { name: 'Fechar' }).first().click()
    step('servidor cadastrado em Configurações → Servidores')

    // Duas contas novas ligadas ao servidor: só ramal e senha são digitados.
    for (const ext of ['3001', '3002']) {
        await page.getByRole('button', { name: '+ Nova' }).click()
        const account = page.locator('form.dialog')
        await account.getByLabel('Servidor').selectOption({ label: 'PBX da Matriz · pbx.matriz.com · WS' })
        if (!(await account.getByRole('textbox', { name: 'Domínio SIP' }).isDisabled()))
            throw new Error('o domínio não ficou travado')
        await account.getByRole('textbox', { name: 'Nome' }).fill(`Matriz ${ext}`)
        await account.getByRole('textbox', { name: 'Ramal' }).fill(ext)
        await account.getByLabel('Senha').fill('1234')
        await account.getByRole('button', { name: 'Salvar', exact: true }).click()
        await page.locator('.acc', { hasText: `Matriz ${ext}` }).waitFor()
    }
    const saved = read('accounts.json').accounts.filter((a) => a.name.startsWith('Matriz'))
    if (saved.length !== 2 || !saved.every((a) => a.domain === 'pbx.matriz.com' && a.serverId))
        throw new Error(`contas ligadas ao servidor gravadas errado: ${JSON.stringify(saved)}`)
    step('duas contas criadas a partir do servidor, só com ramal e senha')

    // Editar o servidor muda as duas contas de uma vez.
    await page.getByRole('button', { name: 'Configurações' }).click()
    await settings.getByRole('tab', { name: 'Servidores' }).click()
    await settings.getByText('usado por 2 conta(s)').waitFor()
    await settings.getByRole('button', { name: 'Editar PBX da Matriz' }).click()
    await settings.getByLabel('WebSocket (WSS)').fill('wss://novo.matriz.com/ws')
    await settings.getByRole('button', { name: 'Salvar' }).click()
    await settings.getByText('Servidor salvo e 2 conta(s) atualizada(s).').waitFor()
    const updated = read('accounts.json').accounts.filter((a) => a.name.startsWith('Matriz'))
    if (!updated.every((a) => a.wssUrl === 'wss://novo.matriz.com/ws'))
        throw new Error('as contas não mudaram com o servidor')
    step('editar o servidor atualiza as duas contas ligadas a ele')

    await settings.getByRole('button', { name: 'Excluir PBX da Matriz' }).click()
    await settings.getByRole('button', { name: 'Excluir mesmo' }).click()
    await settings.getByText('Servidor excluído').waitFor()
    const loose = read('accounts.json').accounts.filter((a) => a.name.startsWith('Matriz'))
    if (loose.some((a) => a.serverId) || !loose.every((a) => a.wssUrl === 'wss://novo.matriz.com/ws'))
        throw new Error('excluir o servidor deveria soltar as contas sem perder os dados')
    step('excluir o servidor solta as contas, que mantêm os dados de conexão')

    if (errors.length) throw new Error(`erros na interface:\n${errors.join('\n')}`)
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'contatos-falha.png') })
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('Contatos e servidores OK')
