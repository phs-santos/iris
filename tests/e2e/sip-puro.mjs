// Motor próprio (RF-39): contas por SIP puro registram no Asterisk por UDP, TCP e TLS, medem a Saúde
// por OPTIONS, mostram o SIP bruto, ligam e recebem chamadas com áudio G.711 e DTMF, põem em espera,
// transferem (cega e assistida) e desregistram.
// Uso: docker compose up -d && npm run build && node tests/e2e/sip-puro.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const HOST = process.env.PBX_DOMAIN ?? '127.0.0.1'
const CONTAINER = process.env.PBX_CONTAINER ?? 'iris-asterisk-1'
const userData = mkdtempSync(join(tmpdir(), 'iris-sip-puro-'))
const args = ['.']
if (process.getuid?.() === 0) args.push('--no-sandbox')
// Para investigar uma conexão que não fecha: grava o registro de rede do Chromium.
if (process.env.IRIS_NETLOG) args.push(`--log-net-log=${process.env.IRIS_NETLOG}`)
const contacts = () => execSync(`docker exec ${CONTAINER} asterisk -rx "pjsip show contacts"`).toString()

// Com IRIS_APP, roda contra o app empacotado (o pacote de diagnóstico do test:pacote).
const app = await electron.launch({
    ...(process.env.IRIS_APP ? { executablePath: process.env.IRIS_APP, args: args.slice(1) } : { args }),
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)
const account = (name) => page.locator('.acc', { hasText: name })

async function addAccount(name, ext, transport, password = '1234', autoAnswer = false, srtp = false) {
    await page.getByRole('button', { name: '+ Nova' }).click()
    const form = page.locator('form.dialog')
    await form.getByRole('textbox', { name: 'Nome' }).fill(name)
    await form.getByRole('textbox', { name: 'Ramal' }).fill(ext)
    await form.getByRole('textbox', { name: 'Domínio SIP' }).fill(HOST)
    await form.getByLabel('Senha').fill(password)
    await form.getByLabel('Transporte').selectOption({ label: `SIP por ${transport}` })
    if (await form.getByRole('textbox', { name: 'WebSocket (WSS)' }).count())
        throw new Error('o campo do WebSocket continua na tela de uma conta de SIP puro')
    if (autoAnswer) await form.getByText('Auto-atender após').locator('input[type=checkbox]').check()
    if (srtp) await form.getByText('Exigir áudio cifrado (SRTP)').locator('input[type=checkbox]').check()
    await form.getByRole('button', { name: 'Salvar e registrar' }).click()
}

const call = (text) => page.locator('.call', { hasText: text })
async function dial(from, number) {
    await account(from).locator('.row').click()
    await page.getByLabel('Número').fill(number)
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
}
/** A linha de qualidade só aparece quando chegam pacotes RTP: prova que o áudio está vindo. */
async function expectAudio(card, what) {
    const quality = card.locator('.quality')
    await quality.filter({ hasText: /PCM[UA]/ }).waitFor({ timeout: 15000 })
    step(`${what}: ${(await quality.textContent()).trim().replace(/\s+/g, ' ')}`)
}

async function expectContact(ext, present) {
    for (let i = 0; i < 20; i++) {
        if (contacts().includes(`${ext}/sip:${ext}@`) === present) return
        await page.waitForTimeout(250)
    }
    throw new Error(`o Asterisk ${present ? 'não tem' : 'ainda tem'} o contato do ramal ${ext}`)
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()

    await addAccount('Puro UDP', '2001', 'UDP')
    await account('Puro UDP').locator('.dot.registered').waitFor({ timeout: 15000 })
    await expectContact('2001', true)
    step('2001 registrou por UDP e o Asterisk tem o contato')

    await addAccount('Puro TCP', '2002', 'TCP', '1234', true)
    await account('Puro TCP').locator('.dot.registered').waitFor({ timeout: 15000 })
    await expectContact('2002', true)
    step('2002 registrou por TCP')

    // O PBX de teste usa certificado autoassinado: o app recusa e oferece confiar no host (RF-37).
    await addAccount('Puro TLS', '2003', 'TLS')
    await page.getByRole('button', { name: 'Confiar neste host' }).click({ timeout: 15000 })
    await account('Puro TLS').locator('.dot.registered').waitFor({ timeout: 15000 })
    await expectContact('2003', true)
    step('2003: certificado autoassinado recusado, aceito pelo usuário e registro por TLS')

    await addAccount('Puro senha errada', '2004', 'UDP', 'errada')
    await account('Puro senha errada').getByText('O PBX não aceitou a senha').waitFor({ timeout: 15000 })
    if (await account('Puro senha errada').getByText('tentando de novo').count())
        throw new Error('senha errada não deveria ser tentada de novo')
    step('senha errada vira erro em português, sem nova tentativa')

    await account('Puro UDP').locator('.row').click()
    await account('Puro UDP')
        .getByRole('button', { name: /Mais ações|⋯/ })
        .click()
    await page.getByRole('menuitem', { name: 'Saúde' }).click()
    const health = page.getByRole('dialog')
    await health.getByText('Transporte UDP conectado').waitFor({ timeout: 10000 })
    await health.getByText(/OPTIONS respondeu em \d+ ms/).waitFor({ timeout: 10000 })
    await health.getByRole('button', { name: 'Fechar' }).first().click()
    step('Saúde: transporte conectado e OPTIONS respondido')

    await page.getByRole('tab', { name: 'SIP bruto' }).click()
    const log = page.locator('.line.sip')
    await log
        .filter({ hasText: `REGISTER sip:${HOST} SIP/2.0` })
        .first()
        .waitFor({ timeout: 10000 })
    await log.filter({ hasText: 'SIP/2.0 200 OK' }).first().waitFor({ timeout: 10000 })
    const text = (await log.allInnerTexts()).join('\n')
    if (/response="[0-9a-f]{16,}"/.test(text)) throw new Error('a resposta do desafio apareceu no log (RNF-10)')
    step('SIP bruto mostra REGISTER e 200 OK, sem a resposta do desafio')

    // ─── Chamadas (segunda entrega) ───
    await page.getByRole('tab', { name: 'Eventos' }).click()
    await dial('Puro UDP', '600')
    const echo = call(/2001\s*→\s*600/)
    await echo.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await expectAudio(echo, 'chamada para o eco atendida, com áudio voltando')
    // Gravação (RF-36): o WAV sai com o microfone num canal e o eco no outro.
    await echo.getByRole('button', { name: 'Gravar' }).click()
    await page.waitForTimeout(1500)
    await echo.getByRole('button', { name: 'Parar gravação' }).click()
    const saved = page
        .locator('.list')
        .getByText(/Gravação salva em .*\.wav/)
        .first()
    await saved.waitFor({ timeout: 10000 })
    const wavPath = /salva em (.*\.wav)/.exec(await saved.textContent())[1]
    const wav = readFileSync(wavPath)
    const frames = (wav.length - 44) / 4
    const loud = (channel) => {
        let peak = 0
        for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + i * 4 + channel * 2)))
        return peak
    }
    if (wav.toString('latin1', 0, 4) !== 'RIFF' || wav.readUInt16LE(22) !== 2 || frames < 8000)
        throw new Error(`gravação inválida: ${frames} amostras por canal`)
    if (loud(0) < 500 || loud(1) < 500) throw new Error(`gravação muda: picos ${loud(0)} e ${loud(1)}`)
    step(`gravação em WAV estéreo com ${(frames / 8000).toFixed(1)} s e áudio nos dois canais`)
    await echo.getByRole('button', { name: 'Mudo' }).click()
    await echo.getByRole('button', { name: 'Desligar' }).click()
    await echo.locator('.pill', { hasText: 'encerrada' }).waitFor({ timeout: 10000 })
    step('desligar encerra a chamada (BYE)')

    await dial('Puro UDP', '486')
    await call('486 Busy Here').waitFor({ timeout: 20000 })
    step('número ocupado: 486 no cartão')

    // Só valem as linhas da URA escritas depois deste instante: outros testes também ligam para ela.
    const since = new Date().toISOString()
    await dial('Puro UDP', '8000')
    const ivr = call(/2001\s*→\s*8000/)
    await ivr.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await ivr.getByRole('button', { name: 'DTMF' }).click()
    await ivr.getByLabel('Sequência DTMF').fill('w1 4321')
    await ivr.getByRole('button', { name: 'Enviar' }).click()
    let out = ''
    for (let i = 0; i < 25 && !/URA recebeu/.test(out); i++) {
        await page.waitForTimeout(1000)
        out = execSync(`docker compose logs --since ${since} asterisk`, { encoding: 'utf8' })
    }
    if (!/URA recebeu 4321/.test(out))
        throw new Error(`a URA não recebeu 4321 por RTP (recebeu "${/URA recebeu (\S*)/.exec(out)?.[1] ?? 'nada'}")`)
    await page
        .locator('.list')
        .getByText('Chamada para 8000: Encerrada pelo outro lado')
        .first()
        .waitFor({ timeout: 15000 })
    step('DTMF por RTP: a URA recebeu 4321 e desligou')

    // Entre duas contas de SIP puro: UDP liga, TCP atende sozinha.
    await dial('Puro UDP', '2002')
    const caller = call(/2001\s*→\s*2002/)
    const callee = call(/2002\s*←\s*2001/)
    await callee.waitFor({ timeout: 20000 })
    await caller.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await callee.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await expectAudio(caller, 'chamada entre duas contas de SIP puro, áudio em quem ligou')
    await expectAudio(callee, 'e em quem atendeu')
    await callee.getByRole('button', { name: 'Desligar' }).click()
    await caller.locator('.pill', { hasText: 'encerrada' }).waitFor({ timeout: 10000 })
    step('quem atendeu desligou e o outro lado encerrou')

    // ─── Espera e transferência (terceira entrega) ───
    const live = (text) => page.locator('.call:not(.ended)', { hasText: text })
    await page.waitForTimeout(500)
    await dial('Puro UDP', '2002')
    const holder = live(/2001\s*→\s*2002/)
    await holder.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await holder.getByRole('button', { name: 'Espera' }).click()
    await holder.locator('.pill', { hasText: 'em espera' }).waitFor({ timeout: 10000 })
    await holder.getByRole('button', { name: 'Retomar' }).click()
    await holder.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 10000 })
    step('espera e retomada por re-INVITE')

    // Cega: 2001 manda 2002 para o eco e sai da chamada.
    await holder.getByRole('button', { name: 'Transferir' }).click()
    await holder.getByLabel('Destino').fill('600')
    await holder.getByRole('button', { name: 'Cega' }).click()
    await page.locator('.list').getByText('Transferência: 200 OK').first().waitFor({ timeout: 15000 })
    await holder.waitFor({ state: 'detached', timeout: 15000 })
    const transferred = live(/2002\s*←\s*2001/)
    await transferred.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 10000 })
    step('transferência cega: quem transferiu saiu e o outro lado segue em chamada com o destino')
    await transferred.getByRole('button', { name: 'Desligar' }).click()
    await transferred.waitFor({ state: 'detached', timeout: 10000 })
    await page.waitForTimeout(500)

    // Assistida: 2001 fala com 2002, consulta o eco e junta os dois.
    await dial('Puro UDP', '2002')
    const original = live(/2001\s*→\s*2002/)
    await original.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await original.getByRole('button', { name: 'Transferir' }).click()
    await original.getByLabel('Destino').fill('600')
    await original.getByRole('button', { name: 'Consultar antes' }).click()
    const consult = live('Consulta para transferir')
    await consult.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 25000 })
    await consult.getByRole('button', { name: 'Concluir transferência' }).click()
    await page.locator('.list').getByText('Transferência: 200 OK').nth(1).waitFor({ timeout: 15000 })
    await original.waitFor({ state: 'detached', timeout: 15000 })
    await consult.waitFor({ state: 'detached', timeout: 15000 })
    const joined = live(/2002\s*←\s*2001/)
    await joined.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 10000 })
    step('transferência assistida: as duas chamadas de quem transferiu caíram e o outro lado ficou com o destino')
    await joined.getByRole('button', { name: 'Desligar' }).click()
    await joined.waitFor({ state: 'detached', timeout: 10000 })
    await page.waitForTimeout(500)

    // ─── Áudio cifrado (SRTP) ───
    await addAccount('Puro SRTP', '2005', 'TLS', '1234', false, true)
    await account('Puro SRTP').locator('.dot.registered').waitFor({ timeout: 15000 })
    await dial('Puro SRTP', '600')
    const secure = live(/2005\s*→\s*600/)
    await secure.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 20000 })
    await secure
        .locator('.quality')
        .filter({ hasText: /PCM[UA] \(SRTP\)/ })
        .waitFor({ timeout: 15000 })
    step(`áudio cifrado com o eco: ${(await secure.locator('.quality').textContent()).trim().replace(/\s+/g, ' ')}`)
    await secure.getByRole('button', { name: 'Desligar' }).click()
    await secure.waitFor({ state: 'detached', timeout: 10000 })
    // Chamada recebida com cifra: o Asterisk oferece SRTP ao 2005 e fala sem cifra com o 2001.
    await dial('Puro UDP', '2005')
    await page
        .getByRole('region', { name: /Chamada recebida de/ })
        .getByRole('button', { name: 'Atender' })
        .click({ timeout: 20000 })
    const answered = live(/2005\s*←\s*2001/)
    await answered
        .locator('.quality')
        .filter({ hasText: /PCM[UA] \(SRTP\)/ })
        .waitFor({ timeout: 15000 })
    await live(/2001\s*→\s*2005/)
        .locator('.quality')
        .filter({ hasText: /PCM[UA]$/ })
        .waitFor({ timeout: 15000 })
    step('chamada recebida com cifra: SRTP de um lado, RTP comum do outro, com áudio nos dois')
    await answered.getByRole('button', { name: 'Desligar' }).click()
    await answered.waitFor({ state: 'detached', timeout: 10000 })
    await page.waitForTimeout(500)

    // SIP puro com WebRTC: o Asterisk faz a ponte entre o RTP simples e o DTLS-SRTP. O ramal 1021 só
    // fala G.711, porque o Asterisk de teste não converte Opus.
    await page.getByRole('button', { name: '+ Nova' }).click()
    const web = page.locator('form.dialog')
    await web.getByRole('textbox', { name: 'Nome' }).fill('Web 1021')
    await web.getByRole('textbox', { name: 'Ramal' }).fill('1021')
    await web.getByRole('textbox', { name: 'Domínio SIP' }).fill(HOST)
    await web.getByLabel('Senha').fill('1234')
    await web.getByRole('textbox', { name: 'WebSocket (WSS)' }).fill(process.env.PBX_WS ?? `wss://${HOST}:8089/ws`)
    await web.getByText('Auto-atender após').locator('input[type=checkbox]').check()
    await web.getByRole('button', { name: 'Salvar e registrar' }).click()
    await account('Web 1021').locator('.dot.registered').waitFor({ timeout: 15000 })
    await dial('Puro UDP', '1021')
    const toWeb = call(/2001\s*→\s*1021/)
    const atWeb = call(/1021\s*←\s*2001/)
    await toWeb.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 25000 })
    await atWeb.locator('.pill', { hasText: 'em chamada' }).waitFor({ timeout: 25000 })
    await expectAudio(toWeb, 'SIP puro ligou para um ramal WebRTC, áudio no lado do SIP puro')
    await atWeb.locator('.quality').waitFor({ timeout: 15000 })
    step('e o lado WebRTC também mede o áudio')
    await toWeb.getByRole('button', { name: 'Desligar' }).click()
    await atWeb.locator('.pill', { hasText: 'encerrada' }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(500)

    // Quem liga desiste antes de atender (CANCEL); depois, quem recebe recusa (486).
    await dial('Puro UDP', '2003')
    const ringing = page.getByRole('region', { name: /Chamada recebida de/ })
    await ringing.waitFor({ timeout: 20000 })
    await call(/2001\s*→\s*2003/)
        .getByRole('button', { name: 'Desligar' })
        .click()
    await ringing.waitFor({ state: 'detached', timeout: 10000 })
    step('desistir antes de atender cancela a chamada no outro lado')
    await page.waitForTimeout(1000)
    await dial('Puro UDP', '2003')
    await ringing.getByRole('button', { name: 'Recusar' }).click({ timeout: 20000 })
    await page
        .locator('.list')
        .getByText(/Chamada para 2003: .*(486|603|480)/)
        .first()
        .waitFor({ timeout: 15000 })
    step('recusar devolve ocupado para quem ligou')

    await account('Puro UDP').getByRole('button', { name: 'Desregistrar' }).click()
    await expectContact('2001', false)
    step('Desregistrar tira o contato do Asterisk')

    const errors = readFileSync(join(userData, 'logs', 'iris.log'), 'utf8')
        .split('\n')
        .filter((line) => / ERROR /.test(line))
    if (errors.length) throw new Error(`erros no log interno:\n${errors.join('\n')}`)
    step('nenhum erro no log interno')
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
    if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'sip-puro-falha.png') })
} finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
    // Um teste que para no meio deixa canais presos no Asterisk, e a execução seguinte falha por isso.
    if (failed) {
        try {
            execSync(`docker exec ${CONTAINER} asterisk -rx "channel request hangup all"`, { stdio: 'pipe' })
        } catch {
            // sem Docker: nada a limpar
        }
    }
}
if (failed) process.exit(1)
console.log('SIP puro OK')
