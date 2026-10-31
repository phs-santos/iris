// Teste de fumaça de ponta a ponta no modo simulado: abre o app, liga de 1001 para 1002,
// espera o auto-atender, envia DTMF e desliga. Uso: npm run build && node tests/e2e/smoke.mjs
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
    abaDepuracao,
    abrir,
    abrirSeletor,
    discar,
    fecharSeletor,
    linhaDaConta,
    linhaDepuracao,
    seletor,
    verTodas
} from './helpers/tela.mjs'

const shots = process.env.SHOTS_DIR
// IRIS_EXECUTABLE testa um build empacotado (ex.: dist/linux-unpacked/iris).
const { app, page, userData } = await abrir({ executablePath: process.env.IRIS_EXECUTABLE })
// Erros do processo principal e da página: um canal de IPC que a interface chama antes de existir
// não derruba nenhum passo abaixo, mas quebra o app instalado (aconteceu na 1.0.4).
let mainErrors = ''
app.process().stderr.on('data', (chunk) => (mainErrors += chunk))
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
await page.setViewportSize?.({ width: 1360, height: 820 }).catch(() => {})
const step = (msg) => console.log(`✓ ${msg}`)

try {
    await abrirSeletor(page)
    await seletor(page).getByText('3 contas').waitFor()
    step('contas de exemplo carregadas')
    await linhaDaConta(page, 'Lab 2001').locator('.meta', { hasText: '403 Forbidden' }).waitFor()
    await seletor(page).locator('.dot.registered').nth(1).waitFor()
    step('1001 e 1002 registradas, Lab 2001 com 403')
    if (shots) await page.screenshot({ path: join(shots, '1-inicio.png') })

    // "Por quê?" explica o erro em português; a busca filtra por nome ou ramal.
    await seletor(page).getByRole('button', { name: 'Por que Lab 2001 não registrou?' }).click()
    await linhaDaConta(page, 'Lab 2001').getByText('O PBX recusou o login').waitFor()
    await seletor(page).getByRole('searchbox', { name: 'Procurar conta' }).fill('2001')
    await linhaDaConta(page, 'Suporte 1001').waitFor({ state: 'detached' })
    await seletor(page).getByRole('searchbox', { name: 'Procurar conta' }).fill('')
    await fecharSeletor(page)
    if ((await page.getByRole('button', { name: /^Conta atual: Suporte 1001.*1 conta com erro/ }).count()) !== 1)
        throw new Error('o avatar não diz que há 1 conta com erro além da atual')
    step('seletor explica o erro, busca, e o avatar conta as outras contas com erro')

    await discar(page, '1002')
    await page.locator('.pill', { hasText: 'tocando' }).waitFor()
    step('1002 tocando')
    if (shots) await page.screenshot({ path: join(shots, '2-tocando.png') })
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 5000 })
    step('auto-atender conectou os dois lados')

    const outgoing = page.locator('.call', { hasText: '→' })
    await outgoing.getByRole('button', { name: 'DTMF' }).click()
    await outgoing.getByLabel('Sequência DTMF').fill('1w0.3 2#')
    await outgoing.getByRole('button', { name: 'Enviar' }).click()
    await page.locator('.call', { hasText: 'DTMF recebido 12#' }).waitFor({ timeout: 5000 })
    step('1002 recebeu o DTMF 12#')

    await outgoing.getByRole('button', { name: 'Espera' }).click()
    await page.locator('.pill', { hasText: 'em espera (remoto)' }).waitFor()
    step('espera chegou ao outro lado')
    if (shots) await page.screenshot({ path: join(shots, '3-em-chamada.png') })

    await outgoing.getByRole('button', { name: 'Desligar' }).click()
    await page.locator('.pill', { hasText: 'encerrada' }).nth(1).waitFor()
    step('chamada encerrada dos dois lados')

    // Ligar para um número digitado (8000, a URA do modo simulado).
    await page.getByLabel('Número', { exact: true }).fill('8000')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    const ura = page.locator('.call', { hasText: /→\s*8000/ })
    await ura.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 8000 })
    await ura.getByRole('button', { name: 'Desligar' }).click()
    step('liga para o número digitado')

    // Transferência assistida (RF-16): 1001 liga para 1002, que consulta a URA 8000 e transfere.
    const live = (text) => page.locator('.call:not(.ended)', { hasText: text })
    await discar(page, '1002')
    await page.locator('.call:not(.ended) .pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 5000 })
    const received = live('←')
    await received.getByRole('button', { name: 'Transferir' }).click()
    await received.getByLabel('Destino').fill('8000')
    await received.getByRole('button', { name: 'Consultar antes' }).click()
    const consult = live('Consulta para transferir')
    await consult.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 5000 })
    step('1002 pôs 1001 em espera e a URA atendeu a consulta')
    if (shots) await page.screenshot({ path: join(shots, '4-consulta.png') })
    await consult.getByRole('button', { name: 'Concluir transferência' }).click()
    await page.getByText('1 ativa', { exact: true }).waitFor({ timeout: 5000 })
    await verTodas(page, 'Log')
    await linhaDepuracao(page, 'Agora em chamada com 8000').waitFor()
    step('transferência assistida ligou 1001 com a URA e liberou 1002')
    await live('→').getByRole('button', { name: 'Desligar' }).click()
    await page.getByText('0 ativas').waitFor()

    // Escolha de áudio (RF-19).
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
    const audio = page.getByRole('dialog', { name: 'Ajustes' })
    await audio.getByRole('tab', { name: 'Áudio' }).click()
    await audio.getByRole('meter', { name: 'Nível do microfone' }).waitFor()
    const mics = await audio.getByLabel('Microfone', { exact: true }).locator('option').count()
    if (mics < 2) throw new Error('Nenhum microfone listado no diálogo de áudio')
    await audio.getByLabel('Microfone', { exact: true }).selectOption({ index: 1 })
    await linhaDepuracao(page, 'Microfone: ').waitFor()
    if (shots) await page.screenshot({ path: join(shots, '5-audio.png') })
    step('Ajustes › Áudio lista e troca o microfone')

    // Aparência: o tema claro é o padrão; a cor de destaque e o tema valem na hora e ficam salvos.
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
    if ((await theme()) !== 'light') throw new Error(`O tema padrão deveria ser o claro: ${await theme()}`)
    await audio.getByRole('tab', { name: 'Aparência' }).click()
    await audio.getByLabel('Escolher outra cor').fill('#c084fc')
    const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))
    if ((await accent()).trim() !== '#c084fc') throw new Error(`Cor de destaque não mudou: ${await accent()}`)
    await audio.getByRole('radio', { name: 'Escuro' }).click()
    if ((await theme()) !== 'dark') throw new Error('O tema escuro não foi aplicado')
    const saved = await page.evaluate(() => window.iris.settings.load())
    if (saved.appearance?.accent !== '#c084fc' || saved.appearance?.theme !== 'dark')
        throw new Error(`Aparência não foi salva: ${JSON.stringify(saved.appearance)}`)
    await audio.getByRole('radio', { name: 'Claro' }).click()
    await audio.getByRole('button', { name: 'Cor padrão' }).click()
    step('Ajustes › Aparência troca e salva o tema e a cor de destaque')
    // O Guia fica no pé dos Ajustes (saiu da barra de ícones): abre no lugar deles.
    if (await page.getByRole('navigation', { name: 'Navegação' }).getByRole('button', { name: 'Guia' }).count())
        throw new Error('o Guia ainda está na barra de ícones')
    await audio.getByRole('button', { name: 'Guia' }).click()
    await page.getByRole('dialog', { name: 'Guia da Íris' }).waitFor()
    await audio.waitFor({ state: 'detached' })
    await page.keyboard.press('Escape')
    step('o Guia abre pelo pé dos Ajustes')

    await abaDepuracao(page, 'SIP').click()
    await linhaDepuracao(page, 'INVITE sip:1002@demo.local').first().waitFor()
    step('log SIP bruto mostra o INVITE')
    if (shots) await page.screenshot({ path: join(shots, '6-log-sip.png') })

    // Diagrama de escada: a chamada vira setas, e a seta abre a mensagem completa.
    await abaDepuracao(page, 'Fluxo').click()
    const ladder = page.locator('#debug-tabpanel')
    await ladder.locator('.what', { hasText: 'INVITE → 200 OK' }).first().click()
    await ladder
        .getByRole('button', { name: /^INVITE, / })
        .first()
        .click()
    await ladder.locator('pre', { hasText: 'Call-ID:' }).waitFor()
    for (const label of ['100 Trying', '200 OK', 'ACK'])
        await ladder
            .getByRole('button', { name: new RegExp(`^${label}, `) })
            .first()
            .waitFor()
    if (shots) await page.screenshot({ path: join(shots, '7-fluxo-sip.png') })
    step('fluxo SIP desenha a chamada e abre a mensagem ao clicar')

    if (/No handler registered|Error occurred in handler/.test(mainErrors))
        throw new Error(`Erro de IPC no processo principal:\n${mainErrors.slice(0, 600)}`)
    if (pageErrors.length) throw new Error(`Erros na interface:\n${pageErrors.join('\n')}`)
    // O log interno (RNF-14) pega também os erros que o Vue trata e não chegam ao pageerror.
    const logErrors = readFileSync(join(userData, 'logs', 'iris.log'), 'utf8')
        .split('\n')
        .filter((line) => / ERROR /.test(line))
    if (logErrors.length) throw new Error(`Erros no log interno:\n${logErrors.join('\n')}`)
    step('nenhum erro de IPC, da interface nem no log interno durante o teste')
    console.log('Fumaça OK')
} catch (error) {
    if (shots) await page.screenshot({ path: join(shots, 'erro.png') })
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
