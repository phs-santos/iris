## O que mudou na 2.0.1

- **Saiu o guia de uso de dentro do app** (a janela, a tecla F1 e o botão nos Ajustes). A tela ficou simples o bastante para dispensar.
- A nota do PBX simulado no cadastro de conta cita os números que existem (8000, 486 e 408).

Vindo da 1.x, leia também o que mudou na 2.0, logo abaixo.

## O que mudou na 2.0

A Íris ficou mais simples: uma tela só, clara, para ligar e depurar.

- **Tela nova:** barra de ícones à esquerda, a conta atual no topo com um seletor agrupado por servidor e filtro por etiquetas, discador com sugestão de contatos, coluna de chamadas de todas as contas e os detalhes da conta quando não há chamada.
- **Depuração numa gaveta** à direita, com as abas SIP, Fluxo, Log e Saúde, filtro de conta e tamanho ajustável.
- **Cadastro de conta mais curto:** nome, etiquetas, servidor, ramal e senha; o resto em "Avançado". O servidor tem janela própria. UDP é o padrão; WebSocket virou opção avançada.
- **Etiquetas** reaproveitáveis entre contas e **ordem dos codecs** em Ajustes → Áudio (SIP puro).
- **Contatos por conta**, como sugestão ao digitar no discador.
- **Tema claro** passou a ser o padrão.
- **Saíram:** histórico, cenários e linha de comando, SDR, mensagens, carga, ajuda da IA, vídeo, PCAP, requisição manual, BLF/MWI, modo Telefone, modos escondidos, paleta de comandos, inglês, atalhos globais e links `tel:`.

> **Atenção: os dados antigos são apagados.** Ao abrir a 2.0 pela primeira vez, contas, servidores, contatos, preferências e senhas das versões anteriores são descartados. Cadastre as contas de novo. Exportações da 1.x não podem ser importadas.

## Baixar

Baixe só o arquivo do seu sistema:

| Sistema | Arquivo |
| --- | --- |
| Windows | [Iris-Setup-VERSION.exe](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-Setup-VERSION.exe) |
| macOS com chip Apple (M1 ou mais novo) | [Iris-VERSION-arm64.dmg](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION-arm64.dmg) |
| macOS (Intel) | [Iris-VERSION-x64.dmg](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION-x64.dmg) |
| Linux (Debian, Ubuntu, Mint) | [iris_VERSION_amd64.deb](https://github.com/phs-santos/iris/releases/download/vVERSION/iris_VERSION_amd64.deb) |
| Linux (outras distribuições) | [Iris-VERSION.AppImage](https://github.com/phs-santos/iris/releases/download/vVERSION/Iris-VERSION.AppImage) |

**No Mac, o jeito mais fácil é pelo Terminal**, que não mostra o aviso da Apple. O comando escolhe a versão certa para o seu chip:

```bash
curl -fsSL https://raw.githubusercontent.com/phs-santos/iris/main/scripts/install-macos.sh | bash
```

No Mac, se for usar o `.dmg`, veja o chip em **menu Apple → Sobre Este Mac**: "Apple M…" usa o `arm64`; "Intel" usa o `x64`.

Os outros arquivos da lista abaixo não são para baixar à mão:

- **Source code (zip / tar.gz):** é o código do projeto, que o GitHub anexa sozinho. Não é o app.
- **`.zip` do macOS, `.blockmap` e `.yml`:** são usados pela atualização automática.

## Antes de instalar

Os instaladores ainda não são assinados, então o sistema avisa na primeira vez:

- **Windows:** no aviso do SmartScreen, clique em **Mais informações → Executar assim mesmo**. Se aparecer "O controle inteligente de aplicativos bloqueou um aplicativo", não há botão para liberar: esse recurso do Windows 11 só deixa rodar instalador assinado. Enquanto a Íris não for assinada, ela não instala nessas máquinas, a não ser que o Controle Inteligente de Aplicativos seja desligado em **Segurança do Windows → Controle de aplicativos e do navegador** (o Windows não deixa religar depois sem reinstalar o sistema).
- **macOS, pelo `.dmg`:** arraste a Íris para Aplicativos, abra uma vez e, em **Ajustes do Sistema → Privacidade e Segurança**, clique em **Abrir Mesmo Assim**. Pelo comando do Terminal acima, esse aviso não aparece.
- **Linux, `.deb`:** instale com `sudo apt install ./iris_VERSION_amd64.deb`. Para atualizar, baixe e instale o `.deb` da versão nova.
- **Linux, AppImage:** dê permissão de execução (`chmod +x Iris-VERSION.AppImage`) e abra. O AppImage se atualiza sozinho.

No primeiro uso o app cria três contas no PBX simulado, então dá para explorar sem servidor.
