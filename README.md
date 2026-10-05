# Íris

Na mitologia grega, Íris é a mensageira dos deuses, que leva recados entre o céu e a terra pelo arco-íris. Esta Íris leva chamadas entre várias contas e vários PBX ao mesmo tempo.

Softphone desktop para testar telefonia: registra várias contas de vários PBX ao mesmo tempo, liga entre elas e mostra o SIP de cada uma na mesma janela. Feito com Electron, Vue 3 e [easy-sipjs](https://www.npmjs.com/package/easy-sipjs).

**O que o PBX precisa ter:** SIP sobre WebSocket seguro (WSS) com áudio WebRTC, que é o modo completo; ou SIP puro por UDP, TCP ou TLS com áudio G.711, pelo motor próprio da Íris (RF-39). Em SIP puro a conta registra, liga, recebe, manda DTMF, põe em espera e transfere; o áudio pode ir cifrado (SRTP por SDES).

A especificação completa (requisitos, arquitetura e plano de entrega) está em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md), e o conceito visual em [docs/CONCEITO.html](docs/CONCEITO.html). Os dois usam o nome antigo do projeto, SIP Bench.

## Estado atual

Marcos **M0 (fundação)**, **M1 (MVP)**, **M2 (diagnóstico e transferência)** e **M3 (cenários)** concluídos. O **M4 (acabamento)** está em andamento: faltam a assinatura dos instaladores (RNF-17), o teste de uso com três pessoas (RNF-11) e o checklist com FreeSWITCH e Kamailio (RNF-02).

