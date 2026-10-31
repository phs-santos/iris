// Chamada de ponta a ponta pela tela: liga, DTMF, espera, transferência cega e desligar.
// Modo simulado sempre; com PBX_WS definido (docker compose up -d), repete com contas de SIP puro por UDP no Asterisk.
// Uso: npm run build && node tests/e2e/chamada.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/chamada.mjs)
import { rmSync } from 'node:fs'
import {
    abrir,
    acao,
    contarLinhas,
    esperarLinhaNova,
    LINHA_TRANSFERENCIA,
    linhaDtmf,
    chamadaAtiva,
    chamadaEncerrada,
    criarConta,
    discar,
    enviarDtmf,
    abrirSeletor,
    clicarConta,
    escolherConta,
    esperarContasSimuladas,
    estado,
    etiquetar,
    filtrarPorEtiqueta,
    campoNumero,
    criarContato,
    detalhesDaConta,
    sugestao,
    sugestoes,
    linhaDaConta,
    recolherDepuracao,
    abrirDepuracao,
    alcaDepuracao,
    contaDepuracao,
    mensagemSip,
    seletor,
    tiraDepuracao,
    tituloDiscar,
    transferirCega,
    abrirNovaConta,
    abrirAjustes,
    fecharAjustes,
    codecPrimeiro,
    linhaCodec,
    escolherServidor,
    preencherServidor,
    formConta,
    janelaServidor,
    esperarRegistro
} from './helpers/tela.mjs'

const step = (msg) => console.log(`✓ ${msg}`)
const { app, page, userData } = await abrir()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

/** Liga, confere "em chamada" em até 5 s (20 s no PBX de verdade) e devolve o cartão. */
async function ligar(numero, limite) {
    await discar(page, numero)
    const cartao = chamadaAtiva(page, new RegExp(`→\\s*${numero}`))
    await estado(cartao, 'em chamada').waitFor({ timeout: limite })
    return cartao
}

async function desligar(padrao) {
    await acao(page, padrao, 'Desligar').click()
    await chamadaEncerrada(page, padrao).first().waitFor({ timeout: 10000 })
    await chamadaAtiva(page, padrao).waitFor({ state: 'detached', timeout: 10000 })
}

/** Espera e retomada: "em espera" aparece e some. */
async function esperaERetomada(padrao) {
    await acao(page, padrao, 'Espera').click()
    await estado(chamadaAtiva(page, padrao), 'em espera').waitFor({ timeout: 10000 })
    await acao(page, padrao, 'Retomar').click()
    await estado(chamadaAtiva(page, padrao), /^em chamada/).waitFor({ timeout: 10000 })
    await estado(chamadaAtiva(page, padrao), 'em espera').waitFor({ state: 'detached', timeout: 10000 })
}

