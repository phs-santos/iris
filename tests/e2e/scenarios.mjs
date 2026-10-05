// Cenários de ponta a ponta (RF-28 a RF-30). No modo simulado por padrão; com PBX_WS aponta para um PBX real.
// Cria o exemplo de URA, executa, força uma falha com 486, repete N vezes, exporta o relatório
// e confere que o cenário volta igual depois de recarregar a janela.
// Uso: npm run build && node tests/e2e/scenarios.mjs
//      PBX_WS=wss://127.0.0.1:8089/ws node tests/e2e/scenarios.mjs   (Asterisk de teste, ramal 1001)
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PBX_WS = process.env.PBX_WS
const DOMAIN = process.env.PBX_DOMAIN ?? '127.0.0.1'
const RUNS = Number(process.env.RUNS ?? 20)
const userData = mkdtempSync(join(tmpdir(), 'iris-cen-'))
const shots = process.env.SHOTS_DIR
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')

const app = await electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const reportFile = join(userData, 'relatorio.txt')

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
        dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [file.replace('relatorio.txt', 'conta.json')]
        })
    }, reportFile)

    let origin = 'Suporte 1001'
    if (PBX_WS) {
        // Conta real no Asterisk, importada sem o diálogo de arquivo.
        origin = 'PBX 1001'
        writeFileSync(
            join(userData, 'conta.json'),
            JSON.stringify({
                format: 'iris/accounts',
                schemaVersion: 1,
                exportedAt: '',
                accounts: [
                    {
                        id: 'pbx-1001',
                        name: origin,
                        domain: DOMAIN,
                        extension: '1001',
                        wssUrl: PBX_WS,
                        password: '1234'
                    }
                ]
            })
        )
        await page.getByRole('button', { name: 'Configurações' }).click()
        await page.getByRole('tab', { name: 'Importar e exportar' }).click()
        await page.getByRole('button', { name: 'Escolher arquivo' }).click()
        await page.getByText('1 contas importadas').waitFor()
        await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click()
        await page.locator('.acc', { hasText: origin }).locator('.row').click()
        await page.getByRole('button', { name: 'Registrar', exact: true }).click()
        const trust = page.getByRole('button', { name: 'Confiar neste host' })
        // isVisible não espera: o aviso do certificado pode aparecer um instante depois do clique.
        await trust
            .waitFor({ timeout: 8000 })
            .then(() => trust.click())
            .catch(() => undefined)
        await page.locator('.acc', { hasText: origin }).locator('.dot.registered').waitFor({ timeout: 15000 })
        step(`${origin} registrada no PBX real`)
    }

    await page.getByRole('tab', { name: 'Cenários' }).click()
    await page.getByRole('button', { name: '+ Exemplo de URA' }).click()
    const originSelect = page.getByLabel('Conta de origem')
    if (PBX_WS) await originSelect.selectOption('pbx-1001')
    await page.getByLabel('Nome do cenário').fill('URA de teste')
    step('exemplo de URA criado com 6 passos')

    // RF-29: executar e ver cada passo passar, com tempo.
    await page.getByRole('button', { name: 'Executar', exact: true }).click()
    await page.getByText(/^Passou em \d+ ms$/).waitFor({ timeout: 30000 })
    for (let i = 1; i <= 6; i++) {
        const mark = await page.getByTestId(`resultado-${i}`).textContent()
        if (!/^✓ \d+ ms$/.test(mark.trim())) throw new Error(`Passo ${i} não passou: "${mark}"`)
    }
    step('execução única: os 6 passos passaram, cada um com tempo')
    if (shots) await page.screenshot({ path: join(shots, 'cen-1-passou.png') })

    // RF-29: esperar "em chamada" e receber 486 aparece como falha no passo.
    const number = page.getByLabel('Número do passo 2')
    await number.fill('486')
    await page.getByRole('button', { name: 'Executar', exact: true }).click()
    await page.getByText(/^Falhou no passo 3/).waitFor({ timeout: 30000 })
    const mark3 = (await page.getByTestId('resultado-3').textContent()).trim()
    const msg3 = await page.locator('.step').nth(2).locator('.msg').textContent()
    if (!mark3.startsWith('✗') || !/486/.test(msg3)) throw new Error(`Passo 3 deveria falhar com 486: ${mark3} ${msg3}`)
    if (!(await page.getByTestId('resultado-4').textContent()).includes('–'))
        throw new Error('Passo 4 deveria ser pulado')
    step(`486 marca o passo 3 como falhou: "${msg3.trim()}"`)
    if (shots) await page.screenshot({ path: join(shots, 'cen-2-falhou.png') })
    await number.fill('8000')

    // RF-30: repetir N vezes e exportar o relatório.
    await page.getByLabel('Quantidade de execuções').fill(String(RUNS))
    await page.getByRole('button', { name: `Repetir ${RUNS}×` }).click()
    await page.getByText(`${RUNS}/${RUNS} ·`).waitFor({ timeout: RUNS * 15000 })
    const figures = await page.getByRole('region', { name: 'Relatório' }).locator('.figures span').allTextContents()
    step(`${RUNS} execuções: ${figures.map((f) => f.replace(/\s+/g, ' ').trim()).join(' · ')}`)
    if (shots) await page.screenshot({ path: join(shots, 'cen-3-relatorio.png') })
    await page.getByRole('button', { name: 'Relatório .txt' }).click()
    await page.getByText(/relatório salvo em/).waitFor()
    const text = readFileSync(reportFile, 'utf8')
    if (!text.includes(`Execuções: ${RUNS}`) || !/taxa de sucesso: [\d.]+%/.test(text))
        throw new Error(`Relatório incompleto:\n${text}`)
    if (/1234\b.*senha|password|Authorization|nonce/i.test(text)) throw new Error('Relatório com dado sensível')
    step(`relatório .txt exportado (${text.split('\n').length} linhas, sem senhas)`)

    // RF-28: o cenário volta igual depois de recarregar.
    await page.waitForTimeout(800)
    await page.reload()
    await page.getByRole('tab', { name: 'Cenários' }).click()
    await page
        .getByLabel('Cenário', { exact: true })
        .locator('option', { hasText: 'URA de teste' })
        .waitFor({ state: 'attached' })
    const steps = await page.locator('.step').count()
    const dial = await page.getByLabel('Número do passo 2').inputValue()
    const digits = await page.getByLabel('Dígitos do passo 5').inputValue()
    if (steps !== 6 || dial !== '8000' || digits !== '1234')
        throw new Error(`Cenário mudou: ${steps} passos, ${dial}, ${digits}`)
    step('cenário salvo e reaberto sem perdas depois de recarregar')
    console.log('Cenários OK')
} catch (error) {
    failed = true
    if (shots) await page.screenshot({ path: join(shots, 'cen-erro.png') })
    console.error(error)
} finally {
    process.exitCode = failed ? 1 : 0
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
