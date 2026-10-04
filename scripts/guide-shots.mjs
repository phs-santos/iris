// Gera as capturas de tela do guia (src/renderer/src/assets/guide) a partir do próprio app,
// no modo simulado. Rode de novo quando a interface mudar: npm run build && node scripts/guide-shots.mjs
import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'assets', 'guide')
mkdirSync(out, { recursive: true })

// OpenRouter falsa, só para a tela da IA aparecer com modelo e resposta.
const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
        res.setHeader('Content-Type', 'application/json')
        if (req.url === '/models')
            return res.end(JSON.stringify({ data: [{ id: 'anthropic/claude-sonnet', name: 'Claude Sonnet' }] }))
        res.end(
            JSON.stringify({
                choices: [
                    {
                        message: {
                            content:
                                'O que aconteceu\nA conta se registrou e ligou para [NÚMERO-1]. O PBX respondeu 100 Trying e, em seguida, 486 Busy Here.\n\nCausa provável\nO destino estava ocupado ou configurado para recusar uma segunda chamada.\n\nO que fazer\n- Tente de novo em instantes.\n- Confira se o destino não está em outra chamada ou em "não perturbe".'
                        }
                    }
                ]
            })
        )
    })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const userData = mkdtempSync(join(tmpdir(), 'iris-guia-'))
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

    // Chamada que falha, para o log e para a IA.
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

    await busy.getByRole('button', { name: 'Explicar com IA' }).click()
    await dialog().getByLabel('Chave da OpenRouter').fill('sk-or-exemplo')
    await dialog().getByRole('button', { name: 'Salvar chave' }).click()
    await dialog().locator('select').waitFor()
    await dialog().getByRole('button', { name: 'Enviar para a OpenRouter' }).click()
    await dialog().getByLabel('Resposta da IA').waitFor()
    await shot('ia', dialog())
    await dialog().getByRole('button', { name: 'Remover chave' }).click()
    await close()

    await page.getByRole('button', { name: 'Saúde' }).first().click()
    await dialog().locator('.checks li').first().waitFor()
    await shot('saude', dialog())
    await close()

    // Modo Telefone durante uma chamada.
    await page.getByRole('button', { name: 'Modo Telefone' }).click()
    await page.getByLabel('Conta').selectOption({ label: 'Suporte 1001 · 1001' })
    await page.getByLabel('Número').fill('1002')
    await page.getByRole('button', { name: 'Ligar' }).click()
    await page.getByRole('region', { name: 'Chamada em andamento' }).getByRole('img').waitFor({ timeout: 8000 })
    await page.waitForTimeout(2000)
    await shot('telefone')
    await page.getByRole('button', { name: 'Desligar' }).click()
    await page.getByRole('button', { name: 'Bancada', exact: true }).click()
    await page.getByRole('tab', { name: 'Telefone' }).waitFor()
    await page.waitForTimeout(800)

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

    await page.getByRole('tab', { name: 'Cenários' }).click()
    await page.getByRole('button', { name: '+ Exemplo de URA' }).click()
    await page.getByRole('button', { name: 'Executar', exact: true }).click()
    await page.getByText(/^Passou em/).waitFor({ timeout: 20000 })
    await shot('cenarios', page.locator('section.center'))
    console.log('Capturas do guia OK')
} catch (error) {
    console.error(error)
    process.exitCode = 1
} finally {
    await app.close()
    server.close()
    rmSync(userData, { recursive: true, force: true })
}
