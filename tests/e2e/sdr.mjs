// Modo SDR no PBX simulado: importa a fila, configura a abertura e o recado, e roda a fila com uma
// pessoa que atende, uma caixa postal, um ocupado e um número que não existe.
// Uso: npm run build && node tests/e2e/sdr.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'iris-e2e-'))
const wav = (name, seconds) => {
    const samples = 8000 * seconds
    const data = Buffer.alloc(44 + samples * 2)
    data.write('RIFF', 0)
    data.writeUInt32LE(36 + samples * 2, 4)
    data.write('WAVEfmt ', 8)
    data.writeUInt32LE(16, 16)
    data.writeUInt16LE(1, 20)
    data.writeUInt16LE(1, 22)
    data.writeUInt32LE(8000, 24)
    data.writeUInt32LE(16000, 28)
    data.writeUInt16LE(2, 32)
    data.writeUInt16LE(16, 34)
    data.write('data', 36)
    data.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++)
        data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 8000)), 44 + i * 2)
    const path = join(userData, name)
    writeFileSync(path, data)
    return path
}
const openingWav = wav('abertura.wav', 2)
const messageWav = wav('recado.wav', 1)
const csv = join(userData, 'fila.csv')
writeFileSync(
    csv,
    'nome;numero;empresa;segmento;cargo\nAna Lima;1002;Acme;varejo;Gerente\nCaixa Postal;7000;;;\nOcupado;486;;;\nInexistente;1999;;;\n'
)

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
/** O próximo diálogo de abrir arquivo do sistema devolve este caminho. */
const nextOpen = (path) =>
    app.evaluate(({ dialog }, p) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
    }, path)
const phase = (text) =>
    page.getByRole('region', { name: 'Chamada atual' }).getByRole('status').filter({ hasText: text })

