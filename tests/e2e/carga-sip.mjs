// Teste de carga por SIP puro (RF-42): várias chamadas ao mesmo tempo para o eco do Asterisk, pela
// tela, e o relatório no fim. CALLS escolhe quantas (padrão 50; no Docker Desktop do macOS o PBX de
// teste só tem portas de áudio mapeadas para cerca de 50).
// Uso: docker compose up -d && npm run build && node tests/e2e/carga-sip.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const HOST = process.env.PBX_DOMAIN ?? '127.0.0.1'
const CONTAINER = process.env.PBX_CONTAINER ?? 'iris-asterisk-1'
const CALLS = Number(process.env.CALLS ?? 50)
const userData = mkdtempSync(join(tmpdir(), 'iris-carga-sip-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')

const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const account = page.locator('.acc', { hasText: 'Carga 2001' })

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    await page.getByRole('button', { name: '+ Nova' }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('textbox', { name: 'Nome' }).fill('Carga 2001')
    await form.getByRole('textbox', { name: 'Ramal' }).fill('2001')
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill(HOST)
    await form.getByLabel('Senha').fill('1234')
    await form.getByLabel('Transporte').selectOption({ label: 'SIP por UDP' })
    await form.getByRole('button', { name: 'Salvar e registrar' }).click()
    await account.locator('.dot.registered').waitFor({ timeout: 15000 })

    await account.getByRole('button', { name: /Mais ações|⋯/ }).click()
    await page.getByRole('menuitem', { name: 'Teste de carga…' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Destino').fill('600')
    await dialog.getByLabel('Chamadas ao mesmo tempo').fill(String(CALLS))
    await dialog.getByLabel('Duração de cada uma (s)').fill('8')
    await dialog.getByLabel('Intervalo entre elas (ms)').fill('50')
    await dialog.getByRole('button', { name: 'Começar' }).click()

    // No auge, o Asterisk tem mesmo todas as chamadas abertas.
    await dialog.getByText(new RegExp(`atendidas ${CALLS} · encerradas 0`)).waitFor({ timeout: 30000 })
    const channels = execSync(`docker exec ${CONTAINER} asterisk -rx "core show channels count"`).toString()
    const active = Number(/(\d+) active channel/.exec(channels)?.[1] ?? 0)
    if (active < CALLS) throw new Error(`o Asterisk tem ${active} canais, esperava ${CALLS}`)
    step(`${CALLS} chamadas simultâneas abertas (${active} canais no Asterisk)`)

    await dialog.getByText(`${CALLS} de ${CALLS} chamadas atendidas · ${CALLS} com áudio`).waitFor({ timeout: 60000 })
    const report = await dialog.locator('pre').textContent()
    step(`relatório: ${report.split('\n').slice(1, 6).join(' | ')}`)
    if (!/falharam: 0/.test(report)) throw new Error('o relatório tem falhas')
    if (await page.locator('.call').count()) throw new Error('as chamadas do teste de carga apareceram nos cartões')
    await dialog.getByRole('button', { name: 'Fechar' }).last().click()

    for (let i = 0; i < 20; i++) {
        if (
            /^0 active channel/m.test(
                execSync(`docker exec ${CONTAINER} asterisk -rx "core show channels count"`).toString()
            )
        )
            break
        await page.waitForTimeout(250)
    }
    step('todas as chamadas foram encerradas no PBX')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
    if (failed) {
        try {
            execSync(`docker exec ${CONTAINER} asterisk -rx "channel request hangup all"`, { stdio: 'pipe' })
        } catch {
            // sem Docker: nada a limpar
        }
    }
}
if (failed) process.exit(1)
console.log('Carga por SIP puro OK')
