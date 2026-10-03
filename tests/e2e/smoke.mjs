// Teste de fumaça de ponta a ponta no modo simulado: abre o app, liga de 1001 para 1002,
// espera o auto-atender, envia DTMF e desliga. Uso: npm run build && node tests/e2e/smoke.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
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
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
const page = await app.firstWindow()
await page.setViewportSize?.({ width: 1360, height: 820 }).catch(() => {})
const step = (msg) => console.log(`✓ ${msg}`)

try {
    await page.getByText('3 contas · 2 PBX').waitFor()
    step('contas de exemplo carregadas')
    await page.locator('.status', { hasText: '403 Forbidden' }).waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()
    step('1001 e 1002 registradas, Lab 2001 com 403')
    if (shots) await page.screenshot({ path: join(shots, '1-inicio.png') })

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
    await page.getByRole('button', { name: 'Áudio' }).click()
    const audio = page.getByRole('dialog', { name: 'Áudio' })
    await audio.getByRole('meter', { name: 'Nível do microfone' }).waitFor()
    const mics = await audio.locator('select').first().locator('option').count()
    if (mics < 2) throw new Error('Nenhum microfone listado no diálogo de áudio')
    await audio.locator('select').first().selectOption({ index: 1 })
    await page.locator('.line', { hasText: 'Microfone: ' }).waitFor()
    if (shots) await page.screenshot({ path: join(shots, '5-audio.png') })
    await audio.getByRole('button', { name: 'Pronto' }).click()
    step('diálogo de áudio lista e troca o microfone')

    await page.getByRole('tab', { name: 'SIP bruto' }).click()
    await page.locator('.line.sip', { hasText: 'INVITE sip:1002@demo.local' }).first().waitFor()
    step('log SIP bruto mostra o INVITE')
    if (shots) await page.screenshot({ path: join(shots, '6-log-sip.png') })
    console.log('Fumaça OK')
} catch (error) {
    if (shots) await page.screenshot({ path: join(shots, 'erro.png') })
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
