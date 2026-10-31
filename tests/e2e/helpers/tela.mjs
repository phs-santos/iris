// Seletores e gestos da tela usados pelo teste de chamada (tests/e2e/chamada.mjs).
// Todo seletor fica aqui: quando a interface mudar, só este arquivo precisa ser atualizado.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Abre o app com o microfone falso e a janela isolada do mouse do computador (ver `isolarDoMouse`). Todo e2e
 * abre por aqui. Sem `userData`, cria uma pasta de dados nova; `executablePath` testa um app empacotado;
 * `args` vai depois do '.' (ou sozinho, com `executablePath`).
 */
export async function abrir({ userData, prefixo = 'iris-e2e-', executablePath, args: extra = [], env = {} } = {}) {
    userData ??= mkdtempSync(join(tmpdir(), prefixo))
    const args = executablePath ? [...extra] : ['.', ...extra]
    if (process.getuid?.() === 0) args.push('--no-sandbox')
    const app = await electron.launch({
        executablePath,
        args,
        env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', ...env }
    })
    const page = await app.firstWindow()
    await isolarDoMouse(app)
    return { app, page, userData }
}

/**
 * A janela de teste não recebe o mouse de verdade do computador, só os cliques do Playwright (que entram
 * pelo Chromium, não pelo sistema). Sem isso, um clique de quem está usando a máquina, quando a janela
 * abre por baixo do ponteiro, fechava o seletor de contas no meio do teste (a falha que aparecia de vez
 * em quando no começo do chamada.mjs).
 */
export async function isolarDoMouse(app) {
    await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
            win.setIgnoreMouseEvents(true)
            // Nem o teclado de verdade: uma tecla de quem usa a máquina caía na busca do seletor no meio do teste.
            win.setFocusable(false)
        }
    })
}

/** Avatar da conta atual, no topo da barra de ícones: abre o seletor de contas. */
export const avatar = (page) => page.getByRole('button', { name: /^(Conta atual|Nenhuma conta)/ })

/** O seletor de contas aberto. */
export const seletor = (page) => page.getByRole('dialog', { name: 'Contas' })

/** Linha de uma conta no seletor. */
export const linhaDaConta = (page, nome) => seletor(page).locator('.row', { hasText: nome })

export async function abrirSeletor(page) {
    if (!(await seletor(page).isVisible())) await avatar(page).click()
    await seletor(page).waitFor()
}

export async function fecharSeletor(page) {
    if (!(await seletor(page).isVisible())) return
    await page.keyboard.press('Escape')
    await seletor(page).waitFor({ state: 'detached' })
}

/** Espera a conta registrar, olhando a bolinha dela no seletor. */
export async function esperarRegistro(page, nome, timeout = 15000) {
    await abrirSeletor(page)
    await linhaDaConta(page, nome).locator('.dot.registered').waitFor({ timeout })
    await fecharSeletor(page)
}

/** Espera o seletor mostrar `n` contas carregadas, sem esperar registro. */
export async function esperarContas(page, n = 3, timeout = 15000) {
    // Primeiro as contas carregam (o avatar passa a dizer a conta atual); só então o seletor abre. Aberto antes,
    // o aviso de arquivo estragado podia surgir no alto e empurrar a tela no meio do clique.
    await page.getByRole('button', { name: /^Conta atual/ }).waitFor({ timeout })
    await page.waitForTimeout(300)
    await abrirSeletor(page)
    await seletor(page).getByText(`${n} contas`).waitFor({ timeout })
    await fecharSeletor(page)
}

/** Espera as contas de exemplo do modo simulado carregarem e as duas primeiras registrarem. */
export async function esperarContasSimuladas(page) {
    await abrirSeletor(page)
    await seletor(page).getByText('3 contas').waitFor()
    await seletor(page).locator('.dot.registered').nth(1).waitFor()
    await fecharSeletor(page)
}

/**
 * Cria uma etiqueta e põe nas contas indicadas, gravando direto pelos canais de dados e recarregando a tela.
 * Atalho para os testes que só precisam de uma conta etiquetada; a tela fica coberta em chamada.mjs.
 */
