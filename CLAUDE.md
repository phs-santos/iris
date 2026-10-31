# Íris: guia para o agente

Softphone desktop de testes de telefonia (Electron + Vue 3 + Pinia + easy-sipjs e um motor SIP próprio). O [README.md](README.md) descreve o produto, a tela, os comandos e a estrutura de pastas. Leia-o antes de mexer. Este arquivo diz **onde o projeto está, o que fazer a seguir e como trabalhar aqui**.

Documentos de referência em [docs/](docs/). O projeto se chamava "SIP Bench", e esse é o nome que aparece nos mais antigos.

- [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md): é **a fonte da verdade**. Tem os RF e os RNF que valem, com prioridade, marco e critério de aceitação, a seção "Retirados em 29/10/2026" (o que saiu na 2.0 e por quê), a arquitetura, o plano de entrega (M0 a M4), a estratégia de testes, os riscos e as decisões. Nasceu de um Claude Doc de 03/10/2026; os dois diagramas embutidos (arquitetura e cronograma) não vieram na exportação.
- [docs/superpowers/specs/2026-10-29-iris-mais-simples-design.md](docs/superpowers/specs/2026-10-29-iris-mais-simples-design.md): o desenho da 2.0 (uma tela só). Serve de referência para a tela e para o que saiu.
- [docs/CONCEITO.html](docs/CONCEITO.html): o conceito visual inicial, de antes da 2.0. Só referência histórica.
- [docs/SEGURANCA.md](docs/SEGURANCA.md): revisão de segurança, com os canais de IPC e as pendências.

Quando o código e a especificação divergirem, siga a especificação e avise o usuário. Se algo não estiver em nenhum desses documentos, pergunte ao usuário em vez de inventar o escopo.

## Estado (31/10/2026)

- **A 2.0.0 foi publicada em 31/10/2026.** Ela deixou a Íris mais simples, a pedido do usuário: o uso real é ligar escolhendo a conta e, de vez em quando, depurar uma chamada. Ver a especificação da 2.0 e a seção "Retirados" da especificação.
- **M0 a M3 concluídos. M4 em andamento.** Já feito: revisão de segurança, revisão de acessibilidade (RNF-12, `a11y.mjs`), log interno (RNF-14), reconexão (RNF-06), lint e cobertura (RNF-15), fumaça do app empacotado (RNF-01, RNF-04) e tradução dos componentes (RNF-13).
- **Uma tela só** (`src/renderer/src/components/shell/`): `IconRail` (conta atual e Ajustes), `AccountPicker` (seletor agrupado por servidor, busca e filtro por etiqueta), `DialPanel` e `ContactSuggestions` (discador com sugestão dos contatos da conta), `CallsPanel`, `CallRow` e `IncomingRow` (chamadas de todas as contas), `AccountDetails` (detalhes da conta sem chamadas) e `DebugDrawer` (gaveta com `LogPane` nas abas SIP e Log, `FlowPane` e `HealthPane`).
- **Janelas:** `AccountForm.vue` (nome, etiquetas, servidor, ramal e senha; o resto em Avançado), `ServerDialog.vue` (servidor, com Testar por `sip:probe`), `ContactsDialog.vue` (contatos de uma conta), `TagsField.vue` e `settings/` (Ajustes: Áudio com `CodecsList`, Aparência, Servidores, `TagsSection`, Conexão, Notificações, Certificados, Importar e exportar, Atualização e Sobre).
- **Regras novas da 2.0 em `src/shared/`:** `tags.ts` (etiquetas, `tags.json`), `codecs.ts` (ordem dos codecs do SIP puro, `settings.codecs`), `registration.ts` (contagem da renovação), `picker.ts` (filtro, grupos e iniciais do seletor). O PBX simulado é um servidor fixo (`SIMULATED_SERVER_ID` em `servers.ts`).
- **Dados no esquema 2:** todo arquivo leva `schemaVersion: 2`. Na primeira abertura da 2.0, um arquivo sem isso é de versão anterior e a Íris apaga tudo (contas, servidores, contatos, preferências, senhas, chave local e os órfãos `history.json`, `scenarios.json`, `sdr.json`, `messages.json`), por decisão do usuário em 30/10/2026 ("pode descartar tudo, precisa migrar não"). Daqui em diante, mudança de formato tem migração (RNF-19).
- **Testes:** `npm run test:e2e` (`scripts/e2e.mjs`) roda os testes de tela: smoke, a11y, senhas, arquivos, notificacoes, contatos, toques e chamada. O `chamada.mjs` é a rede de segurança: no simulado sempre e, com `PBX_WS`, também contra o Asterisk (registro UDP, ligar, ordem dos codecs, DTMF, espera, transferência, desligar).
- **Saiu depois da 2.0.0, em 31/10/2026, a pedido do usuário:** o guia de uso dentro do app (tela, texto, capturas, F1) e os testes de tela antigos contra o Asterisk (`asterisk.mjs`, `sip-puro.mjs`, `reconexao.mjs`, `resources.mjs`), que usavam a tela da 1.x.

