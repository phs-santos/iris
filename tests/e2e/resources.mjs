// Recursos (RNF-05): até 300 MB de RAM com 10 contas e 1 chamada; CPU ociosa abaixo de 2%.
// Mede todos os processos do app (principal, interface, GPU, rede) pelo app.getAppMetrics().
// Uso: docker compose up -d && npm run build && node tests/e2e/resources.mjs
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const WSS = process.env.PBX_WS ?? 'wss://127.0.0.1:8089/ws'
const DOMAIN = process.env.PBX_DOMAIN ?? '127.0.0.1'
const RAM_LIMIT_MB = 300
const CPU_LIMIT = 2
const userData = mkdtempSync(join(tmpdir(), 'iris-rec-'))
const importFile = join(userData, 'contas.json')
const exts = Array.from({ length: 10 }, (_, i) => String(1001 + i))
writeFileSync(
    importFile,
    JSON.stringify({
        format: 'iris/accounts',
        schemaVersion: 1,
        exportedAt: '',
        accounts: exts.map((ext, i) => ({
            id: `rec-${ext}`,
            name: `Rec ${ext}`,
            domain: DOMAIN,
            extension: ext,
            wssUrl: WSS,
            rawSipLog: false,
            autoAnswer: { enabled: i === 1, delayMs: 300 },
            password: '1234'
        }))
    })
)

const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, IRIS_USER_DATA: userData, IRIS_FAKE_MEDIA: '1' }
})
const page = await app.firstWindow()
const step = (msg) => console.log(`✓ ${msg}`)

/** Memória (MB) e CPU (%) somadas de todos os processos do app. */
const metrics = () =>
    app.evaluate(({ app }) => {
        const list = app.getAppMetrics()
        return {
            memoryMb: list.reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024,
            cpu: list.reduce((s, m) => s + m.cpu.percentCPUUsage, 0),
            pids: list.map((m) => m.pid),
            processes: list.map(
                (m) =>
                    `${m.type} ${(m.memory.workingSetSize / 1024).toFixed(0)} MB ${m.cpu.percentCPUUsage.toFixed(1)}%`
            )
        }
    })

/**
 * A soma do working set conta várias vezes as bibliotecas do Chromium que os processos compartilham.
 * No macOS, o footprint (o número do Monitor de Atividade) conta só a memória de cada processo.
 * No Linux, o PSS divide cada página compartilhada entre os processos que a usam.
 */
function footprint(pids) {
    if (process.platform === 'linux') {
        try {
            return pids.reduce((total, pid) => {
                const m = /^Pss:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))
                if (!m) throw new Error('sem Pss')
                return total + Number(m[1]) / 1024
            }, 0)
        } catch {
            return undefined
        }
    }
    if (process.platform !== 'darwin') return undefined
    const unit = { KB: 1 / 1024, MB: 1, GB: 1024 }
    let total = 0
    for (const pid of pids) {
        try {
            const out = execFileSync('footprint', [String(pid)], { encoding: 'utf8' })
            const m = /\[\d+\]:.*?Footprint:\s*([\d.]+)\s*(KB|MB|GB)/i.exec(out)
            if (!m) return undefined
            total += Number(m[1]) * unit[m[2].toUpperCase()]
        } catch {
            return undefined
        }
    }
    return total
}

/** Média de várias amostras: o primeiro getAppMetrics de cada processo mede desde o início. */
async function sample(seconds) {
    await metrics()
    const samples = []
    for (let i = 0; i < seconds; i++) {
        await page.waitForTimeout(1000)
        samples.push(await metrics())
    }
    const avg = (k) => samples.reduce((s, x) => s + x[k], 0) / samples.length
    return {
        memoryMb: avg('memoryMb'),
        cpu: avg('cpu'),
        processes: samples.at(-1).processes,
        footprintMb: footprint(samples.at(-1).pids)
    }
}