export async function etiquetar(page, etiqueta, contas) {
    await page.evaluate(
        async ({ etiqueta, contas }) => {
            const tag = { id: crypto.randomUUID(), name: etiqueta, color: '#7c3aed' }
            await window.iris.tags.save([...(await window.iris.tags.load()), tag])
            const list = await window.iris.accounts.load()
            await window.iris.accounts.save(
                list.map((a) => (contas.includes(a.name) ? { ...a, tagIds: [...a.tagIds, tag.id] } : a))
            )
        },
        { etiqueta, contas }
    )
    await page.reload()
}

/** No seletor aberto, liga (ou desliga) o filtro de uma etiqueta. */
export async function filtrarPorEtiqueta(page, etiqueta) {
    await seletor(page)
        .getByRole('group', { name: 'Filtrar por etiqueta' })
        .getByRole('button', { name: etiqueta, exact: true })
        .click()
}

/** Título da coluna de discar ("Discar de …"). */
export const tituloDiscar = (page) => page.getByRole('heading', { name: /^Discar de / })

/** Janela de cadastro de conta aberta. */
export const formConta = (page) => page.getByRole('dialog', { name: /^(Nova conta|Editar )/ }).first()

/** Janela de servidor aberta (do cadastro de conta ou de Ajustes → Servidores). */
export const janelaServidor = (page) => page.getByRole('dialog', { name: /^(Novo servidor|Editar )/ }).last()

/** Abre o cadastro de uma conta nova pelo seletor. */
export async function abrirNovaConta(page) {
    await abrirSeletor(page)
    await seletor(page).getByRole('button', { name: 'Nova conta' }).click()
    await formConta(page).waitFor()
    return formConta(page)
}

/**
 * Preenche a janela de servidor aberta e salva. Com `testar`, aperta Testar antes e espera a resposta do OPTIONS.
 * Devolve o texto do teste, ou null.
 */
export async function preencherServidor(page, { nome, dominio, transporte = 'UDP', endereco, wss, testar = false }) {
    const janela = janelaServidor(page)
    await janela.getByRole('textbox', { name: 'Nome', exact: true }).fill(nome)
    await janela.getByLabel('Domínio SIP').fill(dominio)
    await janela.getByRole('radiogroup', { name: 'Transporte' }).getByRole('radio', { name: transporte }).click()
    if (endereco) await janela.getByLabel('Endereço:porta').fill(endereco)
    if (wss) await janela.getByLabel('Endereço WSS').fill(wss)
    let resultado = null
    if (testar) {
        await janela.getByRole('button', { name: 'Testar' }).click()
        const status = janela.getByRole('status')
        await status.filter({ hasText: /Respondeu|Não respondeu/ }).waitFor({ timeout: 10000 })
        resultado = (await status.textContent()).trim()
    }
    await janela.getByRole('button', { name: 'Salvar', exact: true }).click()
    await janela.waitFor({ state: 'detached' })
    return resultado
}

/** Escolhe o servidor no cadastro de conta pelo começo do nome ("PBX simulado", "Asterisk · UDP"). */
export async function escolherServidor(form, nome) {
    const select = form.getByRole('combobox', { name: 'Servidor', exact: true })
    const label = await select
        .locator('option')
        .evaluateAll(
            (options, nome) => options.map((o) => o.textContent.trim()).find((text) => text.startsWith(nome)),
            nome
        )
    if (!label) throw new Error(`servidor ${nome} não está na lista`)
    await select.selectOption({ label })
}

/** Abre o Avançado do cadastro, se estiver fechado. */
export async function abrirAvancado(janela) {
    const botao = janela.getByRole('button', { name: /^Avançado/ })
    if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
}

/** Cadastra uma conta pela tela (o servidor já precisa existir) e espera registrar. */
export async function criarConta(page, { nome, ramal, servidor, senha = '1234', autoAtender = false }) {
    const form = await abrirNovaConta(page)
    await form.getByRole('textbox', { name: 'Nome', exact: true }).fill(nome)
    await escolherServidor(form, servidor)
    await form.getByLabel('Ramal').fill(ramal)
    await form.getByLabel('Senha').fill(senha)
    if (autoAtender) {
        await abrirAvancado(form)
        await form.getByLabel('Atender sozinho após').check()
    }
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    await esperarRegistro(page, nome)
}

