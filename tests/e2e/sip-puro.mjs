// Motor próprio, primeira entrega (RF-39): contas por SIP puro registram no Asterisk por UDP, TCP e
// TLS, medem a Saúde por OPTIONS, mostram o SIP bruto e desregistram.
// Uso: docker compose up -d && npm run build && node tests/e2e/sip-puro.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const HOST = process.env.PBX_DOMAIN ?? '127.0.0.1'
const CONTAINER = process.env.PBX_CONTAINER ?? 'iris-asterisk-1'
const userData = mkdtempSync(join(tmpdir(), 'iris-sip-puro-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const contacts = () => execSync(`docker exec ${CONTAINER} asterisk -rx "pjsip show contacts"`).toString()

const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const account = (name) => page.locator('.acc', { hasText: name })

async function addAccount(name, ext, transport, password = '1234') {
    await page.getByRole('button', { name: '+ Nova' }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('textbox', { name: 'Nome' }).fill(name)
    await form.getByRole('textbox', { name: 'Ramal' }).fill(ext)
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill(HOST)
    await form.getByLabel('Senha').fill(password)
    await form.getByLabel('Transporte').selectOption({ label: `SIP por ${transport}` })
    if (await form.getByRole('textbox', { name: 'WebSocket (WSS)' }).count())
        throw new Error('o campo do WebSocket continua na tela de uma conta de SIP puro')
    await form.getByRole('button', { name: 'Salvar e registrar' }).click()
}

async function expectContact(ext, present) {
    for (let i = 0; i < 20; i++) {
        if (contacts().includes(`${ext}/sip:${ext}@`) === present) return
        await page.waitForTimeout(250)
    }
    throw new Error(`o Asterisk ${present ? 'não tem' : 'ainda tem'} o contato do ramal ${ext}`)
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()

    await addAccount('Puro UDP', '2001', 'UDP')
    await account('Puro UDP').locator('.dot.registered').waitFor({ timeout: 15000 })
    await expectContact('2001', true)
    step('2001 registrou por UDP e o Asterisk tem o contato')

    await addAccount('Puro TCP', '2002', 'TCP')
    await account('Puro TCP').locator('.dot.registered').waitFor({ timeout: 15000 })
    await expectContact('2002', true)
    step('2002 registrou por TCP')

    // O PBX de teste usa certificado autoassinado: o app recusa e oferece confiar no host (RF-37).
    await addAccount('Puro TLS', '2003', 'TLS')
    await page.getByRole('button', { name: 'Confiar neste host' }).click({ timeout: 15000 })
    await account('Puro TLS').locator('.dot.registered').waitFor({ timeout: 15000 })
    await expectContact('2003', true)
    step('2003: certificado autoassinado recusado, aceito pelo usuário e registro por TLS')

    await addAccount('Puro senha errada', '2004', 'UDP', 'errada')
    await account('Puro senha errada').getByText('O PBX não aceitou a senha').waitFor({ timeout: 15000 })
    if (await account('Puro senha errada').getByText('tentando de novo').count())
        throw new Error('senha errada não deveria ser tentada de novo')
    step('senha errada vira erro em português, sem nova tentativa')

    await account('Puro UDP').locator('.row').click()
    await account('Puro UDP')
        .getByRole('button', { name: /Mais ações|⋯/ })
        .click()
    await page.getByRole('menuitem', { name: 'Saúde' }).click()
    const health = page.getByRole('dialog')
    await health.getByText('Transporte UDP conectado').waitFor({ timeout: 10000 })
    await health.getByText(/OPTIONS respondeu em \d+ ms/).waitFor({ timeout: 10000 })
    await health.getByRole('button', { name: 'Fechar' }).first().click()
    step('Saúde: transporte conectado e OPTIONS respondido')

    await page.getByRole('tab', { name: 'SIP bruto' }).click()
    const log = page.locator('.line.sip')
    await log
        .filter({ hasText: `REGISTER sip:${HOST} SIP/2.0` })
        .first()
        .waitFor({ timeout: 10000 })
    await log.filter({ hasText: 'SIP/2.0 200 OK' }).first().waitFor({ timeout: 10000 })
    const text = (await log.allInnerTexts()).join('\n')
    if (/response="[0-9a-f]{16,}"/.test(text)) throw new Error('a resposta do desafio apareceu no log (RNF-10)')
    step('SIP bruto mostra REGISTER e 200 OK, sem a resposta do desafio')

    await account('Puro UDP').getByRole('button', { name: 'Desregistrar' }).click()
    await expectContact('2001', false)
    step('Desregistrar tira o contato do Asterisk')

    const errors = readFileSync(join(userData, 'logs', 'iris.log'), 'utf8')
        .split('\n')
        .filter((line) => / ERROR /.test(line))
    if (errors.length) throw new Error(`erros no log interno:\n${errors.join('\n')}`)
    step('nenhum erro no log interno')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'sip-puro-falha.png') })
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('SIP puro OK')