**Retirados na 2.0** (não traga de volta sem o usuário pedir): histórico, cenários, linha de comando e JUnit, monitor, modo SDR, mensagens, carga, ajuda da IA, vídeo, PCAP, requisição SIP manual, BLF e correio de voz, áudio ao atender, modos escondidos, modo Telefone, primeiros passos, paleta de comandos, inglês, atalhos globais e botões de mídia, links `tel:`, perfil e as 6 paletas, discagens rápidas da conta e o guia. O motivo de cada um está na especificação, seção "Retirados em 29/10/2026". **Cenários** devem voltar um dia, repensados: a barra de ícones já tem lugar para eles.

## Próximos passos, em ordem

Faça um passo de cada vez, com um commit por passo. Marque o item aqui quando ele terminar.

1. **[x] RNF-05 (recursos).** Fechado em 03/10/2026 com a CPU aprovada e a memória reprovada no macOS, por decisão do usuário.
    - CPU ociosa com 10 contas registradas: 0,1% (limite de 2%).
    - Memória com 10 contas e 1 chamada: de 331 a 389 MB no macOS com tela retina (limite de 300 MB). Veja as pendências conhecidas.
    - O script que media (`resources.mjs`) saiu em 31/10/2026, porque usava a tela antiga. Para medir de novo, use o Monitor de Atividade (ou o `ps`) com o app empacotado.
2. **[ ] RF-35 (atualização automática).** O código está pronto: `electron-updater` com GitHub Releases em `phs-santos/iris` (repositório público), canais estável e beta, e a seção Atualização dos Ajustes.
    - Onde está: regras em `src/shared/update.ts` (com `tests/updater.test.ts`), ligação com o Electron em `src/main/updater.ts`, tela em `settings/UpdateSection.vue`, `publish` no `electron-builder.yml`.
    - Restrições que valem: sem baixar nada sem o usuário pedir e com a verificação de assinatura mantida.
    - **macOS sem assinatura:** o atualizador padrão recusa a versão nova ("Code signature … did not pass validation"). Por isso a própria Íris atualiza o macOS (passo 3).
    - **Falta para marcar:** ver uma versão nova ser baixada e aplicada ao reiniciar (o critério de aceitação), no Windows ou no AppImage.