/** A janela de Ajustes. */
export const ajustes = (page) => page.getByRole('dialog', { name: 'Ajustes' })

/** Abre os Ajustes pela barra de ícones e, com `secao`, vai para ela (Áudio, Servidores, Etiquetas…). */
export async function abrirAjustes(page, secao) {
    if (!(await ajustes(page).isVisible())) await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
    await ajustes(page).waitFor()
    if (secao) await ajustes(page).getByRole('tab', { name: secao, exact: true }).click()
    return ajustes(page)
}

export async function fecharAjustes(page) {
    await ajustes(page).getByRole('button', { name: 'Fechar', exact: true }).first().click()
    await ajustes(page).waitFor({ state: 'detached' })
}

/** Linha de um codec em Ajustes → Áudio. */
export const linhaCodec = (page, nome) => ajustes(page).locator('li[data-codec]', { hasText: nome })

/** Põe um codec em primeiro na ordem, pelos botões ↑ (o caminho do teclado). */
export async function codecPrimeiro(page, nome) {
    const subir = ajustes(page).getByRole('button', { name: `Subir ${nome}` })
    while (await subir.isEnabled()) await subir.click()
}

/** Torna a conta a atual pelo seletor: é dela que o discador liga. */
export async function escolherConta(page, nome) {
    await abrirSeletor(page)
    await clicarConta(page, nome)
}

/** No seletor aberto, clica na conta (no lado do nome: as ações da linha ficam à direita) e espera fechar. */
export async function clicarConta(page, nome) {
    await linhaDaConta(page, nome)
        .locator('.pick')
        .click({ position: { x: 16, y: 12 } })
    await seletor(page).waitFor({ state: 'detached' })
}

/** Tira fina da depuração recolhida ("SIP · Fluxo · Log"), e o botão que recolhe a gaveta aberta. */
export const tiraDepuracao = (page) => page.getByRole('button', { name: /^SIP · Fluxo · Log/ })
export const recolherDepuracao = (page) => page.getByRole('button', { name: 'Recolher a depuração' })

/** Abre a gaveta de depuração, que começa recolhida; com `aba`, vai para ela (SIP, Fluxo, Log ou Saúde). */
export async function abrirDepuracao(page, aba) {
    if (await tiraDepuracao(page).isVisible()) await tiraDepuracao(page).click()
    if (aba) await abaDepuracao(page, aba).click()
}

/** Aba da gaveta de depuração. */
export const abaDepuracao = (page, nome) =>
    page.getByRole('tablist', { name: 'Abas da depuração' }).getByRole('tab', { name: nome, exact: true })

/** Filtro de conta da gaveta ("Todas" ou "nome · ramal"). */
export const contaDepuracao = (page) => page.getByRole('combobox', { name: 'Conta da depuração' })

/** Alça que muda o tamanho da gaveta aberta. */
export const alcaDepuracao = (page) => page.getByRole('separator', { name: 'Tamanho da depuração' })

/** Mensagem da aba SIP, pela primeira linha ("INVITE sip:…", "200 OK"). */
export const mensagemSip = (page, texto) => page.locator('#debug-tabpanel .line.sip', { hasText: texto })

/** Campo do número do discador (combobox com as sugestões dos contatos da conta atual). */
export const campoNumero = (page) => page.getByRole('combobox', { name: 'Número' })

/** Lista de sugestões aberta embaixo do campo. */
export const sugestoes = (page) => page.getByRole('listbox', { name: /^Contatos de / })

/** Opção da lista de sugestões, pelo texto. */
export const sugestao = (page, texto) => sugestoes(page).getByRole('option', { name: texto })

/** Abre a janela de contatos de uma conta pelo menu dela no seletor. */
export async function abrirContatos(page, conta) {
    await abrirSeletor(page)
    await linhaDaConta(page, conta).click({ button: 'right', position: { x: 16, y: 12 } })
    await seletor(page).getByRole('menuitem', { name: 'Contatos' }).click()
    const janela = janelaContatos(page, conta)
    await janela.waitFor()
    return janela
}

