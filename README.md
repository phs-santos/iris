# Íris

Na mitologia grega, Íris é a mensageira dos deuses, que leva recados entre o céu e a terra pelo arco-íris. Esta Íris leva chamadas entre várias contas e vários PBX ao mesmo tempo.

Softphone desktop para testar telefonia: registra várias contas de vários PBX ao mesmo tempo, liga de qualquer uma delas e mostra o SIP de cada uma na mesma janela. Feito com Electron, Vue 3 e [easy-sipjs](https://www.npmjs.com/package/easy-sipjs).

**O que o PBX precisa ter:** SIP puro por UDP, TCP ou TLS, como qualquer softphone, que é o padrão; ou SIP sobre WebSocket seguro (WSS) com áudio WebRTC, como opção avançada. Em SIP puro o motor é da própria Íris (RF-39): registra, liga, recebe, manda DTMF, põe em espera, transfere e grava, com G.722, G.711 e Opus, e o áudio pode ir cifrado (SRTP por SDES).

A especificação completa (requisitos, arquitetura e plano de entrega) está em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md). O desenho da versão 2.0, que deixou a Íris mais simples, está em [docs/superpowers/specs/2026-10-29-iris-mais-simples-design.md](docs/superpowers/specs/2026-10-29-iris-mais-simples-design.md). O conceito visual antigo, de antes da 2.0, está em [docs/CONCEITO.html](docs/CONCEITO.html). Os documentos mais antigos usam o nome antigo do projeto, SIP Bench.

## A tela

A Íris tem uma tela só, pensada para o uso de todo dia: escolher a conta, digitar o número e ligar. Da esquerda para a direita:

- **Barra de ícones.** No topo, a conta atual: avatar na cor da conta, bolinha de estado e o ramal. Um número vermelho diz quantas outras contas estão com erro. No pé, **Ajustes** (Ctrl+, ou Cmd+,).
- **Seletor de contas.** Abre ao clicar no avatar. Tem busca por nome, ramal ou etiqueta, filtro por etiqueta e as contas agrupadas por servidor. Cada linha tem Registrar ou Desregistrar, Editar e, com erro, **Por quê?**, que explica o erro em português. O clique direito (ou o botão ⋯) abre Duplicar, Saúde, Contatos e Excluir. No rodapé ficam Nova conta e Registrar todas.
- **Discar.** O título diz de qual conta a chamada sai. Ao digitar um número ou um nome, aparecem só os contatos da conta atual: ↑ e ↓ escolhem, Enter liga. Se o que foi digitado não é de nenhum contato, a última opção é "+ Salvar como contato". O teclado de 12 teclas fica sempre à vista; em chamada, ele manda os tons DTMF.
- **Chamadas.** As chamadas de todas as contas, cada uma numa linha: nome ou número, tempo, a conta, codec, perda, jitter, RTT e os botões Mudo, Espera, DTMF, Transferir (cega ou consultando antes), Gravar e Desligar. A chamada recebida aparece no alto, com Atender e Recusar. Sem chamadas, a área mostra os **detalhes da conta atual**: registro e quando renova, último OPTIONS com a latência, servidor com IP e porta, transporte, usuário, codecs, DTMF e a atividade SIP recente.
- **Depuração.** Uma gaveta à direita, que começa fechada numa tira fina ("SIP · Fluxo · Log"). Quando chega um erro, a tira muda de cor, sem abrir sozinha. Aberta, tem as abas **SIP** (cada mensagem numa linha; um clique mostra a mensagem inteira), **Fluxo** (diagrama de escada de cada chamada), **Log** (eventos com filtro de nível e busca) e **Saúde** (conta, microfone e rede). Um filtro de conta vale para as quatro abas e acompanha a conta atual. A gaveta muda de largura arrastando a borda ou pelas setas do teclado.

**Cadastro de conta.** Campos à vista: nome, etiquetas, servidor, ramal e senha. Em **Avançado** ficam o transporte (UDP é o padrão), usuário de autenticação, endereço e porta, nome de exibição, DTMF, registrar ao abrir, SRTP, atender sozinho, toque e cor; com WebSocket, também o endereço WSS, STUN/TURN e o áudio antes de atender (early media). **Testar** registra, mostra o resultado e desregistra.

**Servidor.** Janela própria, aberta pelo cadastro de conta ("+ Novo servidor…") ou por Ajustes → Servidores: nome, domínio, transporte e endereço, e em Avançado SRTP e DTMF padrão (com WebSocket, WSS e STUN/TURN). **Testar** manda um OPTIONS e mostra a latência. Editar um servidor muda todas as contas dele. O **PBX simulado** é um servidor fixo, que não se edita nem se apaga.