let failed = false
try {
    await page.getByText('3 contas').waitFor()
    // Sem as contas simuladas de exemplo: só as 10 do PBX.
    await page.getByRole('button', { name: 'Todas', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Desregistrar todas' }).click()
    await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, importFile)
    await page.getByRole('button', { name: 'Configurações' }).click()
    await page.getByRole('tab', { name: 'Importar e exportar' }).click()
    await page.getByRole('button', { name: 'Escolher arquivo' }).click()
    await page.getByText('10 contas importadas').waitFor()
    await page.getByRole('button', { name: 'Fechar' }).click()
    const registerAll = async () => {
        await page.getByRole('button', { name: 'Todas', exact: true }).click()
        await page.getByRole('menuitem', { name: 'Registrar todas', exact: true }).click()
    }
    await registerAll()
    const trust = page.getByRole('button', { name: 'Confiar neste host' })
    // isVisible não espera: o aviso do certificado pode aparecer um instante depois do clique.
    await trust
        .waitFor({ timeout: 8000 })
        .then(() => trust.click())
        .catch(() => undefined)
    // As 3 de exemplo também registram com "Registrar todas"; 2 delas (a terceira usa senha errada).
    // O Chromium abre os WebSockets do mesmo host um de cada vez. Com o PBX lento (Docker Desktop),
    // a última conta da fila passa dos 5 s do SIP.js e fica em erro; "Registrar todas" tenta só as que faltam.
    for (let attempt = 1; ; attempt++) {
        try {
            await page.getByText('12 registradas').waitFor({ timeout: 15000 })
            break
        } catch (error) {
            if (attempt === 3) throw error
            await registerAll()
        }
    }
    for (const name of ['Suporte 1001', 'Vendas 1002', 'Lab 2001']) {
        await page.locator('.acc', { hasText: name }).locator('.row').click()
        const off = page.getByRole('button', { name: 'Desregistrar', exact: true })
        if (await off.isVisible().catch(() => false)) await off.click()
    }
    await page.getByText('10 registradas').waitFor({ timeout: 10000 })
    step('10 contas registradas no Asterisk')

    await page.locator('.acc', { hasText: 'Rec 1001' }).locator('.row').click()
    await page.getByLabel('Número').fill('1002')
    await page.getByRole('button', { name: 'Ligar', exact: true }).click()
    await page.locator('.call:not(.ended) .pill', { hasText: 'em chamada' }).nth(1).waitFor({ timeout: 20000 })
    await page.waitForTimeout(5000)
    const inCall = await sample(20)
    const fp = (r) => (r.footprintMb ? ` · footprint ${r.footprintMb.toFixed(0)} MB` : '')
    console.log(
        `  com 10 contas e 1 chamada: working set ${inCall.memoryMb.toFixed(0)} MB${fp(inCall)} · CPU ${inCall.cpu.toFixed(1)}%`
    )
    console.log(`  processos: ${inCall.processes.join(' · ')}`)

    await page.locator('.call:not(.ended)', { hasText: '→' }).getByRole('button', { name: 'Desligar' }).click()
    await page.getByText('0 chamadas').waitFor()
    const lines = async () => Number((await page.getByText(/\d+ linhas/i).textContent()).replace(/\D/g, ''))
    const before = await lines()
    await page.waitForTimeout(10000)
    const after = await lines()
    console.log(`  log depois de desligar: ${before} → ${after} linhas em 10 s`)
    await page.getByRole('tab', { name: 'Tudo' }).click()
    await page
        .getByLabel('Todas as contas')
        .selectOption({ index: 0 })
        .catch(() => {})
    const tail = await page
        .locator('.line')
        .evaluateAll((els) => els.slice(-6).map((e) => e.textContent.trim().slice(0, 160)))
    console.log(`  últimas linhas:\n    ${tail.join('\n    ')}`)
    if (process.env.PROFILE) {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Profiler.enable')
        await cdp.send('Profiler.start')
        await page.waitForTimeout(4000)
        const { profile } = await cdp.send('Profiler.stop')
        const self = new Map()
        const dt = profile.timeDeltas
        const byId = new Map(profile.nodes.map((n) => [n.id, n]))
        profile.samples.forEach((id, i) => {
            const n = byId.get(id)
            const key = `${n.callFrame.functionName || '(anônima)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`
            self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0))
        })
        const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        console.log('  perfil (ms de CPU própria em 4 s):')
        for (const [k, v] of top) console.log(`    ${(v / 1000).toFixed(0).padStart(5)} ${k}`)
        const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize / 1048576)
        console.log(`  heap JS: ${heap?.toFixed(0)} MB`)
    }
    const idle = await sample(20)
    console.log(
        `  ocioso, 10 contas registradas: working set ${idle.memoryMb.toFixed(0)} MB${fp(idle)} · CPU ${idle.cpu.toFixed(1)}%`
    )
    console.log(`  processos: ${idle.processes.join(' · ')}`)

    const memory = inCall.footprintMb ?? inCall.memoryMb
    if (memory > RAM_LIMIT_MB) {
        failed = true
        console.error(`✗ memória ${memory.toFixed(0)} MB acima de ${RAM_LIMIT_MB} MB (RNF-05)`)
    } else step(`memória dentro do limite de ${RAM_LIMIT_MB} MB`)
    if (idle.cpu > CPU_LIMIT) {
        failed = true
        console.error(`✗ CPU ociosa ${idle.cpu.toFixed(1)}% acima de ${CPU_LIMIT}% (RNF-05)`)
    } else step(`CPU ociosa abaixo de ${CPU_LIMIT}%`)
    console.log(failed ? 'Recursos FALHOU' : 'Recursos OK')
} catch (error) {
    failed = true
    console.error(error)
} finally {
    process.exitCode = failed ? 1 : 0
    await app.close()
    rmSync(userData, { recursive: true, force: true })
}
