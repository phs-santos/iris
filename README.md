# Íris

Na mitologia grega, Íris é a mensageira dos deuses, que leva recados entre o céu e a terra pelo arco-íris. Esta Íris leva chamadas entre várias contas e vários PBX ao mesmo tempo.

Softphone desktop para testar telefonia: registra várias contas de vários PBX ao mesmo tempo, liga entre elas e mostra o SIP de cada uma na mesma janela. Feito com Electron, Vue 3 e [easy-sipjs](https://www.npmjs.com/package/easy-sipjs).

A especificação completa (requisitos, arquitetura e plano de entrega) está em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md), e o conceito visual em [docs/CONCEITO.html](docs/CONCEITO.html). Os dois usam o nome antigo do projeto, SIP Bench.

## Estado atual

Marcos **M0 (fundação)**, **M1 (MVP)**, **M2 (diagnóstico e transferência)** e **M3 (cenários)** concluídos:

| Requisito | O que já funciona |
| --- | --- |
| RF-01, 02, 03, 04 | Cadastro de contas, agrupamento por PBX, registrar uma ou todas, estado com código SIP do erro |
| RF-05, 06 | Testar conexão antes de salvar; registrar ao abrir o app |
| RF-07 | Importar e exportar contas em JSON, sem senhas por padrão |
| RF-08 | Reconexão e renovação de registro (do easy-sipjs) |
| RF-09 a RF-14 | Discar, receber, auto-atender, várias chamadas, mudo, espera, DTMF com sequência e pausas |
| RF-15, 16, 17, 18 | Transferência cega e assistida (consulta, concluir ou voltar) com progresso; cabeçalhos SIP extras no INVITE |
| RF-19 | Escolha de microfone e alto-falante, com medidor e som de teste, aplicada também às chamadas em andamento |
| RF-21, 22, 23 | Log por conta com filtros, aba de SIP bruto sem senhas, copiar e salvar .txt/.json |
| Fluxo SIP | Diagrama de escada de cada chamada a partir do SIP bruto, com a mensagem completa ao clicar e exportação em .html |
| RF-24, 25, 26 | Saúde da conta, diagnóstico de microfone e TURN, qualidade da chamada |
| RF-28, 29, 30 | Cenários: editor de passos (registrar, discar, atender, esperar, aguardar estado, DTMF, transferir, desligar, verificar), resultado de cada passo com tempo, repetição N vezes com relatório .txt/.json |
| RF-31 | Cenários pela linha de comando, sem janela: resultado de cada passo no terminal, relatório e código de saída 1 quando algum passo falha |
| RF-32, 33, 37 | Modo simulado, ícone na bandeja, aceite de certificado autoassinado por host |
| RF-38 | Ajuda de IA (OpenRouter, com a sua chave) para explicar o log, uma chamada ou uma falha de registro, com prévia do que é enviado e máscara de dados ligada por padrão |
| RF-35 | Atualização automática pelo GitHub Releases, com canais estável e beta: procura sozinha, baixa só quando você pede e aplica ao reiniciar. Ainda falta o teste com um release publicado |

Recursos (RNF-05): a CPU ociosa com 10 contas registradas fica em 0,1%, abaixo do limite de 2%. A memória com 10 contas e 1 chamada ficou entre 331 e 389 MB no macOS com tela retina e em 350 MB no Linux do CI, acima do limite de 300 MB; é uma pendência conhecida.

## Instalar