| Requisito | O que já funciona |
| --- | --- |
| RF-01, 02, 03, 04 | Cadastro de contas, agrupamento por PBX, registrar uma ou todas, estado com código SIP do erro |
| RF-05, 06 | Testar conexão antes de salvar; registrar ao abrir o app |
| RF-07 | Importar e exportar contas em JSON, sem senhas por padrão |
| RF-08, RNF-06 | Renovação de registro e reconexão com espera crescente (2 s a 1 min) e limite de tentativas em Configurações → Conexão. Vale também para a primeira conexão que falha; senha errada não é tentada de novo |
| RF-09 a RF-14 | Discar, receber, auto-atender, várias chamadas, mudo, espera, DTMF com sequência e pausas |
| RF-15, 16, 17, 18 | Transferência cega e assistida (consulta, concluir ou voltar) com progresso; cabeçalhos SIP extras no INVITE |
| RF-19 | Escolha de microfone e alto-falante, com medidor e som de teste, aplicada também às chamadas em andamento |
| RF-21, 22, 23 | Log por conta com filtros, aba de SIP bruto sem senhas, copiar e salvar .txt/.json |
| Fluxo SIP | Diagrama de escada de cada chamada a partir do SIP bruto, com a mensagem completa ao clicar e exportação em .html |
| RF-24, 25, 26 | Saúde da conta, diagnóstico de microfone e TURN, qualidade da chamada |
| RF-28, 29, 30 | Cenários: editor de passos (registrar, discar, atender, esperar, aguardar estado, DTMF, transferir, desligar, verificar), resultado de cada passo com tempo, repetição N vezes com relatório .txt/.json |
| RF-31 | Cenários pela linha de comando, sem janela: resultado de cada passo no terminal, relatório e código de saída 1 quando algum passo falha |
| RF-32, 33, 37 | Modo simulado, ícone na bandeja com a cor do estado geral (sem registro, registrada, tocando, em chamada, erro), aceite de certificado autoassinado por host |
| RF-38 | Ajuda de IA (OpenRouter, com a sua chave) para explicar o log, uma chamada ou uma falha de registro, com prévia do que é enviado e máscara de dados ligada por padrão |
| RF-35 | Atualização automática pelo GitHub Releases, com canais estável e beta: procura sozinha, baixa só quando você pede e aplica ao reiniciar. Conferida no macOS (1.2.9 → 1.3.0); falta ver no Windows e no AppImage |
| RF-47 | Opus em SIP puro, além do G.711: a Íris prefere o G.711 e usa o Opus quando é o que o PBX tem, com o DTMF no relógio de 48 kHz. G.722 ficou de fora |
| RF-27 | BLF em SIP puro e no simulado: a conta acompanha o estado (livre, tocando, em chamada) dos ramais escolhidos; e aviso de correio de voz (MWI) |
| RF-42 | Teste de carga por SIP puro: até 200 chamadas simultâneas por uma conta, cada uma tocando um tom, com relatório de atendidas, áudio, tempo até atender, perda e jitter |
| RF-46 | Diagnóstico de rede na Saúde: registros DNS SRV do domínio, certificado TLS do PBX (emissor, validade, nomes) e endereço público pelo servidor STUN da conta |
| RF-44 | Exportar em PCAP, para o Wireshark, o que passou pela rede de uma conta de SIP puro: sinalização e, se pedido, o áudio |
| RF-45 | Requisição SIP manual (OPTIONS, MESSAGE, SUBSCRIBE, NOTIFY, INFO, PUBLISH) por uma conta de SIP puro ou simulada, com a resposta inteira na tela |
| RF-43 | Monitor: um cenário roda sozinho a cada N minutos e avisa por notificação e webhook quando passa a falhar ou volta a passar |
| RF-48 | Contas em lote por planilha CSV e variáveis nos cenários (`{ramal}`, `{dominio}`, `{nome}` da conta de origem); `--conta` na linha de comando roda o mesmo roteiro com outra conta |
| RF-49 | Relatório JUnit (`.xml`) na linha de comando |
| RF-41 | Áudio nos cenários: passos Tocar tom, Tocar arquivo WAV, Esperar áudio e Esperar silêncio. Pega chamada muda, que o código SIP não mostra. Tocar só em SIP puro e no simulado; medir, em qualquer conta |
| RF-36 | Gravação da chamada em WAV estéreo (um lado em cada canal), por enquanto só em SIP puro |
| Interface | Tema claro e do sistema, listas compactas, ícones nos botões, medidor do áudio que chega e barras de sinal na chamada, avatar com iniciais, avisos rápidos na tela, paleta de comandos (Ctrl/Cmd+K), primeiros passos no primeiro uso, grupos de PBX recolhíveis e chamada recebida na cor da conta |
| Notificações | Chamada recebida (com Atender e Recusar no aviso, no macOS), chamada perdida, conta que caiu, correio de voz e monitor, cada um ligável em Configurações → Notificações, com botão de teste |
| RF-53 | Links de telefone: a Íris abre `tel:`, `callto:`, `sip:` e `sips:` e põe o número no discador; ligar direto é opção, desligada por padrão |
| RF-34 | Atalhos globais para atender, desligar e mudo, definidos em Configurações → Atalhos e links |
| RF-55 | Toque de chamada por conta (clássico, digital, suave, sino ou nenhum), volume do toque em Configurações → Áudio e o botão do fone (tecla Tocar/Pausar) para atender e desligar |
| RF-54 | Mensagens de texto por SIP MESSAGE entre ramais, em WebRTC, SIP puro e no simulado: conversas por conta, não lidas, aviso e "não entregue" com a resposta do PBX |
| RF-56 | Interface e guia em inglês, escolhidos em Configurações → Aparência; a troca vale na hora. O log de eventos, o resultado das chamadas, os passos dos cenários, as notificações do sistema e a linha de comando continuam em português |
| RF-20 | Early media: o cartão diz se o som antes do atendimento é o toque local ou o áudio do PBX (183), e toca esse áudio. Em SIP puro sempre; em WebRTC por opção da conta |
| RF-50 | Agenda de contatos: busca, favoritos, ligar com um clique, salvar a partir do histórico, CSV, e o nome do contato nas chamadas e no histórico |
| RF-51 | Servidores cadastrados: a conta escolhe o PBX e só preenche ramal e senha; editar o servidor atualiza todas as contas dele |
| RF-40 | Histórico de chamadas: aba com hora, conta, número, duração e resultado de cada chamada, guardado em `history.json`, com Ligar de novo e Fluxo SIP |
| RF-39 | SIP puro por UDP, TCP ou TLS com motor próprio: a conta registra, renova, responde ao OPTIONS do PBX, mede a Saúde, liga e recebe chamadas com áudio G.711, DTMF por RTP ou SIP INFO, mudo, espera, transferência cega e assistida, SRTP (SDES, AES_CM_128_HMAC_SHA1_80) e qualidade com perda, jitter e tempo de ida e volta (RTCP). Não tem: RTCP cifrado (com SRTP o RTT fica em 0), INVITE sem SDP, temporizador de sessão e DNS SRV |
| RNF-13 | Textos da interface em arquivos de tradução (`src/renderer/src/i18n`), em português e prontos para inglês |
| RNF-14 | Log interno do app em arquivo rotativo (5 × 10 MB) em `logs/` na pasta de dados |
| RNF-15 | Lint (ESLint) e cobertura da camada de domínio no CI, com mínimo de 70% |
| RNF-01, RNF-04 | O CI abre o app empacotado nos três sistemas e mede a abertura e o registro |

