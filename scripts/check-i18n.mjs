// Confere o critério do RNF-13: nenhum texto fixo no código dos componentes. Procura, nos arquivos
// .vue, texto solto no modelo, atributos de texto (title, placeholder…) e frases entre aspas, no
// modelo e no script. O que for exceção de verdade leva `i18n-ok` num comentário da mesma linha.
// Uso: node scripts/check-i18n.mjs
import { parse } from '@vue/compiler-sfc'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/renderer/src'
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label'])
const LETTERS = /[A-Za-zÀ-ÿ]/
/** Parece frase para gente ler: tem acento, espaço entre palavras ou começa com maiúscula. */
const looksLikeText = (s) => /[À-ÿ]/.test(s) || /[A-Za-z]{2,} [A-Za-z]/.test(s) || /^[A-Z][a-z]{2,}/.test(s.trim())

const files = []
const walk = (dir) => {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (path.endsWith('.vue')) files.push(path)
    }
}
walk(ROOT)

const problems = []
/** Nomes de teclas, que aparecem no código e não na tela. */
const KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Escape', 'Home', 'End', 'Tab', 'Enter'])

/** Frases entre aspas num trecho de código, fora os nomes passados a t(), os imports e os comentários. */
function literals(code, file, lineOf) {
    const blank = (m) => m.replace(/[^\n]/g, ' ')
    const clean = code
        .replace(/^.*i18n-ok.*$/gm, blank)
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(/\$?\bt\(\s*(['"`])[\w.]+\1/g, blank)
        .replace(/^\s*import .*$/gm, blank)
        .replace(/(^|\s)\/\/.*$/gm, blank)
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
    for (let m = re.exec(clean); m; m = re.exec(clean)) {
        const body = m[1] ?? m[2] ?? m[3] ?? ''
        if (KEYS.has(body) || !looksLikeText(body.replace(/\$\{[^}]*\}/g, ' '))) continue
        problems.push(`${file}:${lineOf(m.index)}: ${m[0].slice(0, 70)}`)
    }
}

for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const lineNumber = (offset) => source.slice(0, offset).split('\n').length
    const { descriptor } = parse(source)

    const visit = (node) => {
        for (const prop of node.props ?? []) {
            if (prop.type === 6 && ATTRS.has(prop.name) && prop.value && LETTERS.test(prop.value.content))
                problems.push(`${file}:${lineNumber(prop.loc.start.offset)}: ${prop.name}="${prop.value.content}"`)
            // Diretivas (:title, v-if, @click…): frases entre aspas dentro da expressão.
            if (prop.type === 7 && prop.exp?.loc) {
                const start = prop.exp.loc.start.offset
                literals(prop.exp.loc.source, file, (i) => lineNumber(start + i))
            }
        }
        for (const child of node.children ?? []) {
            if (child.type === 2 && LETTERS.test(child.content))
                problems.push(`${file}:${lineNumber(child.loc.start.offset)}: ${child.content.trim().slice(0, 70)}`)
            else if (child.type === 5) {
                const start = child.content.loc.start.offset
                literals(child.content.loc.source, file, (i) => lineNumber(start + i))
            } else if (child.type === 1) visit(child)
        }
    }
    if (descriptor.template?.ast) visit(descriptor.template.ast)

    const script = descriptor.scriptSetup ?? descriptor.script
    if (script) {
        const start = script.loc.start.offset
        literals(script.content, file, (i) => lineNumber(start + i))
    }
}

if (problems.length) {
    console.error(`Texto fixo em componentes (RNF-13): ${problems.length}`)
    for (const line of problems) console.error(`  ${line}`)
    process.exit(1)
}
console.log(`Tradução OK: ${files.length} componentes sem texto fixo`)