Baixe o instalador da [página de releases](https://github.com/phs-santos/iris/releases/latest). Pegue só o arquivo do seu sistema; o "Source code (zip)" que aparece na lista é o código do projeto, não o app.

| Sistema | Arquivo |
| --- | --- |
| Windows | `Iris-Setup-<versão>.exe` |
| macOS com chip Apple (M1 ou mais novo) | `Iris-<versão>-arm64.dmg` |
| macOS (Intel) | `Iris-<versão>-x64.dmg` |
| Linux (Debian, Ubuntu, Mint) | `iris_<versão>_amd64.deb` (instale com `sudo apt install ./iris_<versão>_amd64.deb`) |
| Linux (outras distribuições) | `Iris-<versão>.AppImage` (dê permissão de execução: `chmod +x`) |

Os instaladores ainda não são assinados (RNF-17), então o sistema avisa na primeira vez:

- **Windows:** no aviso do SmartScreen, clique em **Mais informações → Executar assim mesmo**. Se aparecer "O controle inteligente de aplicativos bloqueou um aplicativo", não há botão para liberar: esse recurso do Windows 11 só deixa rodar instalador assinado. Enquanto a Íris não for assinada, ela não instala nessas máquinas, a não ser que o Controle Inteligente de Aplicativos seja desligado em **Segurança do Windows → Controle de aplicativos e do navegador** (o Windows não deixa religar depois sem reinstalar o sistema).
- **macOS:** depois de arrastar a Íris para Aplicativos, abra uma vez e, em **Ajustes do Sistema → Privacidade e Segurança**, clique em **Abrir Mesmo Assim**. Se o macOS disser que o app está danificado, rode `xattr -dr com.apple.quarantine /Applications/Iris.app`.
- **macOS, senha das Chaves:** quem atualiza de uma versão até a 1.0.5 pode ver uma última vez o pedido de senha das Chaves, enquanto a Íris traz as senhas antigas para o arquivo próprio. Digite a senha de login do Mac e confirme. Depois disso o pedido não volta. Se você negar, nenhuma senha se perde: a Íris pergunta de novo na próxima abertura.

## Rodar a partir do código

Requer Node.js 22.

```bash
npm install
npm run dev
```

No primeiro uso o app cria três contas no **PBX simulado** (senha `1234`), então dá para explorar sem servidor. No simulado, `8000` é uma URA, `486` dá ocupado, `408` não atende e qualquer ramal de outra conta simulada do mesmo domínio toca nela.

## Cenários

Na aba **Cenários** (ao lado de **Telefone**) você monta um roteiro de passos e a Íris executa sozinha, marcando cada passo como passou ou falhou, com o tempo. **+ Exemplo de URA** cria um pronto: registrar, discar `8000`, aguardar "em chamada", esperar 2 s, mandar `1234` e desligar.

- Cada chamada aberta por **Discar** ou **Atender** ganha um apelido (`c1`); os passos seguintes usam esse apelido.
- **Aguardar estado** falha se a chamada terminar antes, mostrando o código (ex.: `486 Busy Here`).
- **Verificar** confere um código SIP, o DTMF recebido ou um texto no log.
- **Repetir N×** roda em sequência e mostra a taxa de sucesso, a média e o p95; o relatório sai em `.txt` ou `.json`.
- Os cenários ficam em `scenarios.json` na pasta de dados e são salvos a cada edição.

### Pela linha de comando (CI)

O mesmo app roda cenários sem abrir janela e sai com código **0** se tudo passou, **1** se algum passo falhou e **2** para erro de uso (cenário ou conta inexistente, arquivo inválido).

```bash
npm run build
npm run -s cenario -- --cenario "URA 8000" --vezes 20 --relatorio relatorio.txt
```

Para CI, leve as contas e os cenários em arquivos. Com `--contas`, a Íris usa uma pasta de dados temporária e não lê nem altera os seus dados; as senhas do arquivo ficam só na memória.

```bash
iris --contas contas.json --cenarios cenarios.json --todos \
     --confiar-host 127.0.0.1 --midia-falsa --relatorio relatorio.json
```

- `contas.json` é uma exportação da Íris com senhas. `cenarios.json` pode ser o `scenarios.json` do app, uma lista ou um cenário só.
- A conta de origem de um cenário pode ser o id, o nome ou `ramal@domínio`, para o mesmo cenário servir em outra máquina.
- Todas as contas do arquivo são registradas antes de começar, inclusive as que só recebem chamadas.
- `--ajuda` lista todas as opções. No Linux sem tela, rode com `xvfb-run -a`. Pode rodar com o app aberto.

## PBX de teste (Asterisk)

```bash
./docker/asterisk/gen-cert.sh   # certificado autoassinado para o WSS
docker compose up -d            # Linux
docker compose -f docker-compose.yml -f docker/compose.ports.yml up -d   # macOS e Windows
```

No Docker Desktop (macOS e Windows) a rede do host não fica exposta, então o `docker/compose.ports.yml` mapeia as portas do WSS e do RTP e faz o ICE anunciar `127.0.0.1`.

Cadastre contas com domínio `127.0.0.1`, WebSocket `wss://127.0.0.1:8089/ws`, ramais `1001` a `1020` e senha `1234`. Na primeira conexão o app recusa o certificado e oferece **Confiar neste host**.

Números do plano de discagem: `1001`–`1020` (ramais), `8000` (URA que lê 4 dígitos), `600` (eco), `486` (ocupado).

## Testes

```bash
npm run typecheck   # TypeScript estrito
npm test            # testes de unidade (Vitest)
npm run test:e2e    # ponta a ponta no modo simulado (abre o app)
npm run test:scenarios   # cenários: executa, força falha, repete 20× e exporta relatório
npm run test:cli    # linha de comando: códigos de saída 0, 1 e 2
npm run test:senhas # senhas cifradas em arquivo local e migração do cofre do sistema
npm run test:ai     # ajuda da IA com uma OpenRouter falsa: máscara, chave cifrada e resposta na tela
npm run test:a11y   # acessibilidade: axe (WCAG A/AA) em todas as telas e atalhos de teclado
npm run licenses    # licenças das bibliotecas que vão dentro do app
npm run test:pbx    # integração com o Asterisk do docker compose
npm run test:load   # carga: 20 contas e 4 chamadas no Asterisk, mede a resposta da interface
npm run test:resources   # recursos: RAM com 10 contas e 1 chamada e CPU ociosa, no Asterisk (RNF-05)
```

Em Linux sem tela, rode os de ponta a ponta com `xvfb-run -a`. Com `PBX_WS=wss://127.0.0.1:8089/ws`, o teste de cenários roda a URA do Asterisk de teste.

## Gerar instaladores

```bash
npm run dist:linux   # AppImage e .deb
npm run dist:win     # instalador NSIS (rodar no Windows)
npm run dist:mac     # .dmg e .zip (rodar no macOS)
```

Os instaladores ainda não são assinados (RNF-17). O `.dmg` e o `.zip` saem para Apple Silicon e para Intel.

## Configurações

O botão **Configurações** na barra de cima (ou **Ctrl+,**, no macOS **Cmd+,**) abre uma tela única com Perfil (seu nome e a conta principal), Aparência (seis paletas de cor ou a sua própria cor, e o tamanho da interface), Áudio, Ajuda da IA, Certificados aceitos, Importar e exportar e Atualização.

## Guia de uso

O botão **Guia** na barra de cima (ou a tecla **F1**) abre o guia dentro do app: 22 seções com o que cada tela faz, para que serve e como usar, com capturas de tela, busca e uma tabela de problemas comuns.

O texto fica em `src/renderer/src/guide/content.ts`. As capturas são geradas do próprio app: depois de mudar a interface, rode `npm run guide:shots`.

## Ajuda da IA

A Íris pode pedir a um modelo de IA que explique o log. É opcional e só funciona com a **sua chave da [OpenRouter](https://openrouter.ai/keys)**; o uso é cobrado na sua conta de lá.

- **Onde pedir:** **Explicar com IA** no rodapé do log (usa o filtro atual), no cartão de uma chamada encerrada, e **Por que falhou?** numa conta em erro.
- **O que sai da máquina:** só o texto que a tela mostra antes de você clicar em **Enviar para a OpenRouter**, mais uma instrução fixa de como responder. Vão no máximo as 400 linhas mais novas do recorte.
- **Máscara:** ligada por padrão. Ramais, números, IPs, domínios e nomes de conta viram marcadores como `[NÚMERO-1]` e `[HOST-1]`. Dá para desligar na própria tela.
- **Senhas e autenticação** nunca são enviadas, com ou sem máscara.
- **A chave** fica no arquivo de senhas da Íris, cifrada, não aparece de novo na tela e não entra em exportações. **Remover chave** apaga.
- A IA pode errar: confira a explicação com o log antes de mexer no PBX.

## Atualização automática

O app instalado procura versões novas nos releases de [phs-santos/iris](https://github.com/phs-santos/iris/releases), 15 s depois de abrir e quando você clica em **Configurações → Atualização → Procurar atualização**.

- Nada é baixado sozinho: o app avisa que há versão nova e espera você clicar em **Baixar**. Depois de baixada, ela entra ao reiniciar.
- **Canais:** o estável recebe só os releases normais. O beta recebe também os marcados como pré-lançamento no GitHub, com versão do tipo `1.2.0-beta.1`.
- Em desenvolvimento (`npm run dev`) e na linha de comando, o app não procura atualização. No Linux, só o AppImage se atualiza; quem usa o `.deb` instala o da versão nova.
- No macOS, a atualização só instala com o app assinado (RNF-17). Até lá, o app avisa da versão nova e o botão **Abrir página de download** leva ao `.dmg`; instale por cima e as contas continuam.

Para publicar uma versão:

1. Mude a versão: `npm version 1.2.3 --no-git-tag-version`, e faça o commit.
2. Crie e envie a tag igual à versão: `git tag v1.2.3 && git push origin main v1.2.3`.
3. O fluxo `Release` do GitHub Actions gera os instaladores dos três sistemas e cria um release **em rascunho**, com os instaladores, os `.blockmap` e os `latest*.yml` (sem os `.yml`, o app não acha a versão).
4. Revise o rascunho e publique. Só então o release aparece para o público e para a atualização automática.

Versão com hífen (`1.2.0-beta.1`) sai marcada como pré-lançamento e chega só ao canal beta.

## Estrutura

```
src/main/       processo principal: janela, bandeja, arquivos, senhas, certificados
src/preload/    ponte com canais fixos de IPC (window.iris)
src/shared/     tipos usados pelos três processos
src/renderer/   interface Vue
  sip/          interface SipEngine, motor easy-sipjs e motor simulado
  stores/       estado de contas, chamadas e log (Pinia)
  components/   telas
tests/          unidade (Vitest) e ponta a ponta (Playwright)
docker/         Asterisk de teste
patches/        correção aplicada ao easy-sipjs no npm install
build/          ícone do app: icon.svg (fonte) e icon.png 1024 px, usado pelo electron-builder
resources/      icon.png 512 px para a janela e o Dock em dev
```

## Correção no easy-sipjs

O easy-sipjs 2.7.6 registra com `transport=wss` no Contact. O Asterisk responde o 200 OK com `transport=ws`, e o SIP.js descarta a resposta ("No Contact header pointing to us"), então a conta nunca fica registrada. O arquivo `patches/easy-sipjs+2.7.6.patch` troca para `transport=ws`, que é o padrão do SIP.js, e é aplicado automaticamente por `scripts/apply-patches.mjs` depois do `npm install` (o `patch-package` saiu porque depende do braces, que tem vulnerabilidade sem correção). Vale abrir uma issue no repositório da biblioteca.

## Dados e segurança

- Contas em `accounts.json` e preferências em `settings.json`, na pasta de dados do usuário.
- Senhas em `senhas.json`, cifradas com AES-256-GCM por uma chave própria (`chave-local.bin`), os dois legíveis só pela sua conta. O cofre do sistema não é usado, para o macOS não pedir a senha de login. Trate a pasta de dados como confidencial.
- A interface roda isolada (`contextIsolation`, `sandbox`, CSP) e só fala com o sistema pelos canais de `src/preload`.

## Licença

[MIT](LICENSE).
