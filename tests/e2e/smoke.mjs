// Teste de fumaça de ponta a ponta no modo simulado: abre o app, liga de 1001 para 1002,
// espera o auto-atender, envia DTMF e desliga. Uso: npm run build && node tests/e2e/smoke.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const shots = process.env.SHOTS_DIR
// IRIS_EXECUTABLE testa um build empacotado (ex.: dist/linux-unpacked/iris).
const executablePath = process.env.IRIS_EXECUTABLE
const args = executablePath ? [] : ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')

const app = await electron.launch({
    executablePath,
    args,
    // IRIS_FAKE_MEDIA: microfone falso, sem depender de hardware nem do pedido de permissão do sistema.
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
})
// Erros do processo principal e da página: um canal de IPC que a interface chama antes de existir
// não derruba nenhum passo abaixo, mas quebra o app instalado (aconteceu na 1.0.4).
let mainErrors = ''
app.process().stderr.on('data', (chunk) => (mainErrors += chunk))
const page = await app.firstWindow()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
await page.setViewportSize?.({ width: 1360, height: 820 }).catch(() => {})
const step = (msg) => console.log(`✓ ${msg}`)

try {
    await page.getByText('3 contas · 2 PBX').waitFor()
    step('contas de exemplo carregadas')
    await page.locator('.status', { hasText: '403 Forbidden' }).waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()
    step('1001 e 1002 registradas, Lab 2001 com 403')
    if (shots) await page.screenshot({ path: join(shots, '1-inicio.png') })

    // Grupos de PBX recolhem e mostram o resumo; os primeiros passos aparecem no primeiro uso.
    await page.getByRole('button', { name: /lab\.local/ }).click()
    await page.getByRole('button', { name: /lab\.local.*0\/1 no ar/ }).waitFor()
    if (await page.locator('.acc', { hasText: 'Lab 2001' }).count())
        throw new Error('o grupo recolhido ainda mostra a conta')
    await page.getByRole('button', { name: /lab\.local/ }).click()
    await page.locator('.acc', { hasText: 'Lab 2001' }).waitFor()
    step('grupo de PBX recolhe com o resumo e volta')
    const firstSteps = page.getByRole('region', { name: 'Primeiros passos' })
    await firstSteps.getByText('0 de 3').waitFor()

    await page.locator('.chip', { hasText: '1002' }).click()
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
    await firstSteps.getByText('1 de 3').waitFor()
    await firstSteps.getByRole('button', { name: 'Fechar os primeiros passos' }).click()
    await firstSteps.waitFor({ state: 'detached' })
    step('primeiros passos: a chamada de teste marca o passo 1, e Fechar tira o quadro')

    // Histórico (RF-40): as duas pontas da chamada ficam na lista e no arquivo.
    await page.getByRole('tab', { name: 'Histórico' }).click()
    const history = page.locator('.history .entry')
    await history.filter({ hasText: '1002' }).filter({ hasText: 'Suporte 1001' }).first().waitFor()
    await history.filter({ hasText: '1001' }).filter({ hasText: 'Vendas 1002' }).first().waitFor()
    const calls = JSON.parse(readFileSync(join(userData, 'history.json'), 'utf8')).entries
    if (calls.length !== 2 || !calls.every((e) => e.answered && e.durationMs > 0))
        throw new Error(`histórico gravado errado: ${JSON.stringify(calls)}`)
    await page.getByRole('button', { name: 'Ligar de novo para 1002' }).click()
    await page
        .locator('.call', { hasText: /1001\s*→\s*1002/ })
        .locator('.pill', { hasText: 'em chamada' })
        .waitFor({ timeout: 8000 })
    await page
        .locator('.call', { hasText: /1001\s*→\s*1002/ })
        .getByRole('button', { name: 'Desligar' })
        .click()
    await page.locator('.pill', { hasText: 'encerrada' }).nth(1).waitFor()
    step('histórico lista a chamada, grava em history.json e liga de novo')

    // Paleta de comandos (Ctrl/Cmd+K): acha conta e liga para um número digitado.
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Paleta de comandos' })
    await palette.getByRole('combobox').fill('vendas')
    await palette.getByRole('option', { name: /Desregistrar Vendas 1002/ }).waitFor()
    await palette.getByRole('combobox').fill('8000')
    await palette.getByRole('option', { name: 'Ligar para 8000' }).waitFor()
    await page.keyboard.press('Enter')
    const ura = page.locator('.call', { hasText: /→\s*8000/ })
    await ura.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 8000 })
    await ura.getByRole('button', { name: 'Desligar' }).click()
    step('paleta de comandos acha a conta e liga para o número digitado')

    // Transferência assistida (RF-16): 1001 liga para 1002, que consulta a URA 8000 e transfere.
    const live = (text) => page.locator('.call:not(.ended)', { hasText: text })
    await page.locator('.chip', { hasText: '1002' }).click()
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
    await page.getByText('1 chamadas').waitFor({ timeout: 5000 })
    await page.locator('.line', { hasText: 'Agora em chamada com 8000' }).waitFor()
    step('transferência assistida ligou 1001 com a URA e liberou 1002')
    await live('→').getByRole('button', { name: 'Desligar' }).click()
    await page.getByText('0 chamadas').waitFor()

    // Escolha de áudio (RF-19).
    await page.getByRole('button', { name: 'Configurações' }).click()
    const audio = page.getByRole('dialog', { name: 'Configurações' })
    await audio.getByRole('tab', { name: 'Áudio' }).click()
    await audio.getByRole('meter', { name: 'Nível do microfone' }).waitFor()
    const mics = await audio.locator('select').first().locator('option').count()
    if (mics < 2) throw new Error('Nenhum microfone listado no diálogo de áudio')
    await audio.locator('select').first().selectOption({ index: 1 })
    await page.locator('.line', { hasText: 'Microfone: ' }).waitFor()
    if (shots) await page.screenshot({ path: join(shots, '5-audio.png') })
    step('Configurações › Áudio lista e troca o microfone')

    // Paleta de cores: vale na hora e fica salva.
    await audio.getByRole('tab', { name: 'Aparência' }).click()
    await audio.getByRole('radio', { name: 'Violeta' }).click()
    const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))
    if ((await accent()).trim() !== '#c084fc') throw new Error(`Cor de destaque não mudou: ${await accent()}`)
    const saved = await page.evaluate(() => window.iris.settings.load())
    if (saved.appearance?.accent !== '#c084fc') throw new Error('Cor de destaque não foi salva')
    await audio.getByRole('radio', { name: 'Azul' }).click()
    await audio.getByRole('button', { name: 'Fechar' }).click()
    step('Configurações › Aparência troca e salva a cor de destaque')

    await page.getByRole('tab', { name: 'SIP bruto' }).click()
    await page.locator('.line.sip', { hasText: 'INVITE sip:1002@demo.local' }).first().waitFor()
    step('log SIP bruto mostra o INVITE')
    if (shots) await page.screenshot({ path: join(shots, '6-log-sip.png') })

    // Diagrama de escada: a chamada vira setas, e a seta abre a mensagem completa.
    await page.getByRole('button', { name: 'Fluxo SIP' }).click()
    const ladder = page.getByRole('dialog', { name: 'Fluxo SIP' })
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
    await page.keyboard.press('Escape')
    await ladder.waitFor({ state: 'detached' })
    step('fluxo SIP desenha a chamada e abre a mensagem ao clicar')

    // Modo Telefone: janela estreita, teclado, chamada na tela inteira e volta à Bancada.
    const width = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width)
    await page.getByRole('button', { name: 'Modo Telefone' }).click()
    await page.getByRole('region', { name: 'Discar' }).waitFor()
    if ((await width()) > 500) throw new Error(`A janela do Telefone ficou larga: ${await width()} px`)
    await page.getByLabel('Conta').selectOption({ label: 'Suporte 1001 · 1001' })
    for (const k of ['1', '0', '0', '2']) await page.getByRole('button', { name: k, exact: true }).click()
    await page.getByText('Vendas 1002', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Ligar' }).click()
    const onCall = page.getByRole('region', { name: 'Chamada em andamento' })
    await onCall.getByRole('heading', { name: 'Vendas 1002' }).waitFor()
    await onCall
        .getByRole('status')
        .filter({ hasText: /^\d\d:\d\d$/ })
        .waitFor({ timeout: 8000 })
    await onCall.getByRole('button', { name: 'Espera' }).click()
    await onCall.getByText('em espera', { exact: true }).waitFor()
    await onCall.getByRole('button', { name: 'Desligar' }).click()
    await page.getByRole('region', { name: 'Discar' }).waitFor()
    await page.getByRole('button', { name: 'Bancada', exact: true }).click()
    await page.getByRole('tab', { name: 'Telefone' }).waitFor()
    if ((await width()) < 1024) throw new Error(`A Bancada não voltou ao tamanho: ${await width()} px`)
    step('modo Telefone liga, põe em espera, desliga e volta para a Bancada')
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
