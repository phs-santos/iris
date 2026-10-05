// Chamada de vídeo (RF-52) no modo simulado: cada ponta manda uma imagem de teste.
// Uso: npm run build && node tests/e2e/video.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({
    args,
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
})
const page = await app.firstWindow()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
const step = (msg) => console.log(`✓ ${msg}`)
const account = (name) => page.locator('.acc', { hasText: name })

/** Espera o vídeo de um cartão ter imagem e estar andando (o tempo do vídeo avança). */
async function playing(card, selector, what) {
    const video = card.locator(selector)
    await video.waitFor({ timeout: 8000 })
    const handle = await video.elementHandle()
    await page.waitForFunction((el) => el.videoWidth > 0 && el.currentTime > 0, handle, { timeout: 8000 })
    const before = await handle.evaluate((el) => el.currentTime)
    await page.waitForFunction(([el, t]) => el.currentTime > t + 0.2, [handle, before], { timeout: 8000 })
    step(what)
}

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.getByRole('button', { name: 'Fechar os primeiros passos' }).click()

    // 1001 liga com vídeo para 1002, que atende sozinha: o auto-atender nunca liga a câmera.
    await account('Suporte 1001').locator('.row').click()
    await page.getByLabel('Número', { exact: true }).fill('1002')
    await page.getByRole('button', { name: 'Ligar com vídeo' }).click()
    const caller = page.locator('.call', { hasText: /1001\s*→\s*1002/ })
    const callee = page.locator('.call', { hasText: /1002\s*←\s*1001/ })
    await caller.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 8000 })
    await playing(callee, 'video.remote', 'quem atendeu sozinho vê a imagem de quem ligou')
    await playing(caller, 'video.local', 'quem ligou vê a própria câmera na miniatura')
    await caller.getByText('O outro lado não está mandando imagem').waitFor()
    await callee.getByText('Você atendeu sem câmera').waitFor()
    if (await callee.getByRole('button', { name: /câmera/i }).count())
        throw new Error('quem atendeu sem vídeo não deveria ter botão de câmera')
    step('auto-atender não liga a câmera: só um lado manda imagem, e a tela diz isso')

    // Desligar a câmera tira a imagem do outro lado; ligar de novo devolve.
    await caller.getByRole('button', { name: 'Desligar a câmera' }).click()
    await callee.getByText('O outro lado não está mandando imagem').waitFor()
    await caller.getByRole('button', { name: 'Ligar a câmera' }).click()
    await playing(callee, 'video.remote', 'desligar e ligar a câmera some e volta com a imagem do outro lado')
    await caller.getByRole('button', { name: 'Desligar', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.call').length === 0, null, { timeout: 15000 })

    // 1002 liga com vídeo para 1001, que não tem auto-atender: a faixa oferece atender com vídeo.
    await account('Vendas 1002').locator('.row').click()
    await page.getByLabel('Número', { exact: true }).fill('1001')
    await page.getByRole('button', { name: 'Ligar com vídeo' }).click()
    const band = page.getByRole('region', { name: /Chamada recebida de/ })
    await band.getByRole('button', { name: 'Atender', exact: true }).waitFor({ timeout: 8000 })
    await band.getByRole('button', { name: 'Atender com vídeo' }).click()
    const a = page.locator('.call', { hasText: /1002\s*→\s*1001/ })
    const b = page.locator('.call', { hasText: /1001\s*←\s*1002/ })
    await playing(a, 'video.remote', 'atendida com vídeo: quem ligou vê o outro lado')
    await playing(b, 'video.remote', 'e quem atendeu também')
    await playing(b, 'video.local', 'com a própria câmera na miniatura')
    await b.getByRole('button', { name: 'Desligar', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.call').length === 0, null, { timeout: 15000 })

    // Chamada comum não mostra vídeo nem oferece atender com vídeo.
    await page.getByLabel('Número', { exact: true }).fill('1001')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    await band.getByRole('button', { name: 'Atender', exact: true }).waitFor({ timeout: 8000 })
    if (await band.getByRole('button', { name: 'Atender com vídeo' }).count())
        throw new Error('chamada só de áudio ofereceu atender com vídeo')
    await band.getByRole('button', { name: 'Atender', exact: true }).click()
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 8000 })
    if (await page.locator('.call video').count()) throw new Error('chamada só de áudio mostrou vídeo')
    step('chamada só de áudio continua sem vídeo')

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('Vídeo OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
