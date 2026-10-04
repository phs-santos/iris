#!/bin/bash
# Instala ou atualiza a Íris no macOS, sem o aviso "A Apple não pôde verificar…".
#
#   curl -fsSL https://raw.githubusercontent.com/phs-santos/iris/main/scripts/install-macos.sh | bash
#
# O aviso aparece porque o navegador marca o arquivo baixado e o app não tem assinatura da Apple
# (RNF-17, decisão do usuário em 04/10/2026: sem conta paga). Baixado pelo curl, o arquivo não é
# marcado. A garantia passa a ser outra: o .zip vem do release oficial no GitHub, por HTTPS, e o
# SHA-512 tem que bater com o latest-mac.yml do mesmo release, o arquivo que a atualização usa.
#
# IRIS_DESTINO troca a pasta de instalação (padrão: /Applications, ou ~/Applications sem permissão).

set -euo pipefail

REPO="phs-santos/iris"
BASE="https://github.com/$REPO/releases/latest/download"

erro() {
    echo "Erro: $*" >&2
    exit 1
}

[ "$(uname -s)" = "Darwin" ] || erro "este instalador é só para macOS. Os outros sistemas estão em https://github.com/$REPO/releases/latest"

# Chip Apple, inclusive quando o Terminal roda pelo Rosetta.
if [ "$(uname -m)" = "arm64" ] || [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    arch="arm64"
else
    arch="x64"
fi

if pgrep -xq Iris; then
    erro "a Íris está aberta. Feche pelo ícone da barra de menus (Sair) e rode o comando de novo."
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Procurando a versão mais recente…"
curl -fsSL "$BASE/latest-mac.yml" -o "$tmp/latest-mac.yml" || erro "não deu para falar com o GitHub. Confira a internet."
versao="$(sed -n 's/^version: *//p' "$tmp/latest-mac.yml" | tr -d "'\"")"
arquivo="Iris-$versao-$arch.zip"
esperado="$(grep -A1 "url: $arquivo\$" "$tmp/latest-mac.yml" | sed -n 's/^ *sha512: *//p')"
[ -n "$versao" ] && [ -n "$esperado" ] || erro "o release não tem o arquivo $arquivo."

echo "Baixando a Íris $versao ($arch)…"
curl -fL --progress-bar "$BASE/$arquivo" -o "$tmp/$arquivo" || erro "o download falhou."

echo "Conferindo o arquivo…"
obtido="$(shasum -a 512 "$tmp/$arquivo" | cut -d' ' -f1 | xxd -r -p | base64)"
[ "$obtido" = "$esperado" ] || erro "o arquivo baixado não confere com o release (SHA-512 diferente). Nada foi instalado."

ditto -x -k "$tmp/$arquivo" "$tmp/app"
[ -d "$tmp/app/Iris.app" ] || erro "o arquivo não tem o Iris.app."

destino="${IRIS_DESTINO:-/Applications}"
if [ -z "${IRIS_DESTINO:-}" ] && [ ! -w "$destino" ]; then
    destino="$HOME/Applications"
fi
mkdir -p "$destino"

# Troca o app inteiro; contas, senhas e preferências ficam na pasta de dados e continuam.
rm -rf "$destino/Iris.app"
mv "$tmp/app/Iris.app" "$destino/Iris.app"

echo "Pronto: Íris $versao instalada em $destino/Iris.app"
if [ -z "${IRIS_NAO_ABRIR:-}" ]; then
    open "$destino/Iris.app"
fi