let failed = false
try {
    // ─── Modo simulado ───
    await esperarContasSimuladas(page)

    // A Lab 2001 do simulado começa com senha errada (403): a tira avisa "erro novo" sem abrir sozinha, e o aviso
    // some depois de abrir e fechar a gaveta.
    await page.getByRole('button', { name: /^SIP · Fluxo · Log.*erro novo$/ }).waitFor({ timeout: 10000 })
    await abrirDepuracao(page)
    await recolherDepuracao(page).click()
    if (/erro novo/.test(await tiraDepuracao(page).getAttribute('aria-label')))
        throw new Error('a tira continuou com "erro novo" depois de abrir e fechar a gaveta')
    step('simulado: a tira avisa "erro novo" e perde o aviso depois de abrir e fechar a gaveta')

    // A gaveta de depuração começa recolhida na tira.
    if ((await tiraDepuracao(page).getAttribute('aria-expanded')) !== 'false')
        throw new Error('a gaveta de depuração não começou fechada')
    // O tamanho muda pelas setas na alça e continua o mesmo depois de recarregar.
    await abrirDepuracao(page)
    const tamanho = async () => Number(await alcaDepuracao(page).getAttribute('aria-valuenow'))
    const inicial = await tamanho()
    await alcaDepuracao(page).focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    const maior = await tamanho()
    if (maior !== inicial + 32) throw new Error(`as setas não mudaram o tamanho da gaveta (${inicial} → ${maior})`)

    // O seletor troca a conta atual: filtra por etiqueta, escolhe, e o título do discar muda.
    await etiquetar(page, 'Comercial', ['Vendas 1002'])
    await esperarContasSimuladas(page)
    if ((await tamanho()) !== maior) throw new Error(`a gaveta não guardou o tamanho: ${await tamanho()}`)
    await alcaDepuracao(page).dblclick()
    if ((await tamanho()) !== inicial) throw new Error('o duplo clique na alça não voltou ao tamanho padrão')
    await recolherDepuracao(page).click()
    step('simulado: a gaveta começa fechada, muda de tamanho pelas setas e guarda o tamanho ao recarregar')
    await abrirSeletor(page)
    await filtrarPorEtiqueta(page, 'Comercial')
    await linhaDaConta(page, 'Suporte 1001').waitFor({ state: 'detached' })
    if ((await seletor(page).locator('.row').count()) !== 1)
        throw new Error('o filtro por etiqueta não deixou só 1 conta')
    await clicarConta(page, 'Vendas 1002')
    await tituloDiscar(page).filter({ hasText: 'Vendas 1002' }).waitFor()
    step('simulado: o seletor filtra por etiqueta e troca a conta atual (título do discar muda)')

    await escolherConta(page, 'Suporte 1001')
    await tituloDiscar(page).filter({ hasText: 'Suporte 1001' }).waitFor()

    // Clicar fora fecha o seletor sem engolir o clique: um clique na tira abre a depuração e fecha o seletor.
    await abrirSeletor(page)
    await tiraDepuracao(page).click()
    await seletor(page).waitFor({ state: 'detached', timeout: 2000 })
    await recolherDepuracao(page).waitFor({ timeout: 2000 })
    await recolherDepuracao(page).click()
    step('simulado: com o seletor aberto, um clique na tira abre a depuração e fecha o seletor')

    // Cadastro de conta: nome obrigatório, "+ Novo servidor…" volta com o servidor escolhido, e a conta registra.
    let form = await abrirNovaConta(page)
    const servidorEscolhido = async () =>
        (
            await form.getByRole('combobox', { name: 'Servidor', exact: true }).locator('option:checked').textContent()
        ).trim()
    if ((await servidorEscolhido()) !== 'PBX simulado')
        throw new Error(`a conta nova não veio com o PBX simulado: ${await servidorEscolhido()}`)
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    if ((await form.getByRole('textbox', { name: 'Nome', exact: true }).getAttribute('aria-invalid')) !== 'true')
        throw new Error('salvar sem nome não marcou o campo Nome')
    await form.getByRole('combobox', { name: 'Servidor', exact: true }).selectOption({ label: '+ Novo servidor…' })
    await janelaServidor(page).waitFor()
    await preencherServidor(page, { nome: 'Servidor de teste', dominio: 'pbx.teste' })
    if ((await servidorEscolhido()) !== 'Servidor de teste · UDP')
        throw new Error(`o servidor novo não voltou escolhido: ${await servidorEscolhido()}`)
    await escolherServidor(form, 'PBX simulado')
    await form.getByRole('textbox', { name: 'Nome', exact: true }).fill('Simulada 1005')
    await form.getByLabel('Ramal').fill('1005')
    await form.getByLabel('Senha').fill('1234')
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    await esperarRegistro(page, 'Simulada 1005')
    await tituloDiscar(page).filter({ hasText: 'Simulada 1005' }).waitFor()
    await escolherConta(page, 'Suporte 1001')
    step('simulado: cadastra servidor e conta pela tela, registra e vira a conta atual (nome obrigatório)')

    // A ordem dos codecs muda pelas setas (↑) e fica gravada; o último ligado não desliga.
    await abrirAjustes(page, 'Áudio')
    await codecPrimeiro(page, 'PCMA')
    const gravada = async () => (await page.evaluate(() => window.iris.settings.load())).codecs?.order?.[0]
    for (let i = 0; i < 20 && (await gravada()) !== 'PCMA'; i++) await page.waitForTimeout(100)
    if ((await gravada()) !== 'PCMA') throw new Error(`a ordem dos codecs não foi gravada: ${await gravada()}`)
    for (const nome of ['G.722', 'PCMU', 'Opus']) await linhaCodec(page, nome).getByRole('checkbox').uncheck()
    if (!(await linhaCodec(page, 'PCMA').getByRole('checkbox').isDisabled()))
        throw new Error('dava para desligar o último codec ligado')
    for (const nome of ['G.722', 'PCMU', 'Opus']) await linhaCodec(page, nome).getByRole('checkbox').check()
    await fecharAjustes(page)
    step('simulado: a ordem dos codecs muda pelas setas, fica gravada e o último ligado não desliga')

    const ura = /→\s*8000/
    await ligar('8000', 5000)
    step('simulado: a chamada para 8000 aparece "em chamada" em até 5 s')
    await abrirDepuracao(page, 'SIP')
    const invite = mensagemSip(page, 'INVITE sip:8000').last()
    await invite.waitFor({ timeout: 5000 })
    await invite.getByRole('button').first().click()
    await invite.getByLabel('Mensagem SIP inteira').waitFor()
    if (!/Call-ID:/.test(await invite.locator('pre').textContent()))
        throw new Error('a mensagem SIP aberta não mostra os cabeçalhos')
    step('simulado: a gaveta mostra o INVITE da chamada e abre a mensagem inteira ao clicar')
    let antes = await contarLinhas(page, linhaDtmf(3))
    await enviarDtmf(page, ura, '123')
    await esperarLinhaNova(page, linhaDtmf(3), antes, 5000)
    step('simulado: o log mostra o DTMF')
    // Com a chamada escolhida, o teclado do discador só manda o tom: o campo do número não muda.
    antes = await contarLinhas(page, linhaDtmf(5))
    await page.getByRole('group', { name: 'Teclado' }).getByRole('button', { name: '5', exact: true }).click()
    await esperarLinhaNova(page, linhaDtmf(5), antes, 5000)
    if ((await campoNumero(page).inputValue()) !== '8000')
        throw new Error('o teclado escreveu no campo durante a chamada')
    step('simulado: em chamada, o teclado do discador manda DTMF sem escrever no campo')
    await esperaERetomada(ura)
    step('simulado: "em espera" aparece e some')
    await desligar(ura)
    step('simulado: a chamada some depois de desligar')

    const para1002 = /→\s*1002/
    await ligar('1002', 5000)
    // Clicar na chamada recebida por Vendas 1002 troca o filtro da depuração para essa conta.
    await chamadaAtiva(page, /1002\s*←\s*1001/)
        .locator('.name')
        .click()
    await abrirDepuracao(page, 'SIP')
    const filtro = async () => (await contaDepuracao(page).locator('option:checked').textContent())?.trim()
    if (!(await filtro())?.startsWith('Vendas 1002')) throw new Error(`o filtro ficou em ${await filtro()}`)
    await mensagemSip(page, 'INVITE sip:1002').first().waitFor({ timeout: 5000 })
    if (await page.locator('#debug-tabpanel .chip').count())
        throw new Error('com uma conta só no filtro, as linhas não deveriam repetir a conta')
    step('simulado: clicar numa chamada filtra o SIP pela conta dela')
    antes = await contarLinhas(page, LINHA_TRANSFERENCIA)
    await transferirCega(page, para1002, '1003')
    await esperarLinhaNova(page, LINHA_TRANSFERENCIA, antes, 10000)
    await chamadaAtiva(page, para1002).waitFor({ state: 'detached', timeout: 10000 })
    step('simulado: transferência cega para 1003 termina com 200 OK e libera a chamada')

    // Sugestões do discador: só os contatos da conta atual; Enter liga o número do contato.
    await detalhesDaConta(page, 'Suporte 1001').waitFor({ timeout: 10000 })
    await criarContato(page, 'Suporte 1001', 'João Teste', '8000')
    await escolherConta(page, 'Suporte 1001')
    await campoNumero(page).fill('joao')
    await sugestao(page, /João Teste/).waitFor()
    await campoNumero(page).press('Enter')
    await estado(chamadaAtiva(page, ura), 'em chamada').waitFor({ timeout: 5000 })
    if ((await chamadaAtiva(page, ura).locator('.name').textContent())?.trim() !== 'João Teste')
        throw new Error('a linha da chamada não mostra o nome do contato')
    step('simulado: a sugestão "João Teste" liga para o 8000 do contato com Enter')
    await desligar(ura)

    await escolherConta(page, 'Vendas 1002')
    await campoNumero(page).fill('joao')
    await sugestao(page, /Salvar "joao" como contato/).waitFor()
    if (
        await sugestoes(page)
            .getByRole('option', { name: /João Teste/ })
            .count()
    )
        throw new Error('o contato de Suporte 1001 apareceu nas sugestões de Vendas 1002')
    await campoNumero(page).press('Escape')
    await sugestoes(page).waitFor({ state: 'hidden' })
    await campoNumero(page).fill('')
    step('simulado: o contato de outra conta não aparece nas sugestões')
    await escolherConta(page, 'Suporte 1001')

    // ─── Asterisk (opcional) ───
    if (process.env.PBX_WS) {
        const dominio = process.env.PBX_DOMAIN ?? '127.0.0.1'
        // Servidor pela janela própria, aberta do cadastro da conta, com o Testar (OPTIONS) antes de salvar.
        form = await abrirNovaConta(page)
        await form.getByRole('combobox', { name: 'Servidor', exact: true }).selectOption({ label: '+ Novo servidor…' })
        const teste = await preencherServidor(page, { nome: 'Asterisk', dominio, testar: true })
        if (!/^Respondeu ao OPTIONS em \d+ ms/.test(teste)) throw new Error(`o Testar do servidor falhou: ${teste}`)
        await form.getByRole('textbox', { name: 'Nome', exact: true }).fill('Chamada 2001')
        await form.getByLabel('Ramal').fill('2001')
        await form.getByLabel('Senha').fill('1234')
        await form.getByRole('button', { name: 'Salvar', exact: true }).click()
        await formConta(page).waitFor({ state: 'detached' })
        await esperarRegistro(page, 'Chamada 2001')
        step(`Asterisk: cadastra servidor (${teste}) e conta UDP 2001 pela tela e registra`)
        await criarConta(page, { nome: 'Chamada 2002', ramal: '2002', servidor: 'Asterisk', autoAtender: true })
        await escolherConta(page, 'Chamada 2001')

        const ate2002 = /2001\s*→\s*2002/
        await ligar('2002', 20000)
        step('Asterisk: 2001 liga para 2002 e a chamada fica "em chamada"')
        // PCMA em primeiro (Ajustes → Áudio, acima): é o primeiro da oferta e o que o 200 OK escolhe.
        await abrirDepuracao(page, 'SIP')
        await contaDepuracao(page).selectOption({ label: 'Chamada 2001 · 2001' })
        const convite = mensagemSip(page, 'INVITE sip:2002').last()
        await convite.getByRole('button').first().click()
        const sdp = await convite.locator('pre').textContent()
        if (!/^m=audio \d+ RTP\/AVP 8\b/m.test(sdp)) throw new Error(`o INVITE não oferece PCMA primeiro:\n${sdp}`)
        // O Asterisk oferece "0 8" (PCMU primeiro) a 2002, e o 200 OK que a Íris responde escolhe pela ordem dela.
        // A resposta do Asterisk a 2001 segue a ordem do próprio Asterisk, por isso não é conferida.
        await contaDepuracao(page).selectOption({ label: 'Chamada 2002 · 2002' })
        const respostas = mensagemSip(page, '200 OK')
        await respostas.last().waitFor({ timeout: 10000 })
        let sdpOk = ''
        for (let i = (await respostas.count()) - 1; i >= 0 && !sdpOk; i--) {
            const linha = respostas.nth(i)
            await linha.getByRole('button').first().click()
            const texto = await linha.locator('pre').textContent()
            if (/CSeq: \d+ INVITE/.test(texto) && /^m=audio/m.test(texto)) sdpOk = texto
        }
        if (!/^m=audio \d+ RTP\/AVP 8\b/m.test(sdpOk)) throw new Error(`o 200 OK de 2002 não escolheu PCMA:\n${sdpOk}`)
        await chamadaAtiva(page, /2002\s*←\s*2001/)
            .getByText('PCMA', { exact: true })
            .waitFor({ timeout: 10000 })
        await recolherDepuracao(page).click()
        step('Asterisk: a ordem dos codecs vai para o INVITE (PCMA primeiro) e para o 200 OK da chamada recebida')
        await esperaERetomada(ate2002)
        step('Asterisk: espera e retomada')
        antes = await contarLinhas(page, LINHA_TRANSFERENCIA)
        await transferirCega(page, ate2002, '600')
        await esperarLinhaNova(page, LINHA_TRANSFERENCIA, antes, 15000)
        await chamadaAtiva(page, ate2002).waitFor({ state: 'detached', timeout: 15000 })
        step('Asterisk: transferência cega termina com o NOTIFY 200')
        await desligar(/2002\s*←\s*2001/)
        await page.waitForTimeout(500)

        await ligar('8000', 20000)
        antes = await contarLinhas(page, linhaDtmf(1))
        await enviarDtmf(page, /2001\s*→\s*8000/, 'w1 4321')
        await esperarLinhaNova(page, linhaDtmf(1), antes, 10000)
        step('Asterisk: DTMF enviado para a URA 8000')
        await page.waitForTimeout(1500)
        const restante = chamadaAtiva(page, /2001\s*→\s*8000/)
        if (await restante.count()) await desligar(/2001\s*→\s*8000/)
        step('Asterisk: chamada encerrada')
    } else {
        console.log('- Asterisk: pulado (defina PBX_WS para rodar com o PBX de teste)')
    }

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('Chamada pela tela OK')
} catch (error) {
    failed = true
    console.error('FALHOU:', error.message)
    await page.screenshot({ path: `${userData}/falha.png` }).catch(() => {})
    console.error(`captura em ${userData}/falha.png`)
} finally {
    await app.close().catch(() => {})
    if (!failed) rmSync(userData, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