try {
    await page.locator('.dot.registered').nth(1).waitFor()
    await page.getByRole('button', { name: 'Fechar os primeiros passos' }).click()
    await page.getByRole('tab', { name: 'SDR' }).click()
    await page.getByText('A fila está vazia').waitFor()

    await nextOpen(csv)
    await page.getByRole('button', { name: 'Importar planilha' }).click()
    await page.getByText('4 pessoas na fila; 0 já estavam').waitFor()
    step('planilha importada com 4 pessoas')

    // Números colados direto no painel, sem planilha.
    await page.getByRole('button', { name: 'Adicionar números' }).click()
    await page.getByLabel(/Uma pessoa por linha/).fill('1002\nBia Rocha 1003\nsem número')
    await page.getByRole('button', { name: 'Adicionar à fila' }).click()
    await page.getByText('1 pessoas na fila; 1 já estavam e 1 linhas sem número foram puladas.').waitFor()
    await page.getByRole('region', { name: 'Fila' }).getByText('Bia Rocha').waitFor()
    await page.getByRole('region', { name: 'Fila' }).getByRole('button', { name: 'Tirar Bia Rocha da fila' }).click()
    step('números colados no painel entram na fila, sem repetir quem já estava')

    // Fora do horário (a fila ainda está com 09:00 às 18:00 de segunda a sexta), Ligar numa pessoa liga
    // assim mesmo: o horário vale para a fila andando sozinha.
    await page.getByRole('button', { name: 'Adicionar números' }).click()
    await page.getByLabel(/Uma pessoa por linha/).fill('Ramal 8000')
    await page.getByRole('button', { name: 'Adicionar à fila' }).click()
    // Só um dia da semana, que não é hoje: a fila estaria fora do horário.
    await page.getByRole('button', { name: 'Opções' }).click()
    const hoursForm = page.getByRole('dialog', { name: 'Opções do modo SDR' })
    await hoursForm.getByLabel('Ligar pela conta').selectOption({ label: 'Suporte 1001 · 1001@demo.local' })
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const other = days[(new Date().getDay() + 1) % 7]
    for (const day of days) await hoursForm.getByLabel(day, { exact: true }).setChecked(day === other)
    await hoursForm.getByRole('button', { name: 'Salvar' }).click()
    // A conta da fila desconectada: o clique em Ligar registra e liga.
    const support = page.locator('.acc', { hasText: 'Suporte 1001' })
    await support.locator('.row').click()
    await support.getByRole('button', { name: 'Desregistrar' }).click()
    await support.locator('.dot.disconnected').waitFor()
    await page.getByRole('tab', { name: 'SDR' }).click()
    await page.getByRole('region', { name: 'Fila' }).getByRole('button', { name: 'Ligar para Ramal' }).click()
    await support.locator('.dot.registered').waitFor({ timeout: 10000 })
    await phase('chamando').waitFor({ timeout: 8000 })
    await page.getByRole('region', { name: 'Chamada atual' }).getByRole('button', { name: 'Desligar' }).click()
    await page
        .getByRole('region', { name: 'Fila' })
        .getByText(/8000 · Não atendeu/)
        .waitFor()
    step('Ligar com a conta desconectada registra e liga, mesmo fora do horário da fila (ramal 8000)')

    // Opções: conta, abertura gravada, recado da caixa postal e horário o dia todo (o teste roda a qualquer hora).
    await page.getByRole('button', { name: 'Opções' }).click()
    const form = page.getByRole('dialog', { name: 'Opções do modo SDR' })
    await form.getByLabel('Ligar pela conta').selectOption({ label: 'Suporte 1001 · 1001@demo.local' })
    await nextOpen(openingWav)
    await form
        .getByRole('group', { name: 'Gravação da abertura 1' })
        .getByRole('button', { name: 'Escolher WAV…' })
        .click()
    await form.getByText('abertura.wav').waitFor()
    if (!(await form.getByLabel(/Tocar a gravação quando a pessoa atender/).isChecked()))
        throw new Error('escolher a gravação deveria ligar o tocar ao atender')
    await form.getByLabel('Deixar o recado gravado e desligar').check()
    await nextOpen(messageWav)
    await form
        .getByRole('group', { name: 'Recado da caixa postal' })
        .getByRole('button', { name: 'Escolher WAV…' })
        .click()
    await form.getByText('recado.wav').waitFor()
    await form.getByRole('textbox', { name: 'De', exact: true }).fill('00:00')
    await form.getByRole('textbox', { name: 'Até', exact: true }).fill('23:59')
    for (const day of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'])
        await form.getByLabel(day, { exact: true }).check()
    await form.getByLabel(/Próxima ligação em/).fill('1')
    await form.getByLabel('Meta de ligações por dia').fill('10')
    // Fechar pelo X também salva.
    await form.getByRole('button', { name: 'Fechar', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Abertura gravada: toca ao atender' }).waitFor()
    step('opções salvas ao fechar: escolher a gravação ligou o tocar ao atender, e o painel mostra')

    // 1) Ana atende (Vendas 1002 atende sozinha e diz "Alô?"): a abertura toca, depois a conversa.
    await page.getByRole('button', { name: 'Começar a fila' }).click()
    const now = page.getByRole('region', { name: 'Chamada atual' })
    await now.getByText('Ana Lima').first().waitFor()
    await now.getByText('Oi, Ana, tudo bem? Aqui é Suporte 1001. Estou falando com você porque a Acme').waitFor()
    await now.getByText('Gerente').waitFor()
    await phase('tocando a abertura').waitFor({ timeout: 10000 })
    await phase('em conversa').waitFor({ timeout: 8000 })
    step('pessoa atendeu: o roteiro tem as variáveis, a abertura tocou depois do "Alô?" e a conversa seguiu')
    await now.getByRole('button', { name: 'Desligar' }).click()
    await phase('encerrada').waitFor()
    await now.getByLabel('Nota (vai para a exportação e o CRM)').fill('Quinta às 10h')
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('2')
    step('resultado pela tecla 2: Reunião marcada, com a nota')

    // 2) Caixa postal: detectada, espera o sinal, deixa o recado e segue sozinha.
    await now.getByText('Caixa Postal').first().waitFor({ timeout: 8000 })
    await phase('esperando o sinal').waitFor({ timeout: 10000 })
    await phase('deixando o recado').waitFor({ timeout: 8000 })
    // 3) e 4) Ocupado e número inexistente fecham sozinhos.
    await page.getByText('Ninguém para ligar agora.').waitFor({ timeout: 40000 })
    step('caixa postal com recado, ocupado e número inexistente seguem sem ninguém clicar')

    const data = JSON.parse(readFileSync(join(userData, 'sdr.json'), 'utf8'))
    const by = (name) => data.leads.find((l) => l.name === name)
    const expect = [
        ['Ana Lima', 'done', 'reuniao'],
        ['Caixa Postal', 'pending', 'caixa_postal'],
        ['Ocupado', 'pending', 'nao_atendeu'],
        ['Inexistente', 'done', 'numero_errado']
    ]
    for (const [name, status, outcome] of expect) {
        const l = by(name)
        if (l?.status !== status || l.outcome !== outcome)
            throw new Error(`${name} ficou ${l?.status}/${l?.outcome}, esperado ${status}/${outcome}`)
    }
    if (by('Ana Lima').note !== 'Quinta às 10h') throw new Error('a nota não foi gravada')
    if (!by('Ocupado').nextAt) throw new Error('o ocupado deveria voltar mais tarde')
    step('sdr.json: reunião e número errado saíram da fila; caixa postal e ocupado voltam depois')

    const panel = page.getByRole('region', { name: 'Painel do dia' })
    await panel.getByText('5 de 10 ligações hoje').waitFor()
    const value = async (label) =>
        (await panel.locator('div', { hasText: label }).locator('dd').first().textContent()).trim()
    if (
        (await value('Atendidas')) !== '1' ||
        (await value('Conversões')) !== '1' ||
        (await value('Caixas postais')) !== '1'
    )
        throw new Error('painel com os números errados')
    step('painel: 5 de 10, 1 atendida, 1 conversão, 1 caixa postal')

    const out = join(userData, 'resultado.csv')
    await app.evaluate(({ dialog }, p) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
    }, out)
    await page.getByRole('button', { name: 'Exportar resultados' }).click()
    await page.getByText(/Resultados salvos em/).waitFor()
    const exported = readFileSync(out, 'utf8')
    if (
        !exported.includes('Ana Lima;1002;Acme;varejo;concluida;Reunião marcada;1;') ||
        !exported.includes('Quinta às 10h;Gerente')
    )
        throw new Error(`exportação errada:\n${exported}`)
    step('exportação em CSV com o resultado, a nota e a coluna extra')

    // O resumo da IA só lê gravações da pasta das gravações.
    for (const path of [
        '/etc/passwd',
        join(userData, 'gravacoes', '..', 'senhas.json'),
        join(userData, 'abertura.wav')
    ]) {
        const result = await page.evaluate((p) => window.iris.ai.summarize('qualquer/modelo', p), path)
        if (result.ok || !/fora da pasta/.test(result.error)) throw new Error(`o resumo aceitou ${path}`)
    }
    step('o resumo da IA recusa arquivo fora da pasta das gravações')

    if (pageErrors.length) throw new Error(`erros na página: ${pageErrors.join(' | ')}`)
    console.log('SDR OK')
} catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
} finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