3. **[ ] RNF-17 (instaladores assinados).** **Bloqueado.** Em 04/10/2026 o usuário decidiu não pagar a conta Apple Developer. No macOS, a instalação recomendada é `scripts/install-macos.sh` (curl, sem a marca de quarentena, conferindo o SHA-512 do `latest-mac.yml`), e a atualização do macOS é feita pela própria Íris (`src/main/mac-update.ts`: baixa o .zip, confere o SHA-512, troca o app e reinicia; regras em `src/shared/mac-update.ts`), com o comando do Terminal como plano B na tela. Isso foi autorizado por ele e não conta como contornar a assinatura. Depende do usuário fornecer o Apple Developer ID (assinar e notarizar) e o certificado de assinatura para Windows. Enquanto isso não chegar, não tente contornar. Hoje o macOS usa assinatura ad-hoc (`resetAdHocDarwinSignature`).
4. **[ ] RNF ainda sem cumprimento:**
    - **RNF-02:** falta o checklist manual com FreeSWITCH e Kamailio.
    - **RNF-17:** falta só a assinatura (passo 3). O `.deb` sai no `npm run dist` do Linux e no release; a instalação foi conferida num contêiner Ubuntu 24.04, mas o app instalado por `.deb` ainda não foi aberto numa máquina com tela.
    - **RNF-06:** feito, mas o teste que derrubava o contêiner do PBX (`reconexao.mjs`) saiu em 31/10/2026. Ficam os testes de unidade (`tests/reconnect.test.ts`). Se a reconexão mudar, confira à mão: registre uma conta UDP no Asterisk, pare o contêiner e suba de novo.
5. **[ ] Teste com 3 pessoas (RNF-11: primeira chamada em até 2 minutos).** O guia dentro do app saiu em 31/10/2026; a tela tem que se explicar sozinha. **Falta:** o roteiro do teste (o agente prepara) e o teste em si (com o usuário).
6. **[ ] Fechar o M4.** Critério de saída: todos os RF/RNF essenciais e importantes que ficaram na especificação aprovados, sem defeito crítico aberto. Atualize o "Estado atual" do README e as pendências do `docs/SEGURANCA.md`.

**RF-39 (SIP puro com motor próprio em TypeScript), pedido pelo usuário em 04/10/2026: feito.**
- Onde está: `src/main/sip/` (`message.ts`, `digest.ts`, `transport.ts`, `user-agent.ts`, `call.ts`, `sdp.ts`, `rtp.ts`, `srtp.ts`, `g711.ts`, `g722.ts`, `codec.ts`, `resample.ts`, `recorder.ts`), canais de IPC em `src/main/native-sip.ts`, motor da interface em `src/renderer/src/sip/native-engine.ts` e `native-audio.ts`, alvo em `src/shared/sip-target.ts`. Testes de unidade: `tests/user-agent.test.ts` (PBX falso em memória), `transport.test.ts`, `media.test.ts`, `g722.test.ts`, `sip-core.test.ts`.
- Tem: registro, renovação, OPTIONS, chamadas com G.722, G.711 e Opus, DTMF por RTP (RFC 4733) ou SIP INFO, espera, transferência cega (REFER) e assistida (REFER com Replaces), SRTP por SDES (AES_CM_128_HMAC_SHA1_80, `Account.srtp` ou quando a chamada recebida vem cifrada), RTCP para o RTT e gravação em WAV.
- **Ordem dos codecs (RF-60):** vem de `settings.codecs` (`offerOrder` em `src/shared/codecs.ts`), lida pelo processo principal a cada `sip:start` e `sip:dial`; vale para a oferta do INVITE e para a resposta a uma chamada recebida. Padrão: G.722, PCMU, PCMA, Opus.
- **O microfone e o alto-falante do motor próprio trabalham a 16 kHz** (worklet e IPC com 320 amostras); a gravação e o medidor continuam a 8 kHz.
- **O que o RF-39 não tem** (não faça sem o usuário pedir): RTCP cifrado (com SRTP o RTT fica em 0), oferta tardia (INVITE sem SDP), temporizador de sessão (RFC 4028), DNS SRV no registro e DTLS-SRTP. O host vem do domínio ou do campo "Endereço:porta".
- O worklet é importado com `?url&no-inline`: embutido como `data:`, a CSP (`script-src 'self'`) recusa e o áudio não abre.

