## Baixar

Baixe só o arquivo do seu sistema:

| Sistema | Arquivo |
| --- | --- |
| Windows | [Iris-Setup-VERSION.exe](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-Setup-VERSION.exe) |
| macOS (Apple Silicon: M1 ou mais novo) | [Iris-VERSION-arm64.dmg](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION-arm64.dmg) |
| macOS (Intel) | [Iris-VERSION.dmg](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION.dmg) |
| Linux | [Iris-VERSION.AppImage](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION.AppImage) |

Os outros arquivos da lista abaixo não são para baixar à mão:

- **Source code (zip / tar.gz):** é o código do projeto, que o GitHub anexa sozinho. Não é o app.
- **`.zip` do macOS, `.blockmap` e `.yml`:** são usados pela atualização automática.

## Antes de instalar

Os instaladores ainda não são assinados, então o sistema avisa na primeira vez:

- **Windows:** no aviso do SmartScreen, clique em **Mais informações → Executar assim mesmo**.
- **macOS:** arraste a Íris para Aplicativos, abra uma vez e, em **Ajustes do Sistema → Privacidade e Segurança**, clique em **Abrir Mesmo Assim**. Se o macOS disser que o app está danificado, rode `xattr -dr com.apple.quarantine /Applications/Iris.app`.
- **macOS, senha das Chaves:** a Íris guarda as senhas das contas nas Chaves do sistema. Se aparecer o pedido, digite a senha de login do Mac e escolha **Permitir Sempre**.
- **Linux:** dê permissão de execução (`chmod +x Iris-VERSION.AppImage`) e abra.

No primeiro uso o app cria três contas no PBX simulado, então dá para explorar sem servidor.
