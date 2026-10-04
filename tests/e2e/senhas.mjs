// Senhas em arquivo local cifrado (RNF-07) e migração do formato antigo, do cofre do sistema (RNF-19).
// Uso: npm run build && node tests/e2e/senhas.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/senhas.mjs)
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-senhas-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const launch = () => electron.launch({ args, env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' } })
const step = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => {
    throw new Error(msg)
}
const registered = (page) => page.locator('.dot.registered').nth(1).waitFor({ timeout: 10000 })
/** Arquivo guardado à parte, como `senhas.json.corrompido-<data>`. */
const asideFile = (prefix) => readdirSync(userData).find((name) => name.startsWith(prefix))
const reopen = async () => {
    await app.close()
    app = await launch()
    const page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    return page
}

let failed = false
let app
try {
    // 1ª abertura: cria as contas de exemplo e grava as senhas no arquivo local.
    app = await launch()
    let page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    await registered(page)
    const local = join(userData, 'senhas.json')
    const text = readFileSync(local, 'utf8')
    if (text.includes('1234')) fail('a senha está em texto puro em senhas.json')
    if (process.platform !== 'win32') {
        for (const name of ['senhas.json', 'chave-local.bin'])
            if ((statSync(join(userData, name)).mode & 0o077) !== 0) fail(`${name} pode ser lido por outros usuários`)
    }
    step('senhas cifradas em senhas.json, legíveis só pelo usuário')

    const ids = Object.keys(JSON.parse(text).entries)
    // Sem cofre do sistema (o Linux do CI), a versão antiga guardava as senhas só na memória:
    // não existe secrets.json para migrar.
    const vault = await app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable())
    if (!vault) console.log('  (sem cofre do sistema aqui: migração do formato antigo não se aplica)')
    else {
        // Simula uma instalação antiga: as senhas no cofre do sistema (secrets.json) e nada no arquivo novo.
        // Uma entrada a mais não abre no cofre, como quando o usuário nega o pedido das Chaves.
        const legacy = await app.evaluate(
            ({ safeStorage }, list) =>
                Object.fromEntries(list.map((id) => [id, safeStorage.encryptString('1234').toString('base64')])),
            ids
        )
        legacy['conta-negada'] = Buffer.from('não abre').toString('base64')
        await app.close()
        writeFileSync(join(userData, 'secrets.json'), JSON.stringify(legacy))
        rmSync(local)

        // 2ª abertura: as senhas antigas são migradas e as contas registram.
        app = await launch()
        page = await app.firstWindow()
        await page.getByText('3 contas').waitFor()
        await registered(page)
        const migrated = JSON.parse(readFileSync(local, 'utf8'))
        if (ids.some((id) => !migrated.entries[id])) fail('nem todas as senhas foram migradas')
        step('senhas do cofre do sistema migradas para o arquivo local')

        // A que não abriu continua no arquivo antigo, para tentar de novo, e a tela avisa.
        const left = JSON.parse(readFileSync(join(userData, 'secrets.json'), 'utf8'))
        if (Object.keys(left).join() !== 'conta-negada') fail(`o secrets.json ficou com ${Object.keys(left)}`)
        await page.getByText('não pôde ser lida do cofre do sistema').waitFor()
        step('senha que o cofre não abriu fica no arquivo antigo, com aviso na tela')
    }

    // Arquivo de senhas mexido não derruba o app; a conta só fica sem senha.
    rmSync(join(userData, 'secrets.json'), { force: true })
    await app.close()
    const current = JSON.parse(readFileSync(local, 'utf8'))
    const broken = { ...current, entries: { ...current.entries, [ids[0]]: 'AAAA' + current.entries[ids[0]].slice(4) } }
    writeFileSync(local, JSON.stringify(broken))
    app = await launch()
    page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    step('senha corrompida não impede o app de abrir')

    // Sem senhas antigas, o aviso de migração não aparece, mesmo com a abertura lenta.
    await page.waitForTimeout(2000)
    if (await page.getByText('Trazendo as senhas').isVisible()) fail('o aviso de migração apareceu sem migração')
    step('sem senhas antigas, nenhum aviso de migração')

    // senhas.json que não é JSON vai para o lado, com aviso, e o app abre.
    writeFileSync(local, '{ isto não é json')
    page = await reopen()
    await page.getByText('O arquivo de senhas (senhas.json) estava estragado').waitFor()
    if (!asideFile('senhas.json.corrompido-')) fail('o senhas.json estragado não foi guardado à parte')
    step('senhas.json estragado é guardado à parte e a tela avisa')

    // Chave com tamanho errado não é sobrescrita: vai para o lado junto com as senhas.
    await page.getByRole('button', { name: 'Entendi' }).click()
    writeFileSync(local, JSON.stringify(current))
    writeFileSync(join(userData, 'chave-local.bin'), 'curta')
    page = await reopen()
    await page.getByText('A chave das senhas (chave-local.bin) estava estragada').waitFor()
    if (!asideFile('chave-local.bin.invalida-')) fail('a chave estragada não foi guardada à parte')
    if (!asideFile('senhas.json.sem-chave-')) fail('o senhas.json da chave estragada não foi guardado à parte')
    if (readFileSync(join(userData, 'chave-local.bin')).length !== 32) fail('a chave nova não foi criada')
    step('chave estragada é guardada à parte com as senhas, e a tela avisa')
    console.log('Senhas OK')
} catch (error) {
    failed = true
    console.error(error)
} finally {
    process.exitCode = failed ? 1 : 0
    await app?.close()
    rmSync(userData, { recursive: true, force: true })
}
