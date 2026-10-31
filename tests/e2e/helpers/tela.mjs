// Seletores e gestos da tela usados pelo teste de chamada (tests/e2e/chamada.mjs).
// Todo seletor fica aqui: quando a interface mudar, só este arquivo precisa ser atualizado.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Abre o app com uma pasta de dados nova e o microfone falso. Devolve também a pasta usada. */
export async function abrir() {
    const userData = mkdtempSync(join(tmpdir(), 'iris-chamada-'))
    const args = ['.']
    if (process.getuid?.() === 0) args.push('--no-sandbox')
    const app = await electron.launch({
        args,
        env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
    })
    const page = await app.firstWindow()
    return { app, page, userData }
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

/** Espera as contas de exemplo do modo simulado carregarem e as duas primeiras registrarem. */
export async function esperarContasSimuladas(page) {
    await abrirSeletor(page)
    await seletor(page).getByText('3 contas').waitFor()
    await seletor(page).locator('.dot.registered').nth(1).waitFor()
    await fecharSeletor(page)
}

/**
 * Cria uma etiqueta e põe nas contas indicadas, gravando direto pelos canais de dados e recarregando a tela.
 * A tela de etiquetas (Ajustes → Etiquetas) ainda não existe.
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

/** Cadastra uma conta de SIP puro (UDP por padrão) pelo formulário e espera registrar. */
export async function criarConta(
    page,
    { nome, ramal, dominio, senha = '1234', transporte = 'UDP', autoAtender = false }
) {
    await abrirSeletor(page)
    await seletor(page).getByRole('button', { name: 'Nova conta' }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('textbox', { name: 'Nome' }).fill(nome)
    await form.getByRole('textbox', { name: 'Ramal' }).fill(ramal)
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill(dominio)
    await form.getByLabel('Senha').fill(senha)
    await form.getByLabel('Transporte').selectOption({ label: `SIP por ${transporte}` })
    if (autoAtender) await form.getByText('Auto-atender após').locator('input[type=checkbox]').check()
    await form.getByRole('button', { name: 'Salvar e registrar' }).click()
    await esperarRegistro(page, nome)
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

/** Abre o painel de depuração (SIP · Fluxo · Log), que começa recolhido. */
export async function abrirDepuracao(page) {
    const tira = page.getByRole('button', { name: /^Abrir a depuração/ })
    if (await tira.isVisible()) await tira.click()
}

/** Digita o número e liga. */
export async function discar(page, numero) {
    await page.getByLabel('Número').fill(numero)
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
}

/** Cartão de uma chamada que ainda não terminou, achado pelo número ("conta → número" ou "conta ← número"). */
export function chamadaAtiva(page, numero) {
    return page.locator('.call:not(.ended)', { hasText: numero })
}

/** Cartão de uma chamada já encerrada. */
export function chamadaEncerrada(page, numero) {
    return page.locator('.call.ended', { hasText: numero })
}

/** Estado do cartão ("em chamada", "em espera"...). */
export function estado(cartao, texto) {
    return cartao.locator('.pill', { hasText: texto })
}

/** Botão de ação do cartão: 'Mudo', 'Espera', 'Retomar', 'DTMF', 'Transferir' ou 'Desligar'. */
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

/** Quantas linhas do log (aba "Tudo", com eventos e SIP bruto) casam com o texto. */
export async function contarLinhas(page, texto) {
    await abrirDepuracao(page)
    await page.getByRole('tab', { name: 'Tudo' }).click()
    return page.locator('.line', { hasText: texto }).count()
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