/** Janela de contatos de uma conta. */
export const janelaContatos = (page, conta) => page.getByRole('dialog', { name: `Contatos de ${conta}` })

/** Cadastra um contato na conta pela janela de contatos e fecha a janela. */
export async function criarContato(page, conta, nome, numero) {
    const janela = await abrirContatos(page, conta)
    await janela.getByRole('button', { name: '+ Novo contato' }).click()
    await janela.getByRole('textbox', { name: 'Nome', exact: true }).fill(nome)
    await janela.getByLabel('Número ou ramal').fill(numero)
    await janela.getByRole('button', { name: 'Salvar', exact: true }).click()
    await janela.locator('.contact', { hasText: nome }).waitFor()
    await page.keyboard.press('Escape')
    await janela.waitFor({ state: 'detached' })
}

/** Detalhes da conta atual, que a coluna de chamadas mostra quando não há chamada. */
export const detalhesDaConta = (page, conta) => page.getByRole('region', { name: `Detalhes de ${conta}` })

/** Digita o número e liga. */
export async function discar(page, numero) {
    await campoNumero(page).fill(numero)
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
}

/** Linha de uma chamada que ainda não terminou, achada pelo número ("ramal → número" ou "ramal ← número"). */
export function chamadaAtiva(page, numero) {
    return page.locator('.call:not(.ended)', { hasText: numero })
}

/** Linha de uma chamada já encerrada. */
export function chamadaEncerrada(page, numero) {
    return page.locator('.call.ended', { hasText: numero })
}

/** Estado da linha ("em chamada", "em espera"...). */
export function estado(cartao, texto) {
    return cartao.locator('.pill', { hasText: texto })
}

/** Botão de ação da linha: 'Mudo', 'Espera', 'Retomar', 'DTMF', 'Transferir' ou 'Desligar'. */
export function acao(page, numero, nome) {
    return chamadaAtiva(page, numero).getByRole('button', { name: nome, exact: true })
}

/** Envia dígitos DTMF pelo campo que o botão DTMF abre. */
export async function enviarDtmf(page, numero, digitos) {
    await acao(page, numero, 'DTMF').click()
    const cartao = chamadaAtiva(page, numero)
    await cartao.getByLabel('Sequência DTMF').fill(digitos)
    await cartao.getByRole('button', { name: 'Enviar' }).click()
}

/** Transferência cega: abre o campo, digita o destino e confirma em "Cega". */
export async function transferirCega(page, numero, destino) {
    await acao(page, numero, 'Transferir').click()
    const cartao = chamadaAtiva(page, numero)
    await cartao.getByLabel('Destino').fill(destino)
    await cartao.getByRole('button', { name: 'Cega' }).click()
}

/** Abre a gaveta numa aba com o filtro em "Todas" as contas. */
export async function verTodas(page, aba) {
    await abrirDepuracao(page, aba)
    await contaDepuracao(page).selectOption({ label: 'Todas' })
}

/** Linha da aba aberta da gaveta (Log ou SIP). */
export const linhaDepuracao = (page, texto) => page.locator('#debug-tabpanel .line', { hasText: texto })

/** Quantas linhas da aba Log, com todas as contas, casam com o texto. */
export async function contarLinhas(page, texto) {
    await verTodas(page, 'Log')
    return linhaDepuracao(page, texto).count()
}

/** Espera aparecer uma linha do log além das `antes` que já existiam: só vale o que veio depois do gesto. */
export async function esperarLinhaNova(page, texto, antes, timeout = 10000) {
    const limite = Date.now() + timeout
    while (Date.now() < limite) {
        if ((await contarLinhas(page, texto)) > antes) return
        await page.waitForTimeout(200)
    }
    throw new Error(`nenhuma linha nova do log com ${texto} (havia ${antes})`)
}

/** Linha de andamento final da transferência (NOTIFY do REFER). */
export const LINHA_TRANSFERENCIA = 'Transferência: 200 OK'

/** Linha que a Íris escreve a cada dígito DTMF enviado. */
export const linhaDtmf = (digito) => `DTMF enviado: ${digito}`