**Ajustes.** Uma janela com as seções:

| Seção | O que tem |
| --- | --- |
| Áudio | Microfone com medidor, alto-falante com som de teste, volume do toque, pasta das gravações e a **ordem dos codecs** do SIP puro (arrastar ou ↑/↓; cada codec pode ser desligado) |
| Aparência | Tema claro (padrão), escuro ou do sistema, e a cor de destaque |
| Servidores | Criar, editar e apagar servidores (um servidor em uso não pode ser apagado) |
| Etiquetas | Nome e cor de cada etiqueta. Renomear ou mudar a cor vale em todas as contas; apagar tira de todas |
| Conexão | Limite de tentativas de reconexão |
| Notificações | Quais avisos do sistema aparecem (chamada recebida, perdida, conta que caiu), com botão de teste |
| Certificados | Hosts com certificado autoassinado que você aceitou |
| Importar e exportar | Contas em JSON (sem senhas, a menos que você marque) e contas em lote por planilha CSV |
| Atualização | Versão instalada, canal estável ou beta, procurar, baixar e instalar |

No pé da janela fica **Sobre**, com as versões do app, do Electron e do Chromium.

**Contatos.** Cada contato é de uma conta só: nome, número e observação. Eles aparecem como sugestão no discador e como nome de quem liga. Para editar ou apagar, use "Contatos" no clique direito da conta, no seletor.

**Atalhos de teclado.**

| Ação | Atalho |
| --- | --- |
| Focar o número no discador | Ctrl/Cmd + L |
| Ligar | Enter no discador |
| Atender a chamada que está tocando | Ctrl/Cmd + Enter |
| Desligar a chamada escolhida | Ctrl/Cmd + E |
| Mudo | Ctrl/Cmd + M |
| Espera | Ctrl/Cmd + H |
| Trocar a conta atual | Ctrl/Cmd + 1 a 9 |
| Abrir os Ajustes | Ctrl/Cmd + , |

## Estado atual

A versão pública é a **2.0.0** (31/10/2026). Os marcos **M0 a M3** estão concluídos. O **M4 (acabamento)** está em andamento: faltam a assinatura dos instaladores (RNF-17), ver a atualização automática aplicada no Windows ou no AppImage (RF-35), o teste de uso com três pessoas (RNF-11) e o checklist com FreeSWITCH e Kamailio (RNF-02).

