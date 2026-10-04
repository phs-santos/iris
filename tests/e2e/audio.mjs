// Verificação de áudio nos cenários (RF-41), pela linha de comando e contra o Asterisk: um cenário
// toca um tom no eco e espera o áudio voltar; outro liga para um ramal mudo, onde "esperar silêncio"
// passa e "esperar áudio" falha. As contas são de SIP puro, as únicas que tocam áudio na chamada.
// Uso: docker compose up -d && npm run build && node tests/e2e/audio.mjs
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = process.env.PBX_DOMAIN ?? '127.0.0.1'
const tmp = mkdtempSync(join(tmpdir(), 'iris-audio-'))
const step = (msg) => console.log(`✓ ${msg}`)

/** WAV de 1 s com um tom de 800 Hz, para o passo "Tocar arquivo". */
function writeWav(path) {
    const samples = 8000
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
        data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 800 * i) / 8000) * 12000), 44 + i * 2)
    writeFileSync(path, data)
}

const wav = join(tmp, 'tom.wav')
writeWav(wav)
const contas = join(tmp, 'contas.json')
const cenarios = join(tmp, 'cenarios.json')
writeFileSync(
    contas,
    JSON.stringify({
        format: 'iris/accounts',
        schemaVersion: 1,
        exportedAt: '',
        accounts: [
            { id: 'puro', name: 'Puro 2001', domain: HOST, extension: '2001', transport: 'udp', password: '1234' }
        ]
    })
)
const call = (to, steps) => [
    { type: 'register' },
    { type: 'dial', to, call: 'c1' },
    { type: 'waitState', call: 'c1', state: 'established', timeoutMs: 10000 },
    ...steps,
    { type: 'hangup', call: 'c1' }
]
writeFileSync(
    cenarios,
    JSON.stringify([
        {
            id: 'eco',
            name: 'Eco com tom',
            accountId: 'puro',
            steps: call('600', [
                { type: 'playTone', call: 'c1', hz: 440, ms: 1000 },
                { type: 'waitAudio', call: 'c1', timeoutMs: 3000 },
                { type: 'playFile', call: 'c1', path: wav },
                { type: 'waitAudio', call: 'c1', timeoutMs: 3000 }
            ])
        },
        {
            id: 'mudo',
            name: 'Ramal mudo',
            accountId: 'puro',
            steps: call('601', [{ type: 'waitSilence', call: 'c1', timeoutMs: 4000 }])
        },
        {
            id: 'mudo-falha',
            name: 'Ramal mudo esperando áudio',
            accountId: 'puro',
            steps: call('601', [{ type: 'waitAudio', call: 'c1', timeoutMs: 2000 }])
        }
    ])
)

function iris(...args) {
    const extra = process.getuid?.() === 0 ? ['--no-sandbox'] : []
    const r = spawnSync(electron, ['.', ...extra, '--contas', contas, '--cenarios', cenarios, ...args], {
        encoding: 'utf8',
        timeout: 5 * 60_000
    })
    return { code: r.status, text: r.stdout + r.stderr }
}
function expect(result, code, pattern, what) {
    if (result.code !== code || !pattern.test(result.text)) {
        console.error(result.text)
        throw new Error(`${what}: esperava código ${code} e ${pattern}, veio ${result.code}`)
    }
    step(what)
}

let failed = false
try {
    const eco = iris('--cenario', 'Eco com tom')
    expect(
        eco,
        0,
        /✓ 4\. Tocar tom de 440 Hz por 1000 ms em c1 · \d+ ms · 1000 ms de áudio/,
        'toca um tom de 1 s no eco'
    )
    expect(eco, 0, /✓ 5\. Esperar áudio em c1 · \d+ ms · -?\d+ dBFS/, 'o tom volta pelo eco e o passo mostra o volume')
    expect(
        eco,
        0,
        /✓ 6\. Tocar tom\.wav em c1 · \d+ ms · 1000 ms de áudio[\s\S]*✓ 7\. Esperar áudio/,
        'toca um arquivo WAV e ouve de volta'
    )

    expect(
        iris('--cenario', 'Ramal mudo'),
        0,
        /✓ 4\. Esperar silêncio em c1 · \d+ ms · -96 dBFS/,
        'num ramal mudo, esperar silêncio passa'
    )
    expect(
        iris('--cenario', 'Ramal mudo esperando áudio'),
        1,
        /✗ 4\. Esperar áudio em c1 · \d+ ms · Sem áudio em 2 s \(volume: -96 dBFS\)/,
        'chamada muda: esperar áudio falha, com código de saída 1'
    )
} catch (error) {
    failed = true
    console.error(`✗ ${error.message}`)
} finally {
    rmSync(tmp, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log('Áudio dos cenários OK')
