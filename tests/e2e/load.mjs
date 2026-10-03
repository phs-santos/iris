// Teste de carga (RNF-03): 20 contas registradas no Asterisk e 4 chamadas simultâneas,
// medindo se a interface continua respondendo (RNF-04: até 100 ms).
// Uso: docker compose up -d (ramais 1001-1020) && npm run build && node tests/e2e/load.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WSS = process.env.PBX_WS ?? 'wss://127.0.0.1:8089/ws'
const DOMAIN = process.env.PBX_DOMAIN ?? '127.0.0.1'
const ACCOUNTS = 20
const CALLS = 4
const HOLD_MS = 15000
const LIMIT_MS = 100

const userData = mkdtempSync(join(tmpdir(), 'iris-load-'))
const shots = process.env.SHOTS_DIR
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')

// Arquivo de importação com 20 contas; as pares atendem sozinhas.
const exts = Array.from({ length: ACCOUNTS }, (_, i) => String(1001 + i))
const importFile = join(userData, 'carga.json')
writeFileSync(
    importFile,
    JSON.stringify({
        format: 'iris/accounts',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        accounts: exts.map((ext, i) => ({
            id: `carga-${ext}`,
            name: `Carga ${ext}`,
            domain: DOMAIN,
            extension: ext,
            wssUrl: WSS,
            rawSipLog: false,
            autoAnswer: { enabled: i % 2 === 1, delayMs: 300 },
            password: '1234'
        }))
    })
)

const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

/** Roda na página: clica no primeiro botão que casa com o texto e mede até a tela mudar (próximo quadro). */
async function toggle({ selector, text }) {
    const re = new RegExp(text)
    const button = [...document.querySelectorAll(selector)].find((b) => re.test(b.textContent.trim()))
    if (!button) throw new Error(`Botão não encontrado: ${text}`)
    const snapshot = () => button.textContent + button.className + button.getAttribute('aria-selected')
    const before = snapshot()
    const start = performance.now()
    button.click()
    const deadline = start + 5000
    while (snapshot() === before && performance.now() < deadline) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
    return Math.round(performance.now() - start)
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()

    // Importa as 20 contas sem o diálogo nativo de arquivo.
    await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, importFile)
    await page.getByRole('button', { name: 'Importar / Exportar' }).click()
    await page.getByRole('button', { name: 'Escolher arquivo' }).click()
    await page.getByText(`${ACCOUNTS} contas importadas`).waitFor()
    await page.getByRole('button', { name: 'Fechar' }).click()
    step(`${ACCOUNTS} contas importadas`)

    // Mede o atraso do laço de eventos da interface durante todo o teste.
    await page.evaluate(() => {
        const lags = []
        let last = performance.now()
        window.__lag = lags
        window.__lagTimer = setInterval(() => {
            const now = performance.now()
            lags.push(Math.max(0, now - last - 50))
            last = now
        }, 50)
    })

    const registerStart = Date.now()
    await page.getByRole('button', { name: 'Registrar todas', exact: true }).click()
    // O certificado autoassinado do PBX de teste precisa ser aceito uma vez (RF-37).
    const trust = page.getByRole('button', { name: 'Confiar neste host' })
    if (await trust.isVisible({ timeout: 10000 }).catch(() => false)) await trust.click()
    const total = ACCOUNTS + 2 // + as duas contas simuladas que registram ao abrir
    await page.getByText(`${total} registradas`).waitFor({ timeout: 60000 })
    step(`${ACCOUNTS} contas registradas no Asterisk em ${((Date.now() - registerStart) / 1000).toFixed(1)} s`)
    if (shots) await page.screenshot({ path: join(shots, 'carga-1-registradas.png') })

    for (let i = 0; i < CALLS; i++) {
        const from = exts[i * 2]
        const to = exts[i * 2 + 1]
        await page.locator('.acc', { hasText: `Carga ${from}` }).click()
        await page.getByLabel('Número').fill(to)
        await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    }
    const legs = CALLS * 2 // as duas pontas de cada chamada estão no app
    await page.getByText(`${legs} chamadas`).waitFor({ timeout: 30000 })
    await page
        .locator('.call:not(.ended) .pill', { hasText: 'em chamada' })
        .nth(legs - 1)
        .waitFor({ timeout: 30000 })
    step(`${CALLS} chamadas simultâneas em andamento (${legs} pontas no app)`)

    // Com tudo ativo: ações da interface precisam responder em até 100 ms. Medido dentro da página,
    // do clique até a tela mudar, para não somar as esperas do próprio Playwright.
    const clicks = []
    for (let i = 0; i < 10; i++)
        clicks.push(
            await page.evaluate(toggle, {
                selector: '.call:not(.ended) .controls button',
                text: /^(Mudo|Ativar mic)$/.source
            })
        )
    for (const tab of ['SIP bruto', 'Eventos', 'Tudo', 'Eventos'])
        clicks.push(await page.evaluate(toggle, { selector: '[role=tab]', text: `^${tab}$` }))
    await page.waitForTimeout(HOLD_MS)
    if (shots) await page.screenshot({ path: join(shots, 'carga-2-chamadas.png') })

    const lags = await page.evaluate(() => {
        clearInterval(window.__lagTimer)
        return window.__lag
    })
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics())
    const memoryMb = metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0) / 1024
    const cpu = metrics.reduce((sum, m) => sum + (m.cpu?.percentCPUUsage ?? 0), 0)

    const lagP95 = percentile(lags, 95)
    const lagMax = Math.max(...lags)
    const clickP95 = percentile(clicks, 95)
    console.log(`  laço de eventos: p95 ${lagP95.toFixed(0)} ms, máx ${lagMax.toFixed(0)} ms (${lags.length} amostras)`)
    console.log(
        `  cliques: p95 ${clickP95} ms, máx ${Math.max(...clicks)} ms (${clicks.length} ações: ${clicks.join(', ')})`
    )
    console.log(`  memória do app: ${memoryMb.toFixed(0)} MB · CPU agora: ${cpu.toFixed(1)}%`)
    if (lagP95 > LIMIT_MS || clickP95 > LIMIT_MS) {
        failed = true
        console.error(`✗ a interface passou de ${LIMIT_MS} ms`)
    } else step(`interface respondendo em até ${LIMIT_MS} ms com ${ACCOUNTS} contas e ${CALLS} chamadas`)

    for (let i = 0; i < CALLS; i++) {
        await page
            .locator('.call:not(.ended)', { hasText: '→' })
            .first()
            .getByRole('button', { name: 'Desligar' })
            .click()
    }
    await page.getByText('0 chamadas').waitFor({ timeout: 20000 })
    step('chamadas encerradas')
    await page.getByRole('button', { name: 'Desregistrar todas' }).click()
    await page.getByText('0 registradas').waitFor({ timeout: 20000 })
    step('contas desregistradas')
    console.log(failed ? 'Carga FALHOU' : 'Carga OK')
} catch (error) {
    failed = true
    if (shots) await page.screenshot({ path: join(shots, 'carga-erro.png') })
    console.error(error)
} finally {
    process.exitCode = failed ? 1 : 0
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
