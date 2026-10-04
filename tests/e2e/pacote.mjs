// Fumaça do app EMPACOTADO (RNF-01): os outros testes rodam o app sem empacotar, e as duas versões
// recolhidas (janela em branco, canal de IPC registrado tarde) passaram em todos eles. Este gera um
// pacote de diagnóstico, igual ao de verdade menos o fuse que impede o Playwright de abrir o app,
// abre, confere que as contas aparecem e registram e lê o log interno. Mede também a abertura e o
// registro (RNF-04).
// Uso: npm run test:pacote   (Linux sem tela: xvfb-run -a node tests/e2e/pacote.mjs depois do build)
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const OUT = resolve('dist-diag')
const OPEN_LIMIT_MS = 3000
const REGISTER_LIMIT_MS = 2000
const step = (msg) => console.log(`✓ ${msg}`)

function executable() {
    const arch = process.arch
    if (process.platform === 'darwin')
        return join(OUT, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Iris.app', 'Contents', 'MacOS', 'Iris')
    if (process.platform === 'win32') return join(OUT, 'win-unpacked', 'Iris.exe')
    return join(OUT, 'linux-unpacked', 'iris')
}

if (!process.env.IRIS_SKIP_PACK) {
    rmSync(OUT, { recursive: true, force: true })
    execSync(
        `npx electron-builder --dir --${process.arch} --publish never ` +
            `-c.electronFuses.enableNodeCliInspectArguments=true -c.directories.output=${JSON.stringify(OUT)}`,
        { stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } }
    )
}
if (!existsSync(executable())) {
    console.error(`✗ pacote não encontrado em ${executable()}`)
    process.exit(1)
}

const userData = mkdtempSync(join(tmpdir(), 'iris-pacote-'))
const args = process.getuid?.() === 0 ? ['--no-sandbox'] : []
let failed = false
let app
try {
    const started = Date.now()
    app = await electron.launch({
        executablePath: executable(),
        args,
        env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
    })
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.locator('.topbar .brand').waitFor({ timeout: 30000 })
    const openMs = Date.now() - started
    step(`janela desenhada em ${openMs} ms (limite do RNF-04: ${OPEN_LIMIT_MS} ms)`)

    await page.getByText('3 contas').waitFor({ timeout: 30000 })
    const registering = Date.now()
    await page.locator('.dot.registered').nth(1).waitFor({ timeout: 15000 })
    const registerMs = Date.now() - registering
    step(`contas de exemplo carregadas e registradas em ${registerMs} ms (limite: ${REGISTER_LIMIT_MS} ms)`)

    if (!(await app.evaluate(({ app }) => app.isPackaged))) throw new Error('o app aberto não é o empacotado')
    const version = await app.evaluate(({ app }) => app.getVersion())
    const expected = JSON.parse(readFileSync('package.json', 'utf8')).version
    if (version !== expected) throw new Error(`versão ${version} no pacote, ${expected} no package.json`)
    step(`é o app empacotado, versão ${version}`)

    // Telas que falam com o processo principal ao abrir: se um canal faltar, o erro aparece aqui.
    await page.getByRole('button', { name: 'Configurações' }).click()
    await page.getByRole('tab', { name: /Atualização/ }).click()
    await page.getByRole('tab', { name: 'Ajuda da IA' }).click()
    await page.getByRole('button', { name: 'Fechar' }).click()
    await page.getByRole('button', { name: 'Guia' }).click()
    await page.locator('.dialog img').first().waitFor({ timeout: 10000 })
    step('Configurações e Guia abrem, com as imagens do pacote')

    const log = readFileSync(join(userData, 'logs', 'iris.log'), 'utf8')
    const bad = log.split('\n').filter((line) => / ERROR /.test(line))
    if (bad.length) throw new Error(`erros no log interno do app:\n${bad.join('\n')}`)
    if (errors.length) throw new Error(`erros na interface:\n${errors.join('\n')}`)
    step('nenhum erro no log interno nem na interface')

    // Máquinas de CI variam muito; os tempos só reprovam quando alguém pede.
    if (process.env.STRICT_TIMES && (openMs > OPEN_LIMIT_MS || registerMs > REGISTER_LIMIT_MS))
        throw new Error('abertura ou registro acima do limite do RNF-04')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
    try {
        console.error(readFileSync(join(userData, 'logs', 'iris.log'), 'utf8'))
    } catch {
        // o app nem chegou a criar o log
    }
} finally {
    await app?.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('Pacote OK')