**Outros pontos que valem:**
- **RF-20 early media:** regra em `src/shared/ringback.ts`; o toque de quem liga é do app, o da biblioteca foi calado. Em WebSocket é opção da conta (`Account.earlyMedia`), desligada por padrão porque o SIP.js derruba a chamada se o PBX bifurcar; a opção chega ao SIP.js por um segundo trecho do patch do easy-sipjs.
- **RF-55 toques por conta** (`src/shared/ringtones.ts`, sintetizados) e volume do toque. Os botões de mídia do fone saíram na 2.0.
- **RF-51 servidores:** a conta guarda `serverId` e uma cópia dos dados de conexão, então o resto do código continua lendo a conta. Editar o servidor muda só os campos em que a conta tinha o valor antigo do servidor (`updateFromServer`). Um servidor em uso não pode ser apagado.
- **RF-50 contatos por conta:** `Contact.accountId`; o nome de quem liga vem só dos contatos da conta da chamada.
- **Asterisk de teste:** ramais e números no README. Ele não converte Opus: entre SIP puro e WebSocket, use o ramal 1021 (G.711). O Asterisk responde ao INVITE na ordem dele (PCMU primeiro), mesmo com a oferta começando por PCMA; por isso o `chamada.mjs` confere o PCMA no 200 OK que a **Íris** manda, não no que o Asterisk manda.
- Não visto numa máquina de verdade: o som dos toques e do toque local e a voz em G.722 ouvida por uma pessoa.

**Decisões em aberto na especificação** (pergunte ao usuário, não decida sozinho): quem providencia os certificados e quais PBX além do Asterisk entram nos testes automáticos. Já decidido: o nome é Íris, a licença é MIT (arquivo `LICENSE`) e os instaladores e atualizações ficam no GitHub Releases.

Pendências conhecidas, que não precisam ser feitas agora:
- RNF-05, memória: de 331 a 389 MB no macOS com tela retina, contra o limite de 300 MB (medido na 1.x). O heap JS fica em 10 MB; o peso está no processo de GPU (150 a 190 MB durante a chamada) e na memória nativa da interface. Só abrir o app já custa de 180 a 260 MB. Desligar a aceleração de GPU não resolve.
- Todo canal de IPC que a interface chama ao abrir tem que ser registrado **antes** de `createWindow()` e sem `await` na frente. A 1.0.4 foi publicada e recolhida em minutos porque o canal `update:info` só era registrado depois de rodar o `codesign`, e a falha dele impedia as contas de carregar. Antes de publicar, leia o log do app gerado pelo CI.
- Os testes e2e rodam o app sem empacotar, e os fuses impedem o Playwright de abrir o app empacotado. O `test:pacote` gera um pacote de diagnóstico (`dist-diag`, com o fuse de `--inspect` ligado) e abre esse. Antes de um release, abra também o app empacotado de verdade e **olhe a janela**: a tela em branco do Keychain passou por todos os testes.
- Senhas: ficam em `senhas.json` cifrado por `chave-local.bin`. **O cofre do sistema não é usado de jeito nenhum** (decisão do usuário em 04/10/2026): sem `safeStorage`, com `use-mock-keychain` e `password-store=basic` no Chromium e o fuse `enableCookieEncryption` desligado. Não volte a usar nenhum dos três. Arquivo de senhas ou chave estragados nunca são sobrescritos: vão para o lado e a tela avisa.
- **Testes longos no macOS ficam instáveis depois de horas de uso do Asterisk no Docker Desktop**: em 04/10/2026 os testes passaram a falhar em passos diferentes a cada execução, e recriar o contêiner melhorou só em parte. No CI Linux os mesmos testes passaram. Reinicie o Docker Desktop antes de concluir que há defeito.
- **Em aberto, sem causa conhecida:** em 04/10/2026, no pacote de diagnóstico do macOS, o registro de uma conta **WebSocket** falhou em 4 de 10 execuções com "Connect timed out" de 5 s do SIP.js, logo depois de testes que reiniciavam o contêiner do Asterisk. Depois não se repetiu, e sem empacotar nunca falhou. Antes do próximo release, cadastre uma conta WSS no app empacotado e veja se registra.
- As preferências (`settings.json`) só mudam por `settings:update` (interface) ou `updateSettings` (processo principal), que alteram um campo de cada vez numa fila. Não volte ao "ler tudo, mudar e gravar tudo": era assim que uma tela apagava a alteração da outra.
- Os testes de tela isolam a janela do mouse e do teclado de verdade da máquina (`isolarDoMouse` em `tests/e2e/helpers/tela.mjs`, com `setIgnoreMouseEvents` e `setFocusable(false)`). Sem isso, um clique de quem usa o computador caía na janela de teste e fechava o seletor no meio do teste.
- Num script que roda como módulo principal do Electron (`scripts/make-icons.mjs`), `await app.whenReady()` no topo do módulo trava para sempre. Use `app.whenReady().then(...)`.
- Testes de unidade de código do processo principal entram no `include` do `tsconfig.node.json` e no `exclude` do `tsconfig.web.json`.
- O terminal do VSCode exporta `ELECTRON_RUN_AS_NODE=1`, e os testes e2e falham com "Process failed to launch". O `npm run test:e2e` já tira a variável; para rodar um arquivo direto, use `env -u ELECTRON_RUN_AS_NODE`.
- Fechar o app no meio de uma chamada de teste deixa canais presos no Asterisk, e o `chamada.mjs` seguinte pode falhar. Limpe com `docker exec iris-asterisk-1 asterisk -rx 'channel request hangup all'`. O áudio do Asterisk de teste só tem 50 portas: depois de muitas chamadas, recrie o contêiner. Depois de editar `docker/asterisk/*.conf`, recrie com `--force-recreate`; no Docker Desktop ele pode ficar com o arquivo antigo truncado e subir sem nenhum transporte.
- `grantFileProtocolExtraPrivileges` continua ligado. Para desligar, a interface teria que ser servida por um protocolo próprio (`app://`).
- Abrir a issue do `transport=wss` no easy-sipjs. O patch fica em `patches/`, e o motivo está no README.
- No Docker Desktop do macOS, o DTMF por RTP às vezes perde pacotes. O problema é do ambiente, não do app.

