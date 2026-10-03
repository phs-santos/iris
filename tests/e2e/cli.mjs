// Linha de comando (RF-31): chama o app com --cenario e confere a saída e o código de saída.
// Simulado por padrão; com PBX_WS também roda a URA 20 vezes no Asterisk de teste e confere no PBX.
// Uso: npm run build && node tests/e2e/cli.mjs   (Linux sem tela: xvfb-run -a node tests/e2e/cli.mjs)
import electron from 'electron'
import { spawnSync, execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'iris-cli-test-'))
const fixtures = join(import.meta.dirname, '..', 'fixtures')
const sim = ['--contas', join(fixtures, 'cli-contas.json'), '--cenarios', join(fixtures, 'cli-cenarios.json')]
const step = (msg) => console.log(`✓ ${msg}`)

function iris(...args) {
    const extra = process.getuid?.() === 0 ? ['--no-sandbox'] : []
    const r = spawnSync(electron, ['.', ...extra, ...args], { encoding: 'utf8', timeout: 10 * 60_000 })
    return { code: r.status, out: r.stdout, err: r.stderr }
}

function expect(result, code, pattern, what) {
    if (result.code !== code || (pattern && !pattern.test(result.out + result.err))) {
        console.error(result.out, result.err)
        throw new Error(`${what}: esperava código ${code}${pattern ? ` e ${pattern}` : ''}, veio ${result.code}`)
    }
    step(`${what} (código ${code})`)
}

let failed = false
try {
    expect(iris('--ajuda'), 0, /Uso: iris --cenario/, 'ajuda')
    expect(iris('--vezes', '3'), 2, /Diga qual cenário/, 'sem cenário é erro de uso')
    expect(
        iris(...sim, '--cenario', 'Não existe'),
        2,
        /não encontrado\. Disponíveis: "URA 8000"/,
        'cenário inexistente'
    )

    const report = join(tmp, 'relatorio.json')
    const ok = iris(...sim, '--cenario', 'URA 8000', '--cenario', 'Entre contas', '--vezes', '2', '--relatorio', report)
    expect(ok, 0, /Resultado: passou/, 'URA e chamada entre contas passam')
    if (!/✓ 3\. Aguardar c1 em chamada · \d+ ms/.test(ok.out)) throw new Error('faltou o resultado de cada passo')
    const json = JSON.parse(readFileSync(report, 'utf8'))
    if (json.length !== 2 || json[0].runs !== 2 || json[0].successRate !== 100) throw new Error('relatório incompleto')
    step('cada passo aparece com tempo e o relatório .json tem os dois cenários')

    const busy = iris(...sim, '--cenario', 'Ocupado')
    expect(busy, 1, /✗ 3\. Aguardar c1 em chamada · \d+ ms · .*486 Busy Here/, 'passo que falha sai com código 1')
    expect(iris(...sim, '--todos'), 1, /Cenário "Ocupado"/, '--todos roda os três e falha por causa do Ocupado')

    if (process.env.PBX_WS) {
        // DTMF por SIP INFO: no Docker Desktop o RTP mapeado perde pacotes de vez em quando.
        writeFileSync(
            join(tmp, 'contas.json'),
            JSON.stringify({
                format: 'iris/accounts',
                schemaVersion: 1,
                exportedAt: '',
                accounts: [
                    {
                        id: 'pbx-1001',
                        name: 'PBX 1001',
                        domain: process.env.PBX_DOMAIN ?? '127.0.0.1',
                        extension: '1001',
                        wssUrl: process.env.PBX_WS,
                        dtmfMode: 'sip-info',
                        password: '1234'
                    }
                ]
            })
        )
        writeFileSync(
            join(tmp, 'ura.json'),
            JSON.stringify({
                name: 'URA Asterisk',
                accountId: 'PBX 1001',
                steps: [
                    { type: 'register' },
                    { type: 'dial', to: '8000', call: 'c1' },
                    { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 10000 },
                    { type: 'wait', ms: 2000 },
                    { type: 'dtmf', call: 'c1', digits: '1234' },
                    // A URA desliga sozinha depois de ler os 4 dígitos.
                    { type: 'waitState', call: 'c1', state: 'ended', timeoutMs: 10000 }
                ]
            })
        )
        const since = new Date().toISOString()
        const pbx = iris(
            ...['--contas', join(tmp, 'contas.json'), '--cenarios', join(tmp, 'ura.json')],
            ...['--cenario', 'URA Asterisk', '--vezes', '20', '--confiar-host', '127.0.0.1', '--midia-falsa']
        )
        expect(pbx, 0, /resumo: 20\/20 passaram \(100%\)/, 'URA do Asterisk 20 vezes pela linha de comando')
        try {
            const logs = execSync(`docker compose logs --since ${since} asterisk`, { encoding: 'utf8' })
            const got = logs.split('\n').filter((l) => l.includes('NOTICE') && l.includes('URA recebeu 1234')).length
            if (got < 20) throw new Error(`O Asterisk só confirmou ${got} de 20`)
            step('Asterisk confirmou: a URA recebeu 1234 nas 20 execuções')
        } catch (error) {
            if (/só confirmou/.test(error.message)) throw error
            console.log('  (docker indisponível; conferência no Asterisk pulada)')
        }
    }
    console.log('Linha de comando OK')
} catch (error) {
    failed = true
    console.error(error.message)
} finally {
    rmSync(tmp, { recursive: true, force: true })
    process.exitCode = failed ? 1 : 0
}