| Requisito | O que já funciona |
| --- | --- |
| RF-01 a RF-04 | Cadastro de contas (nome, etiquetas, servidor, ramal e senha; o resto em Avançado), contas agrupadas por servidor no seletor, registrar uma ou todas, estado com o código SIP do erro |
| RF-05, 06 | Testar o registro antes de salvar; registrar ao abrir o app |
| RF-07, RF-48 | Importar e exportar contas em JSON, sem senhas por padrão; contas em lote por planilha CSV |
| RF-08, RNF-06 | Renovação do registro e reconexão com espera crescente (2 s a 1 min) e limite de tentativas em Ajustes → Conexão. Vale também para a primeira conexão que falha; senha errada não é tentada de novo |
| RF-09 a RF-14 | Discar com sugestão de contatos da conta, receber, auto-atender, várias chamadas de contas diferentes, mudo, espera, DTMF com sequência e pausas |
| RF-15 a RF-18 | Transferência cega e assistida, com o progresso; cabeçalhos SIP extras no INVITE |
| RF-19 | Escolha de microfone e alto-falante, com medidor e som de teste, aplicada também às chamadas em andamento |
| RF-20 | Early media: a linha da chamada diz se o som antes do atendimento é o toque local ou o áudio do PBX (183), e toca esse áudio. Em SIP puro sempre; em WebSocket por opção da conta |
| RF-21, 22, 23 | Log com filtro por conta, nível e texto; aba SIP sem senhas; copiar e salvar em .txt e .json |
| RF-24, 25, 26, RF-46 | Saúde da conta (registro e OPTIONS com latência), diagnóstico de microfone, de TURN e de rede (DNS SRV, certificado TLS, STUN); qualidade da chamada (codec, perda, jitter, RTT) e medidor do áudio que chega |
| Fluxo SIP | Diagrama de escada de cada chamada, a partir do SIP guardado, com a mensagem inteira ao clicar e exportação em .html |
| RF-32 | PBX simulado, um servidor fixo com três contas de exemplo, para usar sem rede |
| RF-33 | Ícone na bandeja com a cor do estado geral; fechar a janela não derruba registros nem chamadas |
| RF-35 | Atualização automática pelo GitHub Releases, com canais estável e beta: procura sozinha, baixa só quando você pede e aplica ao reiniciar. Conferida no macOS; falta ver no Windows e no AppImage |
| RF-36 | Gravação da chamada em WAV estéreo (um lado em cada canal), só em SIP puro |
| RF-37 | Aceite de certificado autoassinado por host |
| RF-39, RF-47 | SIP puro por UDP, TCP ou TLS com motor próprio: registro, renovação, OPTIONS, chamadas com G.722, G.711 (PCMA e PCMU) e Opus, DTMF por RTP ou SIP INFO, mudo, espera, transferência cega e assistida, SRTP (SDES, AES_CM_128_HMAC_SHA1_80) e RTT por RTCP. Não tem: RTCP cifrado (com SRTP o RTT fica em 0), INVITE sem SDP, temporizador de sessão, DNS SRV no registro e DTLS-SRTP |
| RF-50 | Contatos por conta, como sugestão no discador e como nome de quem liga |
| RF-51 | Servidores cadastrados; editar um servidor muda todas as contas dele. O PBX simulado é um servidor fixo |
| RF-55 | Toque por conta (clássico, digital, suave, sino ou nenhum) e volume do toque |
| RF-60 | Ordem dos codecs do SIP puro em Ajustes → Áudio, valendo para a oferta do INVITE e a resposta a uma chamada recebida |
| RF-61 | Etiquetas com nome e cor, reaproveitadas entre contas, para buscar e filtrar no seletor |
| Notificações | Chamada recebida (com Atender e Recusar no aviso, no macOS), chamada perdida e conta que caiu, cada uma ligável em Ajustes → Notificações |
| RNF-12 | Ações principais com atalho, estados com cor e forma, contraste AA (conferido pelo `a11y.mjs`, nos temas claro e escuro) |
| RNF-13 | Nenhum texto fixo nos componentes: tudo em `src/renderer/src/i18n/pt-BR.ts` |
| RNF-14 | Log interno do app em arquivo rotativo (5 × 10 MB) em `logs/` na pasta de dados |
| RNF-15 | Lint (ESLint) e cobertura da camada de domínio no CI, com mínimo de 70% |
| RNF-01, RNF-04 | O fluxo de release abre o app empacotado nos três sistemas e mede a abertura e o registro |

Recursos (RNF-05): a CPU ociosa com 10 contas registradas ficou em 0,1%, abaixo do limite de 2%. A memória com 10 contas e 1 chamada ficou entre 331 e 389 MB no macOS com tela retina e em 350 MB no Linux, acima do limite de 300 MB; é uma pendência conhecida. As medidas são da 1.x; o teste que media saiu na 2.0, porque usava a tela antiga.

**O que saiu na 2.0** (29/10/2026, a pedido do usuário): histórico, cenários, linha de comando e JUnit, monitor, modo SDR, mensagens, teste de carga, ajuda da IA, vídeo, PCAP, requisição SIP manual, BLF e correio de voz, áudio ao atender, modos escondidos, modo Telefone, primeiros passos, paleta de comandos, inglês, atalhos globais, links `tel:` e as paletas de cor. O guia de uso saiu depois, em 31/10/2026. A lista com o motivo está na especificação, na seção "Retirados em 29/10/2026". **Ao abrir a 2.0 pela primeira vez, os dados das versões anteriores são apagados**: o app começa com as contas de exemplo do PBX simulado.

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

## PBX de teste (Asterisk)

```bash
./docker/asterisk/gen-cert.sh   # certificado autoassinado para o TLS e o WSS
docker compose up -d            # Linux
docker compose -f docker-compose.yml -f docker/compose.ports.yml up -d   # macOS e Windows
```

No Docker Desktop (macOS e Windows) a rede do host não fica exposta, então o `docker/compose.ports.yml` mapeia as portas do SIP, do WSS e do RTP.

Para usar à mão, crie um servidor com domínio `127.0.0.1` e transporte UDP (o Asterisk também atende TCP na porta `5060` e TLS na `5061`) e contas com os ramais `2001` a `2005`, senha `1234`. O `2005` exige SRTP, o `2006` só aceita Opus e o `2007` só G.722. Com TLS, na primeira conexão o app recusa o certificado e oferece **Confiar neste host**.

Números para ligar: `8000` (URA que lê 4 dígitos e grava no log do Asterisk), `600` (eco), `601` (atende e fica mudo), `602` (183 com um tom por 5 s antes de atender), `603` (só toca por 5 s antes de atender) e `486` (ocupado).

