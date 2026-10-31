// Senhas em arquivo local cifrado (RNF-07), sem nunca usar o cofre de senhas do sistema.
// Uso: npm run build && node tests/e2e/senhas.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/senhas.mjs)
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { abrirSeletor, abrir, esperarContas, fecharSeletor, seletor } from './helpers/tela.mjs'

const userData = mkdtempSync(join(tmpdir(), 'iris-senhas-'))
/** Abre (ou reabre) o app na mesma pasta de dados e espera as 3 contas. */
const launch = async () => {
    const opened = await abrir({ userData })
    await esperarContas(opened.page)
    return opened
}
const step = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => {
    throw new Error(msg)
}
/** As duas primeiras contas de exemplo registram (a bolinha no seletor). */
const registered = async (page) => {
    await abrirSeletor(page)
    await seletor(page).locator('.dot.registered').nth(1).waitFor({ timeout: 10000 })
    await fecharSeletor(page)
}
/** Arquivo guardado à parte, como `senhas.json.corrompido-<data>`. */
const asideFile = (prefix) => readdirSync(userData).find((name) => name.startsWith(prefix))
const reopen = async () => {
    await app.close()
    let page
    ;({ app, page } = await launch())
    return page
}

let failed = false
let app
try {
    // 1ª abertura: cria as contas de exemplo e grava as senhas no arquivo local.
    let page
    ;({ app, page } = await launch())
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
    // O cofre do sistema nunca é usado: o Chromium sobe com o cofre falso e sem o Secret Service.
    const switches = await app.evaluate(({ app }) => [
        app.commandLine.hasSwitch('use-mock-keychain'),
        app.commandLine.getSwitchValue('password-store')
    ])
    if (!switches[0] || switches[1] !== 'basic') fail(`o app ainda pode abrir o cofre do sistema: ${switches}`)
    step('o app sobe sem acesso ao cofre de senhas do sistema')

    // Um secrets.json de versões antigas (até a 1.0.5) é ignorado e fica onde está: nada pede o cofre.
    await app.close()
    const legacy = JSON.stringify({ [ids[0]]: Buffer.from('cifrado pelo cofre').toString('base64') })
    writeFileSync(join(userData, 'secrets.json'), legacy)
    ;({ app, page } = await launch())
    await registered(page)
    if (readFileSync(join(userData, 'secrets.json'), 'utf8') !== legacy) fail('o secrets.json antigo foi mexido')
    step('secrets.json antigo é ignorado, e as contas registram com as senhas do arquivo próprio')

    // Arquivo de senhas mexido não derruba o app; a conta só fica sem senha.
    rmSync(join(userData, 'secrets.json'), { force: true })
    await app.close()
    const current = JSON.parse(readFileSync(local, 'utf8'))
    const broken = { ...current, entries: { ...current.entries, [ids[0]]: 'AAAA' + current.entries[ids[0]].slice(4) } }
    writeFileSync(local, JSON.stringify(broken))
    ;({ app, page } = await launch())
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
