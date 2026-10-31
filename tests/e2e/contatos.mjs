// Contatos por conta (RF-50) e servidores cadastrados (RF-51), no modo simulado.
// Uso: npm run build && node tests/e2e/contatos.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/contatos.mjs)
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
    abrir,
    abrirAjustes,
    abrirNovaConta,
    escolherServidor,
    fecharAjustes,
    formConta,
    janelaServidor,
    preencherServidor,
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

const { app, page, userData } = await abrir({ prefixo: 'iris-contatos-' })
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
    let settings = await abrirAjustes(page, 'Servidores')
    // O simulado é fixo: aparece na lista, sem Editar nem Excluir.
    await settings.getByText('PBX simulado').waitFor()
    if (await settings.getByRole('button', { name: /^(Editar|Excluir) PBX simulado/ }).count())
        throw new Error('o PBX simulado tem botão de editar ou excluir')
    await settings.getByRole('button', { name: 'Novo servidor' }).click()
    await preencherServidor(page, {
        nome: 'PBX da Matriz',
        dominio: 'pbx.matriz.com',
        transporte: 'WebSocket',
        wss: 'wss://pbx.matriz.com:8089/ws'
    })
    await settings.getByText('PBX da Matriz').waitFor()
    await fecharAjustes(page)
    step('servidor cadastrado em Ajustes → Servidores; o simulado não se edita nem se exclui')

    // Duas contas novas ligadas ao servidor: nome, ramal e senha são digitados, a conexão vem dele.
    for (const ext of ['3001', '3002']) {
        const account = await abrirNovaConta(page)
        await escolherServidor(account, 'PBX da Matriz')
        await account.getByRole('textbox', { name: 'Nome', exact: true }).fill(`Matriz ${ext}`)
        await account.getByLabel('Ramal').fill(ext)
        await account.getByLabel('Senha').fill('1234')
        await account.getByRole('button', { name: 'Salvar', exact: true }).click()
        await account.waitFor({ state: 'detached' })
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
    if (
        saved.length !== 2 ||
        !saved.every((a) => a.domain === 'pbx.matriz.com' && a.serverId && a.wssUrl === 'wss://pbx.matriz.com:8089/ws')
    )
        throw new Error(`contas ligadas ao servidor gravadas errado: ${JSON.stringify(saved)}`)
    step('duas contas criadas a partir do servidor, com a conexão vinda dele')

    // Editar o servidor muda as duas contas de uma vez.
    settings = await abrirAjustes(page, 'Servidores')
    await settings.getByText('2 contas').waitFor()
    await settings.getByRole('button', { name: 'Editar PBX da Matriz' }).click()
    await janelaServidor(page).getByLabel('Endereço WSS').fill('wss://novo.matriz.com/ws')
    await janelaServidor(page).getByRole('button', { name: 'Salvar', exact: true }).click()
    await page.getByText('Servidor salvo e 2 conta(s) atualizada(s).').waitFor()
    const updated = await matriz((list) => list.every((a) => a.wssUrl === 'wss://novo.matriz.com/ws'))
    if (!updated.every((a) => a.wssUrl === 'wss://novo.matriz.com/ws'))
        throw new Error('as contas não mudaram com o servidor')
    step('editar o servidor atualiza as duas contas ligadas a ele')

    // Servidor em uso não pode ser excluído: a linha diz por quê, e as contas continuam ligadas a ele.
    await settings.getByRole('button', { name: 'Excluir PBX da Matriz' }).click()
    await settings.getByRole('alert').filter({ hasText: 'Não dá para excluir: 2 contas usam este servidor' }).waitFor()
    if (await settings.getByRole('button', { name: 'Excluir mesmo' }).count())
        throw new Error('a tela pediu confirmação para excluir um servidor em uso')
    if (!read('servers.json').servers.some((sv) => sv.name === 'PBX da Matriz'))
        throw new Error('o servidor em uso sumiu de servers.json')
    step('excluir um servidor em uso é recusado com o motivo (2 contas)')

    // Servidor sem conta se exclui, com confirmação.
    await settings.getByRole('button', { name: 'Novo servidor' }).click()
    await preencherServidor(page, { nome: 'Sobra', dominio: 'sobra.teste' })
    await settings.getByRole('button', { name: 'Excluir Sobra' }).click()
    await settings.getByRole('button', { name: 'Excluir mesmo' }).click()
    await settings.getByText('Sobra', { exact: true }).waitFor({ state: 'detached' })
    step('servidor sem conta é excluído depois de confirmar')

    // ─── Etiquetas ───
    await settings.getByRole('tab', { name: 'Etiquetas' }).click()
    await settings.getByLabel('Nome da etiqueta nova').fill('produção')
    await settings.getByRole('button', { name: 'Adicionar' }).click()
    await settings.getByLabel('Nome da etiqueta produção').waitFor()
    await fecharAjustes(page)
    // No cadastro da conta: escolhe a existente e cria outra ali mesmo.
    await abrirSeletor(page)
    await linhaDaConta(page, 'Matriz 3001').hover()
    await seletor(page).getByRole('button', { name: 'Editar Matriz 3001' }).click()
    const edit = formConta(page)
    await edit.getByRole('button', { name: 'etiqueta' }).click()
    await edit.getByRole('button', { name: 'produção' }).click()
    await edit.getByLabel('Procurar ou criar etiqueta').fill('acme')
    await edit.getByLabel('Procurar ou criar etiqueta').press('Enter')
    await edit.getByRole('button', { name: 'Tirar a etiqueta acme' }).waitFor()
    await edit.getByRole('button', { name: 'Salvar', exact: true }).click()
    await edit.waitFor({ state: 'detached' })
    const etiquetas = read('tags.json').tags
    const comTags = await matriz((list) => list.some((a) => a.tagIds.length === 2))
    const nomes = comTags
        .find((a) => a.name === 'Matriz 3001')
        ?.tagIds.map((id) => etiquetas.find((t) => t.id === id)?.name)
        .sort()
    if (JSON.stringify(nomes) !== '["acme","produção"]') throw new Error(`etiquetas gravadas errado: ${nomes}`)
    // Renomear vale em todas as contas; apagar tira de todas.
    settings = await abrirAjustes(page, 'Etiquetas')
    await settings.getByLabel('Nome da etiqueta acme').fill('cliente Acme')
    await settings.getByLabel('Nome da etiqueta acme').press('Enter')
    await settings.getByLabel('Nome da etiqueta cliente Acme').waitFor()
    await settings.getByRole('button', { name: 'Apagar produção' }).click()
    await settings.getByRole('button', { name: 'Apagar e tirar de 1 conta(s)' }).click()
    await settings.getByLabel('Nome da etiqueta produção').waitFor({ state: 'detached' })
    await fecharAjustes(page)
    const depois = await matriz((list) => list.every((a) => a.tagIds.length <= 1))
    if (depois.find((a) => a.name === 'Matriz 3001')?.tagIds.length !== 1)
        throw new Error('apagar a etiqueta não tirou ela da conta')
    step('etiquetas: criar em Ajustes e no cadastro, renomear e apagar (tira das contas)')

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