Para WebSocket, use `wss://127.0.0.1:8089/ws` com os ramais `1001` a `1020`. Eles preferem Opus, e esta imagem do Asterisk não converte Opus; para ligar entre SIP puro e WebSocket, use o `1021`, que é só G.711.

O teste de chamada (`chamada.mjs`, abaixo) cria um servidor UDP em `127.0.0.1`, as contas `2001` e `2002`, e liga para `2002`, `600` e `8000`.

Cuidados:

- Depois de mudar um arquivo de `docker/asterisk`, recrie o contêiner (`docker compose … up -d --force-recreate`). No Docker Desktop, o contêiner pode continuar vendo o arquivo antigo.
- O áudio usa só 50 portas (10000 a 10100). Depois de muitas chamadas, recrie o contêiner antes de achar que há defeito.
- Fechar o app no meio de uma chamada deixa canais presos no Asterisk. Limpe com `docker exec iris-asterisk-1 asterisk -rx 'channel request hangup all'`.

## Testes

```bash
npm run typecheck       # TypeScript estrito
npm run lint            # ESLint (sem eval, sem v-html, SIP só pelo SipEngine) e texto fixo em componente
npm test                # testes de unidade (Vitest)
npm run test:coverage   # os mesmos, com cobertura da camada de domínio (mínimo de 70%)
npm run format:check    # Prettier
npm run test:e2e        # testes de tela no simulado: smoke, a11y, senhas, arquivos, notificacoes, contatos, toques e chamada
npm run test:e2e -- chamada a11y                              # só os testes pedidos (nomes dos arquivos em tests/e2e)
PBX_WS=wss://127.0.0.1:8089/ws npm run test:e2e -- chamada    # a chamada também contra o Asterisk
npm run test:pacote     # gera e abre o app EMPACOTADO: contas, Ajustes → Atualização e log interno sem erro
npm run licenses        # licenças das bibliotecas que vão dentro do app
```

Os testes de tela ficam em `tests/e2e/*.mjs`, e os seletores que eles usam, só em `tests/e2e/helpers/tela.mjs`. Cada um abre o app com uma pasta de dados temporária e microfone falso. Com `PBX_WS` definido, o `chamada.mjs` repete o teste contra o Asterisk: cadastra o servidor e as contas pela tela, registra por UDP, liga, confere a ordem dos codecs no SIP, põe em espera, transfere, manda DTMF para a URA e desliga.

O terminal do VSCode exporta `ELECTRON_RUN_AS_NODE=1`, e com ela o Electron não abre a janela: o `npm run test:e2e` já tira a variável; para rodar um arquivo direto, use `env -u ELECTRON_RUN_AS_NODE node tests/e2e/chamada.mjs`. Em Linux sem tela, use `xvfb-run -a`.

No CI, o pull request roda só a verificação rápida (formato, lint, licenças, typecheck, unidade e build) nos três sistemas. Os testes de tela, e a chamada contra o Asterisk, rodam na `main` e quando alguém pede.

## Gerar instaladores

```bash
npm run dist   # do sistema em que roda: AppImage e .deb no Linux, NSIS no Windows, .dmg e .zip no macOS
```

Os instaladores ainda não são assinados (RNF-17). O `.dmg` e o `.zip` saem para Apple Silicon e para Intel.

## Atualização automática

