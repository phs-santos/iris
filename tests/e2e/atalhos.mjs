// Links de telefone (RF-53) e atalhos globais (RF-34), no modo simulado.
// Uso: npm run build && node tests/e2e/atalhos.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
// O link chega como argumento, como no Windows e no Linux quando o sistema abre a Íris por ele.
const args = ['.', 'tel:+55 (11) 3000-0000']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
const step = (msg) => console.log(`✓ ${msg}`)
// Um segundo link, como o sistema entrega com o app já aberto.
const openLink = (url) => app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['iris', link]), url)
const fire = (action) =>
    app.evaluate(
        ({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.send('shortcuts:fired', a),
        action
    )
const settings = () => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
const ACCELERATOR = 'Control+Alt+Shift+F11'

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    const number = page.getByLabel('Número', { exact: true })
    await page.waitForFunction(() => document.querySelector('.dial-row input')?.value === '+551130000000')
    await page.getByText('Número +551130000000 recebido de um link').waitFor()
    if (await page.locator('.call').count()) throw new Error('o link ligou sem a opção de ligar direto')
    step('link tel: da abertura põe o número no discador, sem ligar')

    await openLink('sip:8000@pbx.exemplo.com;transport=tcp')
    await page.waitForFunction(() => document.querySelector('.dial-row input')?.value === '8000')
    await openLink('tel:abc')
    await openLink('https://exemplo.com')
    await page.waitForTimeout(300)
    if ((await number.inputValue()) !== '8000') throw new Error('um link inválido mexeu no discador')
    step('link sip: com o app aberto troca o número; link inválido é ignorado')

    await page.keyboard.press('ControlOrMeta+,')
    const dialog = page.getByRole('dialog', { name: 'Configurações' })
    await dialog.getByRole('tab', { name: 'Atalhos e links' }).click()
    await dialog.getByText('Só a Íris instalada consegue se registrar').waitFor()
    if (!(await dialog.getByLabel('Abrir links tel: com a Íris').isDisabled()))
        throw new Error('sem empacotar, a opção de abrir links deveria estar desligada')
    await dialog.getByLabel('Ligar direto, sem confirmar').check()
    await page.waitForFunction(() => true)
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await openLink('tel:8000')
    const ura = page.locator('.call', { hasText: /→\s*8000/ })
    await ura.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 8000 })
    if (settings().links?.autoDial !== true) throw new Error('a opção de ligar direto não foi gravada')
    step('com "ligar direto", o link liga pela conta escolhida')

    // Atalhos: a tela captura a combinação, grava e o processo principal registra no sistema.
    await page.keyboard.press('ControlOrMeta+,')
    await dialog.getByRole('tab', { name: 'Atalhos e links' }).click()
    const mute = dialog.getByRole('button', { name: 'Atalho para Mudo' })
    await mute.click()
    await dialog.getByText('Aperte as teclas…').waitFor()
    await page.keyboard.press('a')
    await dialog.getByText('Aperte as teclas…').waitFor()
    await page.keyboard.press(ACCELERATOR)
    await dialog.getByRole('button', { name: 'Limpar o atalho de Mudo' }).waitFor()
    if (!/Ctrl \+ (Alt|Option) \+ Shift \+ F11/.test(await mute.innerText()))
        throw new Error(`atalho mostrado errado: ${await mute.innerText()}`)
    if (settings().shortcuts?.mute !== ACCELERATOR) throw new Error('o atalho não foi gravado')
    const registered = await app.evaluate(({ globalShortcut }, a) => globalShortcut.isRegistered(a), ACCELERATOR)
    if (!registered) throw new Error('o atalho não foi registrado no sistema')
    step('atalho capturado, gravado e registrado no sistema; tecla sozinha não vale')

    // O mesmo atalho em outra ação é recusado pela tela.
    await dialog.getByRole('button', { name: 'Atalho para Atender' }).click()
    await page.keyboard.press(ACCELERATOR)
    await dialog.getByText('Este atalho já é o de Mudo.').waitFor()
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    step('atalho repetido é recusado')

    await fire('mute')
    await ura.getByRole('button', { name: 'Ativar mic' }).waitFor()
    await fire('mute')
    await ura.getByRole('button', { name: 'Mudo' }).waitFor()
    await fire('hangup')
    await ura.locator('.pill', { hasText: 'encerrada' }).waitFor()
    step('mudo e desligar pelo atalho valem para a chamada em andamento')

    // Atender e recusar: Suporte 1001 não tem auto-atender, então a chamada fica tocando.
    const ring = async () => {
        await page.locator('.acc', { hasText: 'Vendas 1002' }).locator('.row').click()
        await number.fill('1001')
        await page.getByRole('button', { name: 'Ligar', exact: true }).click()
        await page.getByRole('region', { name: /Chamada recebida de/ }).waitFor({ timeout: 8000 })
    }
    await ring()
    await fire('answer')
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 5000 })
    await fire('hangup')
    await page.locator('.pill', { hasText: 'encerrada' }).nth(1).waitFor()
    await page.locator('.call').first().waitFor({ state: 'detached', timeout: 10000 })
    step('atender pelo atalho atende a chamada que toca')

    // Limpar tira o atalho do sistema.
    await page.keyboard.press('ControlOrMeta+,')
    await dialog.getByRole('tab', { name: 'Atalhos e links' }).click()
    await dialog.getByRole('button', { name: 'Limpar o atalho de Mudo' }).click()
    await dialog.getByRole('button', { name: 'Atalho para Mudo' }).filter({ hasText: 'Definir atalho' }).waitFor()
    const still = await app.evaluate(({ globalShortcut }, a) => globalShortcut.isRegistered(a), ACCELERATOR)
    if (still) throw new Error('o atalho limpo continua registrado no sistema')
    step('limpar o atalho tira o registro do sistema')

    // Botão do fone (RF-55): a tecla Tocar/Pausar só é da Íris enquanto há chamada.
    const mediaKey = () => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('MediaPlayPause'))
    await dialog.getByLabel('Botão do fone').check()
    await page.waitForFunction(() => true)
    if (settings().mediaKey !== true) throw new Error('a opção do botão do fone não foi gravada')
    if (await mediaKey()) throw new Error('a tecla de mídia foi tomada sem chamada nenhuma')
    await dialog.getByRole('tab', { name: 'Áudio' }).click()
    await dialog.getByLabel('Volume do toque').fill('80')
    await dialog.getByText('Volume do toque: 80%').waitFor()
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    if (settings().ringVolume !== 80) throw new Error('o volume do toque não foi gravado')
    await ring()
    // Em máquinas sem permissão para teclas de mídia (macOS sem Acessibilidade) o sistema recusa; o
    // teste só exige que, quando aceita, a tecla seja devolvida no fim da chamada.
    const taken = await mediaKey()
    await fire('hangup')
    await page.waitForFunction(() => document.querySelectorAll('.call').length === 0, null, { timeout: 15000 })
    if (await mediaKey()) throw new Error('a tecla de mídia continuou com a Íris depois da chamada')
    step(
        `botão do fone: tecla de mídia ${taken ? 'tomada na chamada e devolvida' : 'recusada pelo sistema nesta máquina'}; volume do toque gravado`
    )

    // Toque por conta: a escolha vai para accounts.json; o clássico não grava campo nenhum.
    const support = page.locator('.acc', { hasText: 'Suporte 1001' })
    await support.locator('.row').click()
    await support.getByRole('button', { name: 'Editar', exact: true }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Toque das chamadas recebidas').selectOption('sino')
    await form.getByRole('button', { name: 'Ouvir' }).click()
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    const saved = JSON.parse(readFileSync(join(userData, 'accounts.json'), 'utf8')).accounts
    if (saved.find((a) => a.name === 'Suporte 1001')?.ringtone !== 'sino') throw new Error('o toque não foi gravado')
    if (saved.some((a) => a.name !== 'Suporte 1001' && a.ringtone)) throw new Error('toque gravado em conta errada')
    step('toque por conta escolhido, ouvido e gravado')

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('Atalhos e links OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
