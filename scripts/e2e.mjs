// Testes de tela (Playwright): gera o app uma vez e roda os testes pedidos, um depois do outro.
// Uso: npm run test:e2e                  (os que rodam sem PBX)
//      npm run test:e2e -- chamada a11y  (só esses; com PBX_WS apontando para o Asterisk, também sip-puro,
//                                         asterisk e reconexao)
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const PADRAO = ['smoke', 'a11y', 'senhas', 'arquivos', 'notificacoes', 'contatos', 'toques', 'chamada']
const nomes = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO

for (const nome of nomes) {
    if (!existsSync(join(root, 'tests', 'e2e', `${nome}.mjs`))) {
        console.error(`✗ não existe tests/e2e/${nome}.mjs`)
        process.exit(1)
    }
}
const env = { ...process.env }
// O terminal do VSCode exporta esta variável, e com ela o Electron não abre a janela.
delete env.ELECTRON_RUN_AS_NODE
execSync('npx electron-vite build', { cwd: root, stdio: 'inherit', env })
const falhas = []
for (const nome of nomes) {
    console.log(`\n▶ ${nome}`)
    try {
        execSync(`node tests/e2e/${nome}.mjs`, { cwd: root, stdio: 'inherit', env })
    } catch {
        falhas.push(nome)
    }
}
if (falhas.length) {
    console.error(`\n✗ falharam: ${falhas.join(', ')}`)
    process.exit(1)
}
console.log(`\n✓ ${nomes.length} teste(s) de tela passaram`)