Recursos (RNF-05): a CPU ociosa com 10 contas registradas fica em 0,1%, abaixo do limite de 2%. A memória com 10 contas e 1 chamada ficou entre 331 e 389 MB no macOS com tela retina e em 350 MB no Linux do CI, acima do limite de 300 MB; é uma pendência conhecida.

## Instalar

**No macOS, instale pelo Terminal** (recomendado). O comando baixa a versão certa para o seu Mac, confere o arquivo e coloca a Íris em Aplicativos, sem o aviso "A Apple não pôde verificar…". Use o mesmo comando para atualizar, com a Íris fechada:

```bash
curl -fsSL https://raw.githubusercontent.com/phs-santos/iris/main/scripts/install-macos.sh | bash
```

Nos outros sistemas, ou se preferir o `.dmg`, baixe o instalador da [página de releases](https://github.com/phs-santos/iris/releases/latest). Pegue só o arquivo do seu sistema; o "Source code (zip)" que aparece na lista é o código do projeto, não o app.

| Sistema | Arquivo |
| --- | --- |
| Windows | `Iris-Setup-<versão>.exe` |
| macOS com chip Apple (M1 ou mais novo) | `Iris-<versão>-arm64.dmg` |
| macOS (Intel) | `Iris-<versão>-x64.dmg` |
| Linux (Debian, Ubuntu, Mint) | `iris_<versão>_amd64.deb` (instale com `sudo apt install ./iris_<versão>_amd64.deb`) |
| Linux (outras distribuições) | `Iris-<versão>.AppImage` (dê permissão de execução: `chmod +x`) |

Os instaladores ainda não são assinados (RNF-17), então o sistema avisa na primeira vez:

- **Windows:** no aviso do SmartScreen, clique em **Mais informações → Executar assim mesmo**. Se aparecer "O controle inteligente de aplicativos bloqueou um aplicativo", não há botão para liberar: esse recurso do Windows 11 só deixa rodar instalador assinado. Enquanto a Íris não for assinada, ela não instala nessas máquinas, a não ser que o Controle Inteligente de Aplicativos seja desligado em **Segurança do Windows → Controle de aplicativos e do navegador** (o Windows não deixa religar depois sem reinstalar o sistema).
- **macOS, pelo `.dmg`:** o aviso aparece porque o navegador marca o arquivo baixado e a Íris não tem assinatura da Apple. Use o comando do Terminal acima, que não passa pelo navegador. Se já baixou o `.dmg`, arraste a Íris para Aplicativos, abra uma vez e, em **Ajustes do Sistema → Privacidade e Segurança**, clique em **Abrir Mesmo Assim**.

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
- **Tocar tom**, **Tocar arquivo WAV**, **Esperar áudio** e **Esperar silêncio** conferem o som da chamada: um cenário contra o eco passa quando o tom volta e falha quando a chamada fica muda.
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
     --confiar-host 127.0.0.1 --midia-falsa --relatorio relatorio.xml
```

- `contas.json` é uma exportação da Íris com senhas. `cenarios.json` pode ser o `scenarios.json` do app, uma lista ou um cenário só.
- A conta de origem de um cenário pode ser o id, o nome ou `ramal@domínio`, para o mesmo cenário servir em outra máquina.
- Todas as contas do arquivo são registradas antes de começar, inclusive as que só recebem chamadas.
- O relatório sai em `.json`, `.txt` ou `.xml`; o `.xml` é JUnit, que o CI mostra como lista de testes.
- `--conta <conta>` roda o cenário com outra conta de origem; repita para rodar com várias. Com `{ramal}` nos passos, um roteiro só serve a todas.
- `--ajuda` lista todas as opções. No Linux sem tela, rode com `xvfb-run -a`. Pode rodar com o app aberto.

## PBX de teste (Asterisk)

```bash
./docker/asterisk/gen-cert.sh   # certificado autoassinado para o WSS
docker compose up -d            # Linux
docker compose -f docker-compose.yml -f docker/compose.ports.yml up -d   # macOS e Windows
```

No Docker Desktop (macOS e Windows) a rede do host não fica exposta, então o `docker/compose.ports.yml` mapeia as portas do WSS e do RTP e faz o ICE anunciar `127.0.0.1`.

Cadastre contas com domínio `127.0.0.1`, WebSocket `wss://127.0.0.1:8089/ws`, ramais `1001` a `1020` e senha `1234`. Na primeira conexão o app recusa o certificado e oferece **Confiar neste host**.

Números do plano de discagem: `1001`–`1020` (ramais), `8000` (URA que lê 4 dígitos), `600` (eco), `601` (atende e fica mudo), `602` (183 com um tom por 5 s antes de atender), `603` (só toca por 5 s antes de atender), `486` (ocupado).

Para SIP puro (RF-39), o mesmo Asterisk atende em UDP e TCP na porta `5060` e em TLS na `5061`, com os ramais `2001` a `2005` (senha `1234`); o `2005` exige SRTP. Na conta, escolha o transporte e use o domínio `127.0.0.1`. O ramal `2006` é de SIP puro só com Opus. O ramal `1021` é WebRTC só com G.711, para ligar entre SIP puro e WebRTC: esta imagem do Asterisk não converte Opus, e os ramais `1001` a `1020` preferem Opus. Depois de mudar um arquivo de `docker/asterisk`, recrie o contêiner (`docker compose … up -d --force-recreate`): no Docker Desktop, o contêiner pode continuar vendo o arquivo antigo.

## Testes

```bash
npm run typecheck   # TypeScript estrito
npm run lint        # ESLint: defeitos e regras de arquitetura (sem eval, sem v-html, SIP só pelo SipEngine)
npm test            # testes de unidade (Vitest)
npm run test:coverage   # os mesmos, com cobertura da camada de domínio (mínimo de 70%)
npm run test:e2e    # ponta a ponta no modo simulado (abre o app)
npm run test:scenarios   # cenários: executa, força falha, repete 20× e exporta relatório
npm run test:cli    # linha de comando: códigos de saída 0, 1 e 2
npm run test:senhas # senhas cifradas em arquivo local, sem nunca usar o cofre do sistema
npm run test:ai     # ajuda da IA com uma OpenRouter falsa: máscara, chave cifrada e resposta na tela
npm run test:a11y   # acessibilidade: axe (WCAG A/AA) em todas as telas e atalhos de teclado
npm run licenses    # licenças das bibliotecas que vão dentro do app
npm run test:arquivos   # preferências gravadas em fila, arquivos estragados e log interno
npm run test:pacote # gera e abre o app EMPACOTADO: contas, Configurações, Guia e log interno sem erro
npm run test:pbx    # integração com o Asterisk do docker compose
npm run test:atalhos       # links tel: e sip:, atalhos globais, botão do fone e toque por conta, no simulado
npm run test:idioma        # interface e guia em inglês: troca na hora, grava e volta ao português
npm run test:mensagens     # mensagens de texto no simulado (com o Asterisk, entram no test:sip e no test:pbx)
npm run test:notificacoes  # notificações no simulado: chamada recebida, Atender pelo aviso, chamada perdida e a escolha em Configurações
npm run test:contatos   # agenda de contatos e servidores cadastrados pela tela, no simulado (RF-50, RF-51)
npm run test:monitor    # monitor: cenário que falha sozinho, aviso no log e webhook num servidor local (RF-43)
npm run test:audio  # áudio nos cenários pela linha de comando: tom e WAV no eco, e um ramal mudo (RF-41)
npm run test:sip    # SIP puro no Asterisk: registro por UDP, TCP e TLS, chamadas com áudio, DTMF, cancelar, recusar, espera, transferência e SRTP (RF-39)
npm run test:reconexao  # derruba o contêiner do PBX e confere que as contas voltam sozinhas (RNF-06)
npm run test:carga-sip  # carga por SIP puro: 50 chamadas simultâneas com o eco do Asterisk e o relatório (RF-42)
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

## Modo Telefone

O botão **Modo Telefone** na barra de cima troca a Bancada por uma janela estreita, como um celular: a conta no topo, o teclado, a chamada ocupando a tela e a chamada recebida em destaque. O botão **Bancada** volta para as três colunas. O app sempre abre na Bancada.

## Configurações

O botão **Configurações** na barra de cima (ou **Ctrl+,**, no macOS **Cmd+,**) abre uma tela única com Perfil (seu nome e a conta principal), Aparência (seis paletas de cor ou a sua própria cor, e o tamanho da interface), Áudio, Ajuda da IA, Certificados aceitos, Importar e exportar e Atualização.

## Tradução

Os componentes não têm texto fixo (RNF-13): pedem cada texto pelo nome a `$t()` no modelo ou `t()` no script. Os textos em português ficam em `src/renderer/src/i18n/pt-BR.ts`, um grupo por componente, e o guia em `guide.pt-BR.ts`. Para outro idioma, copie os dois arquivos, traduza os valores e registre o catálogo em `i18n/index.ts`. `npm run lint` reprova texto fixo num componente (`scripts/check-i18n.mjs`). As linhas do log de eventos, as mensagens do processo principal e o modo de linha de comando ainda estão só em português.

## Guia de uso

O botão **Guia** na barra de cima (ou a tecla **F1**) abre o guia dentro do app: 25 seções com o que cada tela faz, para que serve e como usar, com capturas de tela, busca e uma tabela de problemas comuns.

O texto fica em `src/renderer/src/i18n/guide.pt-BR.ts`. As capturas são geradas do próprio app: depois de mudar a interface, rode `npm run guide:shots`.

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
- No macOS, o app não tem assinatura da Apple (RNF-17), e o atualizador padrão recusaria a versão nova. Por isso a própria Íris baixa o `.zip` do release, confere o SHA-512 publicado no `latest-mac.yml`, troca o app e reinicia (`src/main/mac-update.ts`), sem o aviso da Apple. Se algo falhar, a tela mostra o comando do Terminal (`scripts/install-macos.sh`).

Para publicar uma versão:

1. Mude a versão: `npm version 1.2.3 --no-git-tag-version`, e faça o commit.
2. Crie e envie a tag igual à versão: `git tag v1.2.3 && git push origin main v1.2.3`.
3. O fluxo `Release` do GitHub Actions gera os instaladores dos três sistemas e cria um release **em rascunho**, com os instaladores, os `.blockmap` e os `latest*.yml` (sem os `.yml`, o app não acha a versão).
4. Revise o rascunho e publique. Só então o release aparece para o público e para a atualização automática.

Versão com hífen (`1.2.0-beta.1`) sai marcada como pré-lançamento e chega só ao canal beta.

## Estrutura

```
src/main/       processo principal: janela, bandeja, arquivos, senhas, certificados, log interno
  sip/          motor próprio de SIP puro: mensagens, digest, transporte, user-agent, chamada, SDP, RTP, RTCP, SRTP e G.711 (RF-39)
src/preload/    ponte com canais fixos de IPC (window.iris)
src/shared/     tipos usados pelos três processos
src/renderer/   interface Vue
  sip/          interface SipEngine, motor easy-sipjs e motor simulado
  stores/       estado de contas, chamadas e log (Pinia)
  components/   telas
tests/          unidade (Vitest) e ponta a ponta (Playwright)
docker/         Asterisk de teste
patches/        correção aplicada ao easy-sipjs no npm install
build/          ícone do app: icon.svg (fonte), tray.svg (marca de uma cor só) e icon.png 1024 px, usado pelo electron-builder
resources/      icon.png 512 px para a janela e o Dock em dev, e tray-<estado>.png para a bandeja
                (os PNG saem dos SVG com `npm run icons`)
```

## Correção no easy-sipjs

O easy-sipjs 2.7.6 registra com `transport=wss` no Contact. O Asterisk responde o 200 OK com `transport=ws`, e o SIP.js descarta a resposta ("No Contact header pointing to us"), então a conta nunca fica registrada. O arquivo `patches/easy-sipjs+2.7.6.patch` troca para `transport=ws`, que é o padrão do SIP.js, e é aplicado automaticamente por `scripts/apply-patches.mjs` depois do `npm install` (o `patch-package` saiu porque depende do braces, que tem vulnerabilidade sem correção). Vale abrir uma issue no repositório da biblioteca.

## Dados e segurança

- Contas em `accounts.json`, preferências em `settings.json` e histórico de chamadas em `history.json`, contatos em `contacts.json` e servidores em `servers.json`, na pasta de dados do usuário.
- Senhas em `senhas.json`, cifradas com AES-256-GCM por uma chave própria (`chave-local.bin`), os dois legíveis só pela sua conta. O cofre do sistema (Chaves do macOS, Secret Service do Linux) não é usado de jeito nenhum, nem pelo Chromium, para o sistema não pedir a senha de login. O `secrets.json` de versões até a 1.0.5 é ignorado. Trate a pasta de dados como confidencial.
- Um arquivo de dados estragado nunca é sobrescrito: vai para o lado (`accounts.json.corrompido-<data>`), a tela avisa e o app abre.
- O log interno do app fica em `logs/iris.log` na pasta de dados (5 arquivos de 10 MB). Guarda só falhas do próprio app, sem SIP e sem senha; é o primeiro lugar para olhar quando algo não abre.
- A interface roda isolada (`contextIsolation`, `sandbox`, CSP) e só fala com o sistema pelos canais de `src/preload`.

## Licença

[MIT](LICENSE).
