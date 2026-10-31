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
    linhaDaConta,
    seletor,
    tituloDiscar,
    transferirCega
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

    // O seletor troca a conta atual: filtra por etiqueta, escolhe, e o título do discar muda.
    await etiquetar(page, 'Comercial', ['Vendas 1002'])
    await esperarContasSimuladas(page)
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

    const ura = /→\s*8000/
    await ligar('8000', 5000)
    step('simulado: a chamada para 8000 aparece "em chamada" em até 5 s')
    let antes = await contarLinhas(page, linhaDtmf(3))
    await enviarDtmf(page, ura, '123')
    await esperarLinhaNova(page, linhaDtmf(3), antes, 5000)
    step('simulado: o log mostra o DTMF')
    await esperaERetomada(ura)
    step('simulado: "em espera" aparece e some')
    await desligar(ura)
    step('simulado: a chamada some depois de desligar')

    const para1002 = /→\s*1002/
    await ligar('1002', 5000)
    antes = await contarLinhas(page, LINHA_TRANSFERENCIA)
    await transferirCega(page, para1002, '1003')
    await esperarLinhaNova(page, LINHA_TRANSFERENCIA, antes, 10000)
    await chamadaAtiva(page, para1002).waitFor({ state: 'detached', timeout: 10000 })
    step('simulado: transferência cega para 1003 termina com 200 OK e libera a chamada')

    // ─── Asterisk (opcional) ───
    if (process.env.PBX_WS) {
        const dominio = process.env.PBX_DOMAIN ?? '127.0.0.1'
        await criarConta(page, { nome: 'Chamada 2001', ramal: '2001', dominio })
        await criarConta(page, { nome: 'Chamada 2002', ramal: '2002', dominio, autoAtender: true })
        await escolherConta(page, 'Chamada 2001')

        const ate2002 = /2001\s*→\s*2002/
        await ligar('2002', 20000)
        step('Asterisk: 2001 liga para 2002 e a chamada fica "em chamada"')
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
