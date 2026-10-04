// Atualização do macOS sem assinatura da Apple (RF-35 + RNF-17, decisão do usuário em 04/10/2026).
// O Squirrel.Mac do electron-updater só instala app assinado com Developer ID. Aqui a própria Íris
// baixa o .zip do release, confere o SHA-512 publicado no latest-mac.yml, troca o app e reinicia.
// Baixado pelo app (e não pelo navegador), o arquivo não ganha a marca de quarentena, e o macOS
// não mostra o aviso "A Apple não pôde verificar…". Regras puras aqui; o Electron fica em main/mac-update.ts.

export const MAC_BUNDLE_ID = 'dev.iris.softphone'
const RELEASES = 'https://github.com/phs-santos/iris/releases/download'

export interface ReleaseFile {
    url: string
    sha512: string
    size?: number
}

/** O .zip da arquitetura deste Mac, entre os arquivos que o latest-mac.yml lista. */
export function pickMacZip(files: ReleaseFile[], arch: string): ReleaseFile | null {
    const suffix = `-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`
    return files.find((f) => f.url.endsWith(suffix)) ?? null
}

/** Endereço fixo do repositório: o nome do arquivo vem do release, mas não pode apontar para outro lugar. */
export function macZipUrl(version: string, file: ReleaseFile): string {
    if (!/^[\w.-]+$/.test(version) || !/^[\w.-]+\.zip$/.test(file.url))
        throw new Error(`Nome de arquivo inesperado no release: ${file.url}`)
    return `${RELEASES}/v${version}/${file.url}`
}

/** O app extraído tem que ser a Íris, na versão anunciada. */
export function checkExtractedApp(found: { bundleId: string; version: string }, expectedVersion: string): void {
    if (found.bundleId !== MAC_BUNDLE_ID)
        throw new Error(`O arquivo baixado não é a Íris (${found.bundleId || 'sem identificador'})`)
    if (found.version !== expectedVersion)
        throw new Error(`O arquivo baixado é a versão ${found.version}, e não a ${expectedVersion}`)
}

/**
 * Roda depois que a Íris fecha: troca o app e abre de novo. Se a troca falhar no meio, devolve o app
 * antigo para o lugar, para a pessoa nunca ficar sem Íris. Argumentos: pid, app atual, app novo.
 */
export const SWAP_SCRIPT = `#!/bin/bash
pid="$1"; atual="$2"; novo="$3"
for _ in $(seq 1 150); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
antigo="$atual.antigo"
rm -rf "$antigo"
if mv "$atual" "$antigo" && mv "$novo" "$atual"; then
    rm -rf "$antigo"
else
    [ -d "$atual" ] || mv "$antigo" "$atual"
fi
open "$atual"
`
