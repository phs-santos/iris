// Monitor (RF-43): um cenário marcado para rodar sozinho falha, o app avisa pelo log e manda o webhook;
// enquanto continua falhando, não avisa de novo.
// Uso: npm run build && node tests/e2e/monitor.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/monitor.mjs)
import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-monitor-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const launch = () => electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const step = (msg) => console.log(`✓ ${msg}`)
// Prazo do teste inteiro: um travamento vira falha com mensagem, e não um CI parado por horas.
const deadline = setTimeout(() => {
    console.error('✗ o teste do monitor passou de 3 minutos')
    process.exit(1)
}, 180_000)
deadline.unref()

// Servidor local que faz o papel do webhook.
const received = []
const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
        received.push({ method: request.method, type: request.headers['content-type'], body: JSON.parse(body) })
        response.writeHead(204).end()
    })
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const webhook = `http://127.0.0.1:${server.address().port}/alerta`

let failed = false
let app
try {
    // Primeira abertura só para criar as contas de exemplo e saber os ids.
    app = await launch()
    let page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    await app.close()
    const accounts = JSON.parse(readFileSync(join(userData, 'accounts.json'), 'utf8')).accounts
    const lab = accounts.find((a) => a.name === 'Lab 2001')
    const ok = accounts.find((a) => a.name === 'Suporte 1001')
    // "Lab 2001" tem a senha errada: o registro falha, e com ele o cenário. 0,05 min = 3 s entre execuções.
    writeFileSync(
        join(userData, 'scenarios.json'),
        JSON.stringify({
            schemaVersion: 1,
            scenarios: [
                {
                    id: 'vigia',
                    name: 'Vigia do Lab',
                    accountId: lab.id,
                    steps: [{ type: 'register' }],
                    monitor: { enabled: true, everyMinutes: 0.05, webhook }
                },
                { id: 'outro', name: 'Sem monitor', accountId: ok.id, steps: [{ type: 'register' }] }
            ]
        })
    )

    app = await launch()
    page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    await page.getByRole('tab', { name: 'Cenários' }).click()
    await page
        .locator('.list')
        .getByText('Monitor: o cenário "Vigia do Lab" falhou no passo 1')
        .waitFor({ timeout: 40000 })
    step('o monitor rodou sozinho e o log avisa da falha, com o passo')
    for (let i = 0; i < 50 && received.length === 0; i++) await page.waitForTimeout(100)
    const [first] = received
    if (!first || first.method !== 'POST' || !/application\/json/.test(first.type))
        throw new Error(`webhook não chegou como POST de JSON: ${JSON.stringify(received)}`)
    const body = first.body
    if (body.app !== 'Iris' || body.event !== 'failed' || body.scenario !== 'Vigia do Lab' || body.failedStep !== 1)
        throw new Error(`corpo do webhook inesperado: ${JSON.stringify(body)}`)
    await page.locator('.list').getByText('Monitor: webhook respondeu 204').waitFor({ timeout: 10000 })
    step(`webhook recebeu o aviso: ${body.event}, passo ${body.failedStep}, "${body.message}"`)

    // Mais duas execuções: continua falhando, e não há aviso novo.
    await page.waitForTimeout(9000)
    if (received.length !== 1) throw new Error(`o webhook foi chamado ${received.length} vezes para a mesma falha`)
    step('enquanto continua falhando, não avisa de novo')

    await page
        .getByRole('status')
        .filter({ hasText: /falhou às \d\d:\d\d · próxima às \d\d:\d\d/ })
        .waitFor({ timeout: 10000 })
    step('a tela mostra a hora da última execução e da próxima')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
} finally {
    await app?.close().catch(() => {})
    // Sem fechar as conexões abertas, o servidor do webhook segura o Node depois do fim.
    server.closeAllConnections()
    server.close()
    rmSync(userData, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('Monitor OK')
