// Arquivos de dados e log interno: preferências gravadas em fila, arquivo estragado guardado à parte
// sem impedir o app de abrir (RNF-19) e erros no log em arquivo (RNF-14).
// Uso: npm run build && node tests/e2e/arquivos.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/arquivos.mjs)
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-arquivos-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const launch = () =>
    electron.launch({
        args,
        env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1', IRIS_MODES: 'all' }
    })
const step = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => {
    throw new Error(msg)
}
const readData = (name) => JSON.parse(readFileSync(join(userData, name), 'utf8'))
const appLog = () => readFileSync(join(userData, 'logs', 'iris.log'), 'utf8')

let failed = false
let app
try {
    app = await launch()
    let page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    if (!/INFO Íris \S+ abriu/.test(appLog())) fail('o log interno não registrou a abertura do app')
    step('log interno criado em logs/iris.log na pasta de dados')

    // Quatro telas gravando ao mesmo tempo: nenhuma alteração pode se perder.
    await page.evaluate(() =>
        Promise.all([
            window.iris.settings.update({ profile: { name: 'Ana' } }),
            window.iris.settings.update({ appearance: { size: 'large' } }),
            window.iris.settings.update({ reconnect: { maxAttempts: 3 } }),
            window.iris.settings.update({ trustedHosts: ['pbx.exemplo'] }),
            window.iris.ai.setOptions({ mask: false })
        ])
    )
    const settings = readData('settings.json')
    if (
        settings.profile?.name !== 'Ana' ||
        settings.appearance?.size !== 'large' ||
        settings.reconnect?.maxAttempts !== 3 ||
        settings.trustedHosts?.[0] !== 'pbx.exemplo' ||
        settings.ai?.mask !== false
    )
        fail(`gravações simultâneas se perderam: ${JSON.stringify(settings)}`)
    if (readdirSync(userData).some((name) => name.endsWith('.tmp'))) fail('sobrou arquivo temporário na pasta de dados')
    step('cinco gravações simultâneas das preferências: nenhuma se perdeu')

    const refused = await page.evaluate(() =>
        window.iris.settings.update({ updateChannel: 'beta' }).then(
            () => false,
            () => true
        )
    )
    if (!refused) fail('a interface conseguiu mudar um campo que não é dela')
    step('campo fora da lista é recusado')

    await page.evaluate(() => {
        setTimeout(() => {
            throw new Error('erro de teste da interface')
        })
    })
    await page.waitForTimeout(500)
    if (!appLog().includes('erro de teste da interface')) fail('o erro da interface não chegou ao log interno')
    if (!appLog().includes('Canal settings:update falhou')) fail('a falha do canal de IPC não chegou ao log interno')
    step('erro da interface e falha de canal gravados no log interno')

    // Arquivos estragados: o app abre, guarda cada um à parte e avisa.
    await app.close()
    writeFileSync(join(userData, 'settings.json'), '{ isto não é JSON')
    writeFileSync(join(userData, 'accounts.json'), '[1, 2, 3]')
    writeFileSync(join(userData, 'scenarios.json'), '')
    app = await launch()
    page = await app.firstWindow()
    await page.getByText('3 contas').waitFor({ timeout: 15000 })
    step('o app abre com preferências, contas e cenários estragados')
    for (const [name, what] of [
        ['settings.json', 'preferências'],
        ['accounts.json', 'contas'],
        ['scenarios.json', 'cenários']
    ]) {
        if (!readdirSync(userData).some((f) => f.startsWith(`${name}.corrompido-`)))
            fail(`${name} estragado não foi guardado à parte`)
        await page.getByText(`O arquivo de ${what} (${name}) estava estragado`).waitFor({ timeout: 10000 })
    }
    step('os três arquivos foram guardados à parte e a tela avisa de cada um')
    if (!Array.isArray(readData('accounts.json').accounts)) fail('accounts.json não foi recriado')
    if (!existsSync(join(userData, 'senhas.json'))) fail('senhas.json sumiu')
    step('contas de exemplo recriadas')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
} finally {
    await app?.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('Arquivos OK')
