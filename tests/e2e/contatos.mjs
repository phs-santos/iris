// Contatos por conta (RF-50) e servidores cadastrados (RF-51), no modo simulado.
// Uso: npm run build && node tests/e2e/contatos.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/contatos.mjs)
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    abrirContatos,
    abrirSeletor,
    acao,
    campoNumero,
    chamadaAtiva,
    esperarContasSimuladas,
    estado,
    janelaContatos,
    linhaDaConta,
    seletor,
    sugestao
} from './helpers/tela.mjs'

const userData = mkdtempSync(join(tmpdir(), 'iris-contatos-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const read = (name) => JSON.parse(readFileSync(join(userData, name), 'utf8'))
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

let failed = false
try {
    await esperarContasSimuladas(page)

    // ─── Contatos da conta, pela janela aberta no menu da conta no seletor ───
    const agenda = await abrirContatos(page, 'Suporte 1001')
    await agenda.getByRole('button', { name: '+ Novo contato' }).click()
    await agenda.getByRole('button', { name: 'Salvar', exact: true }).click()
    await agenda.getByText('Dê um nome ao contato').waitFor()
    await agenda.getByLabel('Nome', { exact: true }).fill('Ana do Financeiro')
    await agenda.getByLabel('Número ou ramal').fill('1002')
    await agenda.getByRole('button', { name: 'Salvar', exact: true }).click()
    await agenda.locator('.contact', { hasText: 'Ana do Financeiro' }).waitFor()
    await page.getByText('Contato Ana do Financeiro criado').waitFor()
    const suporte = read('accounts.json').accounts.find((a) => a.name === 'Suporte 1001')
    const gravado = read('contacts.json').contacts[0]
    if (gravado?.number !== '1002' || gravado.accountId !== suporte.id)
        throw new Error(`o contato não foi gravado na conta em contacts.json: ${JSON.stringify(gravado)}`)
    step('contato criado na conta, com a validação do formulário, o aviso e gravado em contacts.json')

    await agenda.getByRole('searchbox').fill('financeiro')
    await agenda.locator('.contact', { hasText: 'Ana' }).waitFor()
    await agenda.getByRole('searchbox').fill('zzz')
    await agenda.getByText('Nenhum contato com "zzz".').waitFor()
    await agenda.getByRole('searchbox').fill('')
    step('busca por nome, sem diferenciar maiúscula')

    await agenda.getByRole('button', { name: 'Ligar para Ana do Financeiro' }).click()
    await agenda.waitFor({ state: 'detached' })
    const call = chamadaAtiva(page, /1001\s*→\s*1002/)
    await estado(call, 'em chamada').waitFor({ timeout: 8000 })
    await call.getByText('Ana do Financeiro').waitFor()
    step('Ligar disca pela janela de contatos, e a linha da chamada mostra o nome do contato')
    await acao(page, /1001\s*→\s*1002/, 'Desligar').click()
    await page.getByText('0 ativas').waitFor()

    // "+ Salvar como contato" no discador abre a janela da conta com o número já preenchido.
    await campoNumero(page).fill('7001')
    await sugestao(page, 'Salvar "7001" como contato').click()
    const nova = janelaContatos(page, 'Suporte 1001')
    await nova.waitFor()
    if ((await nova.getByLabel('Número ou ramal').inputValue()) !== '7001')
        throw new Error('o número digitado não veio para o contato novo')
    await nova.getByLabel('Nome', { exact: true }).fill('Fila suporte')
    await nova.getByRole('button', { name: 'Salvar', exact: true }).click()
    await nova.locator('.contact', { hasText: 'Fila suporte' }).waitFor()
    step('"+ Salvar como contato" no discador cria o contato na conta atual')

    await nova.getByRole('button', { name: 'Editar Fila suporte' }).click()
    await nova.getByLabel('Nome', { exact: true }).fill('Fila do suporte')
    await nova.getByRole('button', { name: 'Salvar', exact: true }).click()
    await nova.locator('.contact', { hasText: 'Fila do suporte' }).waitFor()
    await nova.getByRole('button', { name: 'Excluir Fila do suporte' }).click()
    await nova.getByRole('button', { name: 'Excluir mesmo' }).click()
    await nova.locator('.contact', { hasText: 'Fila do suporte' }).waitFor({ state: 'detached' })
    await page.keyboard.press('Escape')
    await nova.waitFor({ state: 'detached' })
    step('editar e excluir um contato')

    // Contato de uma conta não aparece em outra.
    const vendas = await abrirContatos(page, 'Vendas 1002')
    await vendas.getByText('Nenhum contato nesta conta.', { exact: false }).waitFor()
    await page.keyboard.press('Escape')
    step('a janela de outra conta não mostra os contatos de Suporte 1001')

    // ─── Servidores ───
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
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
        await abrirSeletor(page)
        await seletor(page).getByRole('button', { name: 'Nova conta' }).click()
        const account = page.locator('form.dialog')
        await account.getByLabel('Servidor').selectOption({ label: 'PBX da Matriz · pbx.matriz.com · WS' })
        if (!(await account.getByRole('textbox', { name: 'Domínio SIP' }).isDisabled()))
            throw new Error('o domínio não ficou travado')
        await account.getByRole('textbox', { name: 'Nome' }).fill(`Matriz ${ext}`)
        await account.getByRole('textbox', { name: 'Ramal' }).fill(ext)
        await account.getByLabel('Senha').fill('1234')
        await account.getByRole('button', { name: 'Salvar', exact: true }).click()
        await abrirSeletor(page)
        await linhaDaConta(page, `Matriz ${ext}`).waitFor()
        await page.keyboard.press('Escape')
    }
    // A tela muda antes de o arquivo ser gravado: numa máquina lenta (o CI), espera a gravação.
    const matriz = async (ready) => {
        let list = []
        for (let i = 0; i < 40; i++) {
            list = read('accounts.json').accounts.filter((a) => a.name.startsWith('Matriz'))
            if (ready(list)) break
            await page.waitForTimeout(100)
        }
        return list
    }
    const saved = await matriz((list) => list.length === 2)
    if (saved.length !== 2 || !saved.every((a) => a.domain === 'pbx.matriz.com' && a.serverId))
        throw new Error(`contas ligadas ao servidor gravadas errado: ${JSON.stringify(saved)}`)
    step('duas contas criadas a partir do servidor, só com ramal e senha')

    // Editar o servidor muda as duas contas de uma vez.
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
    await settings.getByRole('tab', { name: 'Servidores' }).click()
    await settings.getByText('usado por 2 conta(s)').waitFor()
    await settings.getByRole('button', { name: 'Editar PBX da Matriz' }).click()
    await settings.getByLabel('WebSocket (WSS)').fill('wss://novo.matriz.com/ws')
    await settings.getByRole('button', { name: 'Salvar' }).click()
    await settings.getByText('Servidor salvo e 2 conta(s) atualizada(s).').waitFor()
    const updated = await matriz((list) => list.every((a) => a.wssUrl === 'wss://novo.matriz.com/ws'))
    if (!updated.every((a) => a.wssUrl === 'wss://novo.matriz.com/ws'))
        throw new Error('as contas não mudaram com o servidor')
    step('editar o servidor atualiza as duas contas ligadas a ele')

    // Servidor em uso não pode ser excluído (canDeleteServer): as duas contas continuam ligadas a ele.
    await settings.getByRole('button', { name: 'Excluir PBX da Matriz' }).click()
    await settings.getByRole('button', { name: 'Excluir mesmo' }).click()
    await page.waitForTimeout(300)
    if (await settings.getByText('Servidor excluído').count())
        throw new Error('a tela disse que excluiu um servidor em uso')
    await settings.getByRole('button', { name: 'Editar PBX da Matriz' }).waitFor()
    if (!read('servers.json').servers.some((sv) => sv.name === 'PBX da Matriz'))
        throw new Error('o servidor em uso sumiu de servers.json')
    const ligadas = await matriz((list) => list.every((a) => a.serverId))
    if (!ligadas.every((a) => a.serverId)) throw new Error('as contas perderam o servidor')
    step('excluir um servidor em uso é recusado e as contas continuam ligadas a ele')

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