## Releases

- O repositório é público: `github.com/phs-santos/iris`. A 2.0.1 (sem o guia dentro do app) foi preparada em 31/10/2026 e fica em rascunho até o usuário publicar. A versão pública atual é a **2.0.0**, publicada em 31/10/2026 (uma tela só, gaveta de depuração, cadastro mais curto, servidores e etiquetas, ordem dos codecs, contatos por conta; e a retirada de tudo o que está na lista acima). Ela apaga os dados das versões anteriores na primeira abertura. Antes dela ficou publicada a 1.9.0 (modos escondidos, modo SDR, áudio ao atender), e antes a 1.8.0 (links tel:, atalhos globais, toques, mensagens, inglês, early media, G.722 e vídeo), a 1.7.0 (notificações do sistema, tema claro), a 1.6.1 (sem o cofre de senhas do sistema), a 1.6.0, a 1.5.0 (SIP puro com motor próprio) e as anteriores. A 1.0.4 foi recolhida: tinha um erro de IPC que impedia as contas de carregar; a primeira publicada foi a 1.0.2. As tags `v1.0.0` e `v1.0.1` existem, mas os releases delas nunca foram publicados.
- Uma tag `v` + versão dispara `.github/workflows/release.yml`, que gera os instaladores dos três sistemas, abre o app empacotado (`pacote.mjs`) e cria um release **em rascunho**, com as notas de `.github/release-notes.md`. Publicar o rascunho é com o usuário. O passo a passo está no README, em "Atualização automática".
- Dar push na `main` e criar tag só com autorização do usuário para aquele release.

## Como trabalhar aqui

- **Idioma:** código, comentários, interface, mensagens de teste, commits e documentação em **português**. Escreva frases simples, sem jargão desnecessário. A interface é só em português (o inglês saiu na 2.0).
- **Commits:**
    - título curto, com o marco, a versão e/ou o requisito: `M4: …`, `2.0: …`, `RF-60: …`, `… (RNF-05)`;
    - no corpo, em lista com `-`, o que mudou e por quê, e por último os testes;
    - termine com a linha `Co-Authored-By`;
    - só faça o commit quando o usuário pedir.