O app instalado procura versões novas nos releases de [phs-santos/iris](https://github.com/phs-santos/iris/releases), 15 s depois de abrir e quando você clica em **Ajustes → Atualização → Procurar atualização**.

- Nada é baixado sozinho: o app avisa que há versão nova e espera você clicar em **Baixar**. Depois de baixada, ela entra ao reiniciar.
- **Canais:** o estável recebe só os releases normais. O beta recebe também os marcados como pré-lançamento no GitHub, com versão do tipo `1.2.0-beta.1`.
- Em desenvolvimento (`npm run dev`), o app não procura atualização. No Linux, só o AppImage se atualiza; quem usa o `.deb` instala o da versão nova.
- No macOS, o app não tem assinatura da Apple (RNF-17), e o atualizador padrão recusaria a versão nova. Por isso a própria Íris baixa o `.zip` do release, confere o SHA-512 publicado no `latest-mac.yml`, troca o app e reinicia (`src/main/mac-update.ts`), sem o aviso da Apple. Se algo falhar, a tela mostra o comando do Terminal (`scripts/install-macos.sh`).

Para publicar uma versão:

1. Mude a versão: `npm version 1.2.3 --no-git-tag-version`, e faça o commit.
2. Crie e envie a tag igual à versão: `git tag v1.2.3 && git push origin main v1.2.3`.
3. O fluxo `Release` do GitHub Actions gera os instaladores dos três sistemas e cria um release **em rascunho**, com os instaladores, os `.blockmap` e os `latest*.yml` (sem os `.yml`, o app não acha a versão).
4. Revise o rascunho e publique. Só então o release aparece para o público e para a atualização automática.

Versão com hífen (`1.2.0-beta.1`) sai marcada como pré-lançamento e chega só ao canal beta.

## Estrutura

```
src/main/        processo principal: janela, bandeja, arquivos, senhas, certificados, notificações, atualização, log interno
  sip/           motor próprio de SIP puro: mensagens, digest, transporte, user-agent, chamada, SDP, RTP, RTCP, SRTP,
                 codecs (G.711, G.722, Opus), troca de taxa e gravação (RF-39)
  native-sip.ts  canais de IPC do SIP puro (sip:start, sip:dial, sip:probe…)
src/preload/     ponte com canais fixos de IPC (window.iris)
src/shared/      regras e tipos usados pelos processos: codecs, etiquetas, servidores, contatos, seletor,
                 registro, reconexão, toques, notificações, aparência, atualização
src/renderer/    interface Vue
  sip/           interface SipEngine e os três motores: WebSocket (easy-sipjs), SIP puro e simulado
  stores/        estado (Pinia): contas, chamadas, log, contatos, servidores, etiquetas, preferências, depuração
  components/
    shell/       a tela principal: barra de ícones, seletor de contas, discador, chamadas, detalhes da conta,
                 gaveta de depuração (SIP, Fluxo, Log, Saúde)
    settings/    as seções dos Ajustes, entre elas Etiquetas e a lista de codecs
                 AccountForm, ServerDialog, ContactsDialog e TagsField ficam soltos em components/
  i18n/pt-BR.ts  todo o texto da tela (RNF-13)
tests/           unidade (Vitest); tests/e2e, testes de tela (Playwright)
scripts/         e2e.mjs (roda os testes de tela), install-macos.sh, check-i18n, licenças, ícones, patches
docker/          Asterisk de teste
patches/         correção aplicada ao easy-sipjs no npm install
build/           ícone do app: icon.svg (fonte), tray.svg (marca de uma cor só) e icon.png 1024 px, usado pelo electron-builder
resources/       icon.png 512 px para a janela e o Dock em dev, e tray-<estado>.png para a bandeja
                 (os PNG saem dos SVG com `npm run icons`)
```

## Correção no easy-sipjs

O easy-sipjs 2.7.6 registra com `transport=wss` no Contact. O Asterisk responde o 200 OK com `transport=ws`, e o SIP.js descarta a resposta ("No Contact header pointing to us"), então a conta nunca fica registrada. O arquivo `patches/easy-sipjs+2.7.6.patch` troca para `transport=ws`, que é o padrão do SIP.js, e é aplicado automaticamente por `scripts/apply-patches.mjs` depois do `npm install` (o `patch-package` saiu porque depende do braces, que tem vulnerabilidade sem correção). Vale abrir uma issue no repositório da biblioteca.

## Dados e segurança

- Contas em `accounts.json`, servidores em `servers.json`, etiquetas em `tags.json`, contatos em `contacts.json` e preferências em `settings.json`, na pasta de dados do usuário. Todos levam `schemaVersion: 2`; um arquivo sem isso é de uma versão anterior e, na primeira abertura da 2.0, é apagado junto com as senhas.
- As gravações de chamada (RF-36) ficam em `gravacoes`, na pasta de dados, e o app não as apaga. Ajustes → Áudio abre a pasta.
- Senhas em `senhas.json`, cifradas com AES-256-GCM por uma chave própria (`chave-local.bin`), os dois legíveis só pela sua conta. O cofre do sistema (Chaves do macOS, Secret Service do Linux) não é usado de jeito nenhum, nem pelo Chromium, para o sistema não pedir a senha de login. Trate a pasta de dados como confidencial.
- Um arquivo de dados estragado nunca é sobrescrito: vai para o lado (`accounts.json.corrompido-<data>`), a tela avisa e o app abre.
- O SIP guardado para a aba SIP não tem senha, Authorization nem nonce (RF-22).
- O log interno do app fica em `logs/iris.log` na pasta de dados (5 arquivos de 10 MB). Guarda só falhas do próprio app, sem SIP e sem senha; é o primeiro lugar para olhar quando algo não abre.
- A interface roda isolada (`contextIsolation`, `sandbox`, CSP) e só fala com o sistema pelos canais de `src/preload`.

## Licença

[MIT](LICENSE).
