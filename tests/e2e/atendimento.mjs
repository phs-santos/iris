// Áudio de atendimento (RF-57) e botão de vídeo em conta sem vídeo, no modo simulado.
// Uso: npm run build && node tests/e2e/atendimento.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
// 1,5 s de tom de 440 Hz em WAV de 16 bits a 8000 Hz.
const wav = join(userData, 'boas-vindas.wav')
const samples = 12000
const data = Buffer.alloc(44 + samples * 2)
data.write('RIFF', 0)
data.writeUInt32LE(36 + samples * 2, 4)
data.write('WAVEfmt ', 8)
data.writeUInt32LE(16, 16)
data.writeUInt16LE(1, 20)
data.writeUInt16LE(1, 22)
data.writeUInt32LE(8000, 24)
data.writeUInt32LE(16000, 28)
data.writeUInt16LE(2, 32)
data.writeUInt16LE(16, 34)
data.write('data', 36)
data.writeUInt32LE(samples * 2, 40)
for (let i = 0; i < samples; i++)
    data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 8000)), 44 + i * 2)
writeFileSync(wav, data)

const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const account = (name) => page.locator('.acc', { hasText: name })
const logLine = (text) => page.locator('.list').getByText(text).first()

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.getByRole('button', { name: 'Fechar os primeiros passos' }).click()
    // O diálogo de abrir arquivo é do sistema; aqui ele devolve o WAV criado acima.
    await app.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, wav)

    // Vendas 1002 (auto-atender) toca o WAV para quem ligou.
    await account('Vendas 1002').locator('.row').click()
    await account('Vendas 1002').getByRole('button', { name: 'Editar', exact: true }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('button', { name: /Avançado/ }).click()
    await form.getByRole('button', { name: 'Escolher WAV…' }).click()
    await form
        .getByRole('textbox', { name: 'Ao atender, tocar para quem ligou' })
        .and(form.locator('[value="boas-vindas.wav"]'))
        .waitFor()
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    const saved = JSON.parse(readFileSync(join(userData, 'accounts.json'), 'utf8')).accounts
    if (saved.find((a) => a.name === 'Vendas 1002')?.answerAudio !== wav)
        throw new Error('o áudio não foi gravado na conta')
    step('WAV escolhido e gravado na conta')

    await account('Suporte 1001').locator('.row').click()
    await page.getByLabel('Número', { exact: true }).fill('1002')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    await page.getByRole('tab', { name: 'Eventos' }).click()
    await logLine('Áudio de atendimento: tocando boas-vindas.wav para quem ligou').waitFor({ timeout: 10000 })
    await logLine('Tocando áudio de 1500 ms na chamada').waitFor()
    // Quem ligou "ouve" o arquivo: o medidor do cartão dele sobe.
    await page.waitForFunction(
        () =>
            [...document.querySelectorAll('.call')].some(
                (card) =>
                    /→/.test(card.textContent) &&
                    Number(card.querySelector('[role=meter]')?.getAttribute('aria-valuenow')) > -30
            ),
        null,
        { timeout: 5000 }
    )
    step('auto-atender toca o WAV e quem ligou ouve')
    await page.locator('.call', { hasText: '→' }).getByRole('button', { name: 'Desligar', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.call').length === 0, null, { timeout: 15000 })

    // Conta simulada faz vídeo; uma de SIP puro mostra o botão apagado, com o motivo.
    await page.getByRole('button', { name: '+ Nova' }).click()
    await form.getByRole('textbox', { name: 'Nome' }).fill('Puro 2001')
    await form.getByRole('textbox', { name: 'Ramal' }).fill('2001')
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill('127.0.0.1')
    await form.getByLabel('Senha').fill('1234')
    await form.getByLabel('Transporte').selectOption({ label: 'SIP por UDP' })
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    await account('Puro 2001').locator('.row').click()
    const video = page.getByRole('button', { name: 'Ligar com vídeo' })
    await video.waitFor()
    if (!(await video.isDisabled())) throw new Error('o botão de vídeo deveria estar apagado em SIP puro')
    if (!/só em contas WebRTC/.test(await video.getAttribute('title'))) throw new Error('o botão não explica o motivo')
    step('em SIP puro o botão de vídeo aparece apagado, com o motivo')

    console.log('Áudio de atendimento OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
