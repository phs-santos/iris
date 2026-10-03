// Verificação de licenças (RNF-20): percorre o que vai dentro do app (o Electron e as bibliotecas
// empacotadas na interface, com todas as dependências) e falha se alguma licença não estiver na lista.
// Uso: node scripts/check-licenses.mjs [--lista]
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = join(import.meta.dirname, '..')
/** Pacotes que entram no app instalado; o resto do package.json é ferramenta de desenvolvimento. */
const SHIPPED = ['electron', 'electron-updater', 'vue', 'pinia', 'easy-sipjs']
const ALLOWED = new Set([
    'MIT',
    'ISC',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'Apache-2.0',
    '0BSD',
    'CC0-1.0',
    'Unlicense',
    'BlueOak-1.0.0',
    'Python-2.0',
    'CC-BY-4.0'
])

/** Acha a pasta do pacote como o Node acharia, subindo a partir de quem depende dele. */
function resolve(name, from) {
    let dir = from
    for (;;) {
        const candidate = join(dir, 'node_modules', name, 'package.json')
        if (existsSync(candidate)) return candidate
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

function licenseOf(pkg) {
    const l = pkg.license ?? pkg.licenses
    if (typeof l === 'string') return l
    if (Array.isArray(l)) return l.map((x) => x.type ?? x).join(' OR ')
    if (l && typeof l === 'object') return l.type
    return 'SEM LICENÇA'
}

/** Expressão SPDX simples: OR passa se uma opção passa; AND só se todas passam. */
function allowed(expr) {
    const clean = expr.replace(/[()]/g, '').trim()
    if (/ OR /i.test(clean)) return clean.split(/ OR /i).some(allowed)
    if (/ AND /i.test(clean)) return clean.split(/ AND /i).every(allowed)
    return ALLOWED.has(clean)
}

const seen = new Map()
function visit(name, from) {
    const file = resolve(name, from)
    if (!file) return // dependência opcional ausente nesta plataforma
    if (seen.has(file)) return
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    seen.set(file, { name: pkg.name, version: pkg.version, license: licenseOf(pkg) })
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dirname(file))
}
for (const name of SHIPPED) visit(name, root)

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
const bad = list.filter((p) => !allowed(p.license))
if (process.argv.includes('--lista')) for (const p of list) console.log(`${p.name}@${p.version}  ${p.license}`)
console.log(`${list.length} pacotes empacotados verificados`)
if (bad.length) {
    console.error('Licenças fora da lista permitida:')
    for (const p of bad) console.error(`  ${p.name}@${p.version}: ${p.license}`)
    process.exit(1)
}
console.log('Licenças ok')
