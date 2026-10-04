// Ajuda da IA para ler o log (RF-38), com uma OpenRouter falsa em 127.0.0.1.
// Confere o que sai da máquina (máscara, sem credenciais), a chave no cofre e a resposta na tela.
// Uso: npm run build && node tests/e2e/ai.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/ai.mjs)
import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const KEY = 'sk-or-teste-0123456789'
const ANSWER = 'O que aconteceu: o destino respondeu 486 Busy Here.'
const requests = []
const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
        requests.push({ url: req.url, auth: req.headers.authorization, body })
        res.setHeader('Content-Type', 'application/json')
        if (req.url === '/models')
            return res.end(
                JSON.stringify({
                    data: [
                        { id: 'outro/modelo', name: 'Outro modelo' },
                        { id: 'anthropic/claude-sonnet-teste', name: 'Claude Sonnet (teste)' }
                    ]
                })
            )
        if (req.headers.authorization !== `Bearer ${KEY}`) {
            res.statusCode = 401
            return res.end(JSON.stringify({ error: { message: 'No auth credentials found' } }))
        }
        res.end(JSON.stringify({ choices: [{ message: { content: ANSWER } }] }))
    })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const userData = mkdtempSync(join(tmpdir(), 'iris-ia-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({
    args,
    env: {
        ...process.env,
        IRIS_USER_DATA: userData,
        IRIS_FAKE_MEDIA: '1',
        IRIS_AI_URL: `http://127.0.0.1:${server.address().port}`
    }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => {
    throw new Error(msg)
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()

    // Uma chamada que falha com 486, no PBX simulado.
    await page.getByLabel('Número').fill('486')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    const card = page.locator('.call', { hasText: '486 Busy Here' })
    await card.waitFor({ timeout: 10000 })
    await card.getByRole('button', { name: 'Explicar com IA' }).click()
    const dialog = page.getByRole('dialog', { name: /Explicar a chamada/ })

    await dialog.getByRole('button', { name: 'Salvar chave' }).click()
    await dialog.getByText('Cole a chave da OpenRouter.').waitFor()
    if (requests.length) fail('houve pedido à OpenRouter antes de existir chave')
    step('sem chave, nada é enviado')

    await dialog.getByLabel('Chave da OpenRouter').fill(KEY)
    await dialog.getByRole('button', { name: 'Salvar chave' }).click()
    const preview = dialog.getByLabel('Texto que será enviado')
    await preview.waitFor()
    await dialog.locator('select').waitFor()
    if ((await dialog.getByLabel('Modelo').inputValue()) !== 'anthropic/claude-sonnet-teste')
        fail('o modelo sugerido não foi o Claude Sonnet da lista')
    step('chave salva e modelo sugerido a partir da lista da OpenRouter')

    const masked = await preview.textContent()
    if (!/486 Busy Here/.test(masked)) fail('a prévia perdeu o código da resposta')
    if (/demo\.local|Suporte 1001|\b1001\b|para 486/.test(masked)) fail(`a prévia mostra dado sem máscara:\n${masked}`)
    if (!/\[HOST-1\]|\[NÚMERO-1\]|\[CONTA-1\]/.test(masked)) fail('a prévia não tem marcadores')
    step('prévia mascarada por padrão: sem ramal, domínio nem nome de conta')

    await dialog.getByRole('button', { name: 'Enviar para a OpenRouter' }).click()
    await dialog.getByText(ANSWER).waitFor({ timeout: 10000 })
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'ia-resposta.png') })
    const sent = requests.find((r) => r.url === '/chat/completions')
    if (sent?.auth !== `Bearer ${KEY}`) fail('a chave não foi no cabeçalho Authorization')
    const payload = JSON.parse(sent.body)
    const userText = payload.messages.at(-1).content
    if (payload.model !== 'anthropic/claude-sonnet-teste') fail('modelo errado no pedido')
    if (/demo\.local|Suporte 1001|\b1001\b|para 486/.test(sent.body)) fail('o pedido levou dado sem máscara')
    if (!userText.includes(masked.split('\n\n').slice(1).join('\n\n').trim().slice(0, 80)))
        fail('o texto enviado não é o da prévia')
    if (/1234/.test(sent.body) || sent.body.includes(KEY)) fail('o pedido levou senha ou a chave no corpo')
    step('o pedido leva o texto da prévia, sem senha, e a resposta aparece na tela')

    // A chave fica só no arquivo de senhas, cifrada: a interface não lê, e os arquivos não a guardam em texto puro.
    const leak = await page.evaluate(() =>
        window.iris.secrets.get('ai:openrouter').then(
            (v) => `devolveu ${v}`,
            () => 'recusado'
        )
    )
    if (leak !== 'recusado') fail(`a interface conseguiu ler a chave: ${leak}`)
    for (const name of ['settings.json', 'senhas.json', 'accounts.json']) {
        const file = join(userData, name)
        if (existsSync(file) && readFileSync(file, 'utf8').includes(KEY)) fail(`a chave está em texto puro em ${name}`)
    }
    const settings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
    if (settings.ai?.model !== 'anthropic/claude-sonnet-teste' || settings.ai?.mask !== true)
        fail('modelo e máscara não foram guardados nas preferências')
    step('a interface não lê a chave e nenhum arquivo a guarda em texto puro')

    await dialog.getByLabel(/Mascarar/).uncheck()
    if (!/demo\.local/.test(await preview.textContent())) fail('sem máscara, a prévia deveria mostrar o domínio')
    step('com a máscara desligada, a prévia mostra os dados reais antes de enviar')

    await dialog.getByRole('button', { name: 'Remover chave' }).click()
    await dialog.getByLabel('Chave da OpenRouter').waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    step('chave removida; Esc fecha a janela')

    // Chave errada: o erro da OpenRouter vira uma frase em português.
    await page.getByRole('button', { name: 'Explicar com IA' }).last().click()
    const logDialog = page.getByRole('dialog', { name: /Explicar o log/ })
    await logDialog.getByLabel('Chave da OpenRouter').fill('chave-errada')
    await logDialog.getByRole('button', { name: 'Salvar chave' }).click()
    await logDialog.getByRole('button', { name: 'Enviar para a OpenRouter' }).click()
    await logDialog.getByText('A OpenRouter recusou a chave.').waitFor({ timeout: 10000 })
    step('chave recusada vira aviso claro')

    console.log('IA OK')
} catch (error) {
    failed = true
    console.error(error)
} finally {
    process.exitCode = failed ? 1 : 0
    await app.close()
    server.close()
    rmSync(userData, { recursive: true, force: true })
}