- **Requisitos no código:** cite o RF/RNF no comentário quando ele explica uma decisão, por exemplo `// … (RNF-19)`. Comente o *porquê*, com a mesma densidade do código ao redor. Não cite requisito retirado.
- **Formato:** Prettier, com 4 espaços, sem ponto e vírgula, aspas simples e 120 colunas. Rode `npm run format` antes do commit.
- **Testes por publicação (decisão do usuário em 04/10/2026: "não precisa de todos esses testes em todas as publicações"):** no PR, o CI roda só a verificação rápida (formato, lint, licenças, typecheck, unidade e build) nos três sistemas; os testes de tela, com a chamada contra o Asterisk, rodam na `main` e sob pedido, sem bloquear; o release só gera, abre o app empacotado e cria os instaladores. Antes de publicar, rode localmente `npm run test:pacote` e os testes da área que mudou, não a bateria inteira.
- **Antes de dar algo por pronto:** rode `npm run typecheck`, `npm run lint`, `npm run test:coverage` e `npm run format:check`. Se mexer na interface, rode também `npm run test:e2e` (todos os testes de tela, ou `npm run test:e2e -- chamada a11y` para escolher). Se mexer no SIP, rode `PBX_WS=wss://127.0.0.1:8089/ws npm run test:e2e -- chamada` com o Asterisk de pé. Informe o que rodou e o que não rodou.
- **Arquitetura que deve ser mantida:**
    - a interface só conhece `SipEngine` (`src/renderer/src/sip/engine.ts`, RNF-16). Os motores são `easysip-engine.ts` (WebSocket), `native-engine.ts` (SIP puro) e `mock-engine.ts` (simulado). Recursos novos entram nos três;
    - o IPC passa só pelos canais fixos de `src/preload`, registrados com `handle`/`on` de `src/main/ipc-guard.ts`, e os argumentos são conferidos (veja `docs/SEGURANCA.md`);
    - texto de tela nunca fica fixo num componente (RNF-13): crie a entrada em `src/renderer/src/i18n/pt-BR.ts` e use `$t('grupo.nome')` no modelo ou `t()` no script. `scripts/check-i18n.mjs` roda no `npm run lint` e reprova texto fixo em `.vue` (não pega palavra solta em minúsculas). Ficam em português no código: as linhas do log de eventos (stores), as mensagens do processo principal, as notificações e a bandeja;
    - ícones da tela em `components/icons/Icon.vue` (SVG, sem emoji). O ícone do app tem fonte em SVG (`build/icon.svg`, `build/tray.svg`); os PNG saem de `npm run icons`;
    - nada de `v-html`, `innerHTML` ou `eval`. Senhas nunca vão para log nem para exportação (RNF-10);
    - mudança de formato em `accounts.json`, `servers.json`, `tags.json`, `contacts.json` ou `settings.json` precisa de migração a partir do esquema 2 (RNF-19);
    - **recurso novo que não seja ligar ou depurar** é conversa com o usuário antes: a 2.0 existe para a tela ficar simples.
- **Testes e2e:**
    - são scripts Playwright em `tests/e2e/*.mjs`, rodados por `scripts/e2e.mjs`;
    - os seletores ficam só em `tests/e2e/helpers/tela.mjs`; `abrir()` cria a pasta temporária (`IRIS_USER_DATA`), liga o microfone falso (`IRIS_FAKE_MEDIA=1`) e isola a janela do mouse;
    - o botão "Fechar" das janelas tem que ser procurado dentro do `dialog` e com `exact: true`;
    - `PBX_WS` liga a parte do `chamada.mjs` contra o Asterisk. O plano de discagem está no README.
- **Antes de um release:** rode `npm run test:pacote` e leia o log que ele imprime; ele abre o app empacotado, que os outros testes não abrem.
- **README:** quando um requisito terminar, atualize a tabela "Estado atual" e, se houver comando novo, a seção "Testes".
