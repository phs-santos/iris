// Aplica os patches de patches/*.patch em node_modules depois do npm install.
// Substitui o patch-package, que puxa o braces (GHSA-vfj7-8cjw-p6xm, sem versão corrigida).
// Cada hunk é aplicado por texto: o trecho antigo (contexto + linhas "-") tem que aparecer
// uma única vez no arquivo e vira o trecho novo (contexto + linhas "+"). Rodar de novo não muda nada.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const patchesDir = join(root, 'patches')

function parse(patch) {
    const files = []
    let file = null
    let hunk = null
    // Aceita CRLF: no Windows o git pode converter o fim de linha do .patch.
    for (const line of patch.split(/\r?\n/)) {
        if (line.startsWith('+++ ')) {
            file = { path: line.slice(4).replace(/^b\//, ''), hunks: [] }
            files.push(file)
        } else if (line.startsWith('@@')) {
            hunk = { old: [], new: [] }
            file.hunks.push(hunk)
        } else if (hunk && !line.startsWith('--- ') && !line.startsWith('diff ') && !line.startsWith('index ')) {
            if (line.startsWith('-')) hunk.old.push(line.slice(1))
            else if (line.startsWith('+')) hunk.new.push(line.slice(1))
            else if (line.startsWith(' ')) {
                hunk.old.push(line.slice(1))
                hunk.new.push(line.slice(1))
            }
        }
    }
    return files
}

function count(text, part) {
    return text.split(part).length - 1
}

let failed = false
for (const name of readdirSync(patchesDir)
    .filter((f) => f.endsWith('.patch'))
    .sort()) {
    for (const file of parse(readFileSync(join(patchesDir, name), 'utf8'))) {
        const target = join(root, file.path)
        let text = readFileSync(target, 'utf8')
        for (const hunk of file.hunks) {
            const oldText = hunk.old.join('\n')
            const newText = hunk.new.join('\n')
            if (count(text, newText) === 1 && count(text, oldText) === 0) continue
            if (count(text, oldText) !== 1) {
                console.error(`✗ ${name}: trecho não encontrado (ou repetido) em ${file.path}`)
                failed = true
                continue
            }
            text = text.replace(oldText, () => newText)
        }
        writeFileSync(target, text)
    }
    console.log(`${failed ? '✗' : '✔'} ${name}`)
}
if (failed) process.exit(1)
