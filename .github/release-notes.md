## Baixar

Baixe só o arquivo do seu sistema:

| Sistema | Arquivo |
| --- | --- |
| Windows | [Iris-Setup-VERSION.exe](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-Setup-VERSION.exe) |
| macOS com chip Apple (M1 ou mais novo) | [Iris-VERSION-arm64.dmg](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION-arm64.dmg) |
| macOS (Intel) | [Iris-VERSION-x64.dmg](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION-x64.dmg) |
| Linux (Debian, Ubuntu, Mint) | [iris_VERSION_amd64.deb](https://github.com/phs-santos/iris/releases/download/vVERSION/iris_VERSION_amd64.deb) |
| Linux (outras distribuições) | [Iris-VERSION.AppImage](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION.AppImage) |

No Mac, veja o chip em **menu Apple → Sobre Este Mac**: "Apple M…" usa o `arm64`; "Intel" usa o `x64`.

Os outros arquivos da lista abaixo não são para baixar à mão:

- **Source code (zip / tar.gz):** é o código do projeto, que o GitHub anexa sozinho. Não é o app.
- **`.zip` do macOS, `.blockmap` e `.yml`:** são usados pela atualização automática.

## Antes de instalar

Os instaladores ainda não são assinados, então o sistema avisa na primeira vez:

- **Windows:** no aviso do SmartScreen, clique em **Mais informações → Executar assim mesmo**. Se aparecer "O controle inteligente de aplicativos bloqueou um aplicativo", não há botão para liberar: esse recurso do Windows 11 só deixa rodar instalador assinado. Enquanto a Íris não for assinada, ela não instala nessas máquinas, a não ser que o Controle Inteligente de Aplicativos seja desligado em **Segurança do Windows → Controle de aplicativos e do navegador** (o Windows não deixa religar depois sem reinstalar o sistema).
- **macOS:** arraste a Íris para Aplicativos, abra uma vez e, em **Ajustes do Sistema → Privacidade e Segurança**, clique em **Abrir Mesmo Assim**. Se o macOS disser que o app está danificado, rode `xattr -dr com.apple.quarantine /Applications/Iris.app`.
- **macOS, senha das Chaves:** a Íris guarda as senhas das contas nas Chaves do sistema. Se aparecer o pedido, digite a senha de login do Mac e escolha **Permitir Sempre**.
- **Linux, `.deb`:** instale com `sudo apt install ./iris_VERSION_amd64.deb`. Para atualizar, baixe e instale o `.deb` da versão nova.
- **Linux, AppImage:** dê permissão de execução (`chmod +x Iris-VERSION.AppImage`) e abra. O AppImage se atualiza sozinho.

No primeiro uso o app cria três contas no PBX simulado, então dá para explorar sem servidor.
