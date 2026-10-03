// Teste de integração contra um Asterisk real (docker compose up -d).
// Cadastra 1001 e 1002 pela tela, liga de uma para a outra com áudio WebRTC,
// envia DTMF para a URA 8000, confere o 486 do número ocupado e faz uma transferência assistida.
// Uso: npm run build && node tests/e2e/asterisk.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const WSS = process.env.PBX_WS ?? 'wss://127.0.0.1:8089/ws'
const DOMAIN = process.env.PBX_DOMAIN ?? '127.0.0.1'
const userData = mkdtempSync(join(tmpdir(), 'iris-pbx-'))
const shots = process.env.SHOTS_DIR
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')

const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)

async function addAccount(name, ext, autoAnswer, expectCertPrompt = false) {
    await page.getByRole('button', { name: '+ Nova' }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('textbox', { name: 'Nome' }).fill(name)
    await form.getByRole('textbox', { name: 'Ramal' }).fill(ext)
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill(DOMAIN)
    await form.getByLabel('Senha').fill('1234')
    await form.getByRole('textbox', { name: 'WebSocket (WSS)' }).fill(WSS)
    if (autoAnswer) await form.getByText('Auto-atender após').locator('input[type=checkbox]').check()
    await form.getByRole('button', { name: 'Salvar e registrar' }).click()
    if (expectCertPrompt) {
        // O PBX de teste usa certificado autoassinado: o app recusa e oferece confiar no host (RF-37).
        await page.getByRole('button', { name: 'Confiar neste host' }).click({ timeout: 10000 })
        step('certificado autoassinado recusado e aceito pelo usuário')
    }
    await page.locator('.acc', { hasText: name }).locator('.dot.registered').waitFor({ timeout: 10000 })
    step(`${name} registrada no Asterisk`)
}

try {
    await page.getByText('3 contas').waitFor()
    await addAccount('PBX 1001', '1001', false, true)
    await addAccount('PBX 1002', '1002', true)
    await addAccount('PBX 1003', '1003', true)
    if (shots) await page.screenshot({ path: join(shots, 'pbx-1-registradas.png') })

    await page.locator('.acc', { hasText: 'PBX 1001' }).locator('.row').click()
    await page.getByLabel('Número').fill('1002')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    await page.locator('.call', { hasText: /1002\s*←\s*1001/ }).waitFor({ timeout: 20000 })
    step('1002 recebeu a chamada de 1001 pelo Asterisk')
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 25000 })
    step('auto-atender conectou; as duas pontas em chamada')
    await page.waitForTimeout(2500)
    if (shots) await page.screenshot({ path: join(shots, 'pbx-2-em-chamada.png') })
    const quality = await page
        .locator('.quality')
        .first()
        .textContent({ timeout: 5000 })
        .catch(() => null)
    step(`qualidade: ${quality?.trim() ?? 'sem amostra'}`)

    const outgoing = page.locator('.call', { hasText: /1001\s*→\s*1002/ })
    await outgoing.getByRole('button', { name: 'Desligar' }).click()
    await page.locator('.pill', { hasText: 'encerrada' }).nth(1).waitFor({ timeout: 10000 })
    step('desligou dos dois lados')

    await page.getByLabel('Número').fill('486')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    await page.locator('.call', { hasText: '486 Busy Here' }).waitFor({ timeout: 20000 })
    step('486 aparece no cartão da chamada')

    await page.getByLabel('Número').fill('8000')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    const ivr = page.locator('.call', { hasText: /1001\s*→\s*8000/ })
    await ivr.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await ivr.getByRole('button', { name: 'DTMF' }).click()
    await ivr.getByLabel('Sequência DTMF').fill('w1 4321')
    await ivr.getByRole('button', { name: 'Enviar' }).click()
    await page.locator('.list').getByText('DTMF enviado: 1').waitFor({ timeout: 10000 })
    step('DTMF 4321 enviado para a URA')
    // Com docker disponível, confere no log do Asterisk que a URA recebeu os dígitos.
    // Se faltar algum dígito, a URA só escreve no log depois dos 15 s de espera do Read.
    try {
        let out = ''
        for (let i = 0; i < 20 && !/URA recebeu/.test(out); i++) {
            await page.waitForTimeout(1000)
            out = execSync('docker compose logs --since 60s asterisk', { encoding: 'utf8' })
        }
        if (!/URA recebeu 4321/.test(out)) {
            const got = /URA recebeu (\S*)/.exec(out)?.[1]
            console.error(out.split('\n').slice(-40).join('\n'))
            throw new Error(`A URA do Asterisk não recebeu 4321 (recebeu "${got ?? 'nada'}")`)
        }
        step('Asterisk confirmou: URA recebeu 4321')
    } catch (error) {
        if (/não recebeu/.test(error.message)) throw error
        console.log('  (docker indisponível; conferência no Asterisk pulada)')
    }
    // A URA desliga sozinha depois de ler 4 dígitos.
    // Pelo log: o cartão encerrado some depois de alguns segundos e pode sumir antes desta conferência.
    await page
        .locator('.list')
        .getByText('Chamada para 8000: Encerrada pelo outro lado')
        .first()
        .waitFor({ timeout: 10000 })
    step('URA encerrou a chamada')

    // Transferência assistida (RF-16): 1001 liga para 1002, que consulta 1003 e transfere.
    const live = (text) => page.locator('.call:not(.ended)', { hasText: text })
    await page.getByLabel('Número').fill('1002')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    const atB = live(/1002\s*←\s*1001/)
    await atB.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 25000 })
    await atB.getByRole('button', { name: 'Transferir' }).click()
    await atB.getByLabel('Destino').fill('1003')
    await atB.getByRole('button', { name: 'Consultar antes' }).click()
    const consult = live('Consulta para transferir')
    await consult.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 25000 })
    step('1002 pôs 1001 em espera e 1003 atendeu a consulta')
    if (shots) await page.screenshot({ path: join(shots, 'pbx-3-consulta.png') })
    await consult.getByRole('button', { name: 'Concluir transferência' }).click()
    await page.locator('.list').getByText('Transferência: 200 OK').first().waitFor({ timeout: 15000 })
    await page.getByText('2 chamadas').waitFor({ timeout: 15000 })
    await live(/1001\s*→\s*1002/)
        .locator('.pill', { hasText: 'em chamada' })
        .waitFor()
    await live(/1003\s*←\s*1002/)
        .locator('.pill', { hasText: 'em chamada' })
        .waitFor()
    step('transferência assistida concluída; as pernas de 1002 caíram')
    try {
        const channels = execSync('docker compose exec -T asterisk asterisk -rx "core show channels concise"', {
            encoding: 'utf8'
        })
        if (!/PJSIP\/1001-/.test(channels) || !/PJSIP\/1003-/.test(channels) || /PJSIP\/1002-/.test(channels))
            throw new Error(`Canais inesperados no Asterisk depois da transferência:\n${channels}`)
        step('Asterisk confirmou: 1001 e 1003 em ponte, 1002 fora')
    } catch (error) {
        if (/Canais inesperados/.test(error.message)) throw error
        console.log('  (docker indisponível; conferência no Asterisk pulada)')
    }
    await live(/1001\s*→\s*1002/)
        .getByRole('button', { name: 'Desligar' })
        .click()
    await page.getByText('0 chamadas').waitFor({ timeout: 15000 })
    step('desligar 1001 encerrou também 1003')

    await page.getByRole('tab', { name: 'SIP bruto' }).click()
    await page.locator('.line.sip', { hasText: 'SIP/2.0 200 OK' }).first().waitFor()
    // RNF-10: nem a tela nem os arquivos exportados podem ter Authorization, hash, nonce ou senha.
    const secret = /Authorization:\s*Digest|\b(response|nonce|cnonce|password|secret)="?(?!\[REDACTED\])[\w/+=.-]{6,}/i
    const shown = (await page.locator('.line').allTextContents()).filter((l) => secret.test(l))
    if (shown.length) throw new Error(`O log mostrou dado de autenticação:\n${shown.slice(0, 3).join('\n')}`)
    const logFile = join(userData, 'log-exportado')
    await app.evaluate(({ dialog }, file) => {
        let n = 0
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${file}-${++n}` })
    }, logFile)
    await page.getByRole('tab', { name: 'Tudo' }).click()
    await page.getByRole('button', { name: 'Salvar .txt' }).click()
    await page.getByRole('button', { name: 'Salvar .json' }).click()
    await page.getByText(/Salvo em .*log-exportado-2/).waitFor()
    for (const n of [1, 2]) {
        const text = readFileSync(`${logFile}-${n}`, 'utf8')
        if (!text.includes('REGISTER')) throw new Error(`Log exportado ${n} sem o SIP`)
        const bad = text.split('\n').filter((l) => secret.test(l))
        if (bad.length) throw new Error(`Log exportado ${n} com dado de autenticação:\n${bad.slice(0, 3).join('\n')}`)
    }
    step('log SIP na tela e exportado (.txt e .json) sem Authorization, hash, nonce nem senha')
    if (shots) await page.screenshot({ path: join(shots, 'pbx-4-log.png') })
    console.log('Integração com Asterisk OK')
} catch (error) {
    if (shots) await page.screenshot({ path: join(shots, 'pbx-erro.png') })
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
