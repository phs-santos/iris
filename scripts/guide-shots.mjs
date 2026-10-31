// Gera as capturas de tela do guia (src/renderer/src/assets/guide) a partir do próprio app,
// no modo simulado. Rode de novo quando a interface mudar: npm run build && node scripts/guide-shots.mjs
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'assets', 'guide')
mkdirSync(out, { recursive: true })

const userData = mkdtempSync(join(tmpdir(), 'iris-guia-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
const app = await electron.launch({
    args,
    env: {
        ...process.env,
        IRIS_USER_DATA: userData,
        IRIS_FAKE_MEDIA: '1'
    }
})
const page = await app.firstWindow()
const shot = async (name, target = page) => {
    await page.waitForTimeout(350)
    await target.screenshot({ path: join(out, `${name}.png`) })
    console.log(`✓ ${name}`)
}
const dialog = () => page.locator('.dialog')
const close = async () => {
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'detached' })
}

try {
    await page.getByText('3 contas').waitFor()
    await page.locator('.dot.registered').nth(1).waitFor()

    // Formulário de conta, com o Avançado aberto.
    await page.getByRole('button', { name: '+ Nova' }).click()
    await page.locator('.toggle-adv').click()
    await shot('conta', dialog())
    await close()

    // Chamada entre as duas contas simuladas (a 1002 atende sozinha).
    await page.locator('.chip', { hasText: '1002' }).click()
    await page.locator('.pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 8000 })
    await page.waitForTimeout(2500)
    await shot('principal')
    await shot('contas', page.locator('.acc').first().locator('xpath=ancestor::*[contains(@class,"pane")][1]'))

    const outgoing = page.locator('.call', { hasText: '→' }).first()
    await outgoing.getByRole('button', { name: 'DTMF' }).click()
    await outgoing.getByLabel('Sequência DTMF').fill('1,w2,4321#')
    await shot('dtmf', outgoing)
    await outgoing.getByRole('button', { name: 'DTMF' }).click()
    await outgoing.getByRole('button', { name: 'Transferir' }).click()
    await outgoing.getByLabel('Destino').fill('2001')
    await shot('transferencia', outgoing)
    await outgoing.getByRole('button', { name: 'Transferir' }).click()
    await outgoing.getByRole('button', { name: 'Desligar' }).click()

    // Discador com o teclado e os cabeçalhos abertos.
    await page.getByRole('button', { name: 'teclado' }).click()
    await page.getByRole('button', { name: 'cabeçalhos SIP' }).click()
    await page.getByLabel('Número').fill('8000')
    await shot('discador', page.locator('.dialer'))
    await page.getByRole('button', { name: 'teclado' }).click()
    await page.getByRole('button', { name: 'cabeçalhos SIP' }).click()
    await page.getByLabel('Número').fill('')

    // Chamada que falha, para o log e o Fluxo SIP.
    await page.getByLabel('Número').fill('486')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    const busy = page.locator('.call', { hasText: '486 Busy Here' })
    await busy.waitFor({ timeout: 8000 })
    await page.getByRole('tab', { name: 'Tudo' }).click()
    await shot('log', page.locator('aside.pane').last())
    await page.getByRole('button', { name: 'Fluxo SIP' }).click()
    await dialog()
        .getByRole('button', { name: /^486 Busy Here, / })
        .click()
    await shot('fluxo', dialog())
    await close()
    await page.getByRole('tab', { name: 'Eventos' }).click()

    await page.getByRole('button', { name: /^Mais ações de / }).click()
    await page.getByRole('menuitem', { name: 'Saúde' }).click()
    await dialog().locator('.checks li').first().waitFor()
    await shot('saude', dialog())
    await close()

    // Configurações: cada seção vira uma captura da tela inteira.
    await page.getByRole('button', { name: 'Configurações' }).click()
    await dialog().getByRole('tab', { name: 'Aparência' }).click()
    await shot('configuracoes', dialog())
    await dialog().getByRole('tab', { name: 'Áudio' }).click()
    await dialog().getByRole('meter', { name: 'Nível do microfone' }).waitFor()
    await shot('audio', dialog())
    await dialog().getByRole('tab', { name: 'Importar e exportar' }).click()
    await shot('importar', dialog())
    await dialog().getByRole('tab', { name: 'Atualização' }).click()
    await shot('atualizacao', dialog())
    await close()

    console.log('Capturas do guia OK')
} catch (error) {
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
