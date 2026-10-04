// Senhas em arquivo local cifrado (RNF-07) e migração do formato antigo, do cofre do sistema (RNF-19).
// Uso: npm run build && node tests/e2e/senhas.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/senhas.mjs)
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
        const legacy = await app.evaluate(
            ({ safeStorage }, list) =>
                Object.fromEntries(list.map((id) => [id, safeStorage.encryptString('1234').toString('base64')])),
            ids
        )
        await app.close()
        writeFileSync(join(userData, 'secrets.json'), JSON.stringify(legacy))
        rmSync(local)

        // 2ª abertura: as senhas antigas são migradas e as contas registram.
        app = await launch()
        page = await app.firstWindow()
        await page.getByText('3 contas').waitFor()
        await registered(page)
        if (existsSync(join(userData, 'secrets.json'))) fail('o secrets.json antigo não foi apagado depois da migração')
        const migrated = JSON.parse(readFileSync(local, 'utf8'))
        if (Object.keys(migrated.entries).length !== ids.length) fail('nem todas as senhas foram migradas')
        step('senhas do cofre do sistema migradas para o arquivo local; o arquivo antigo foi apagado')
    }

    // 3ª abertura: arquivo de senhas mexido não derruba o app; a conta só fica sem senha.
    await app.close()
    const current = JSON.parse(readFileSync(local, 'utf8'))
    const broken = { ...current, entries: { ...current.entries, [ids[0]]: 'AAAA' + current.entries[ids[0]].slice(4) } }
    writeFileSync(local, JSON.stringify(broken))
    app = await launch()
    page = await app.firstWindow()
    await page.getByText('3 contas').waitFor()
    step('senha corrompida não impede o app de abrir')
    console.log('Senhas OK')
} catch (error) {
    failed = true
    console.error(error)
} finally {
    process.exitCode = failed ? 1 : 0
    await app?.close()
    rmSync(userData, { recursive: true, force: true })
}
