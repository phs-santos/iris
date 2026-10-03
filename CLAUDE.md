# Íris: guia para o agente

Softphone desktop de testes de telefonia (Electron + Vue 3 + Pinia + easy-sipjs). O [README.md](README.md) descreve o produto, os comandos e a estrutura de pastas. Leia-o antes de mexer. Este arquivo diz **onde o projeto está, o que fazer a seguir e como trabalhar aqui**.

Documentos de referência em [docs/](docs/). O projeto se chamava "SIP Bench", e esse é o nome que aparece neles.

- [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md): é **a fonte da verdade**. Tem os 37 RF e os 20 RNF com prioridade, marco e critério de aceitação, além da arquitetura, do plano de entrega (M0 a M4), da estratégia de testes, dos riscos e das decisões. É uma cópia do Claude Doc de 03/10/2026; os dois diagramas embutidos (arquitetura e cronograma) não vieram na exportação.
- [docs/CONCEITO.html](docs/CONCEITO.html): o conceito visual inicial (telas, fluxos), anterior à decisão pelo desktop. Serve de referência de interface, não de escopo.
- [docs/SEGURANCA.md](docs/SEGURANCA.md): revisão de segurança do M4.

Quando o código e a especificação divergirem, siga a especificação e avise o usuário. Se algo não estiver em nenhum desses documentos, pergunte ao usuário em vez de inventar o escopo.

## Estado (03/10/2026)

- **M0 a M3 concluídos.** O README lista o que cada RF já faz.
- **M4 em andamento.** Já feito: revisão de segurança ([docs/SEGURANCA.md](docs/SEGURANCA.md)) e revisão de acessibilidade (RNF-12, `test:a11y`).
- Typecheck, testes de unidade, Prettier e licenças passam.

## Próximos passos, em ordem

Faça um passo de cada vez, com um commit por passo. Marque o item aqui quando ele terminar.

1. **[x] RNF-05 (recursos).** Fechado em 03/10/2026 com a CPU aprovada e a memória reprovada no macOS, por decisão do usuário.
    - CPU ociosa com 10 contas registradas: 0,1% (limite de 2%).
    - Memória com 10 contas e 1 chamada: de 331 a 389 MB no macOS com tela retina (limite de 300 MB). Veja as pendências conhecidas.
    - `npm run test:resources` mede os dois e roda no CI (job `e2e`). Ele falha na memória no macOS e no Linux do CI (350 MB por PSS); no CI o passo tem `continue-on-error` para não bloquear.
2. **[ ] RF-35 (atualização automática).** O código está pronto: `electron-updater` com GitHub Releases em `phs-santos/iris` (repositório público), canais estável e beta, e a tela "Atualização".
    - Onde está: regras em `src/shared/update.ts` (com `tests/updater.test.ts`), ligação com o Electron em `src/main/updater.ts`, tela em `UpdateDialog.vue`, `publish` no `electron-builder.yml`.
    - Restrições que valem: sem atualizar no modo CLI, sem baixar nada sem o usuário pedir e com a verificação de assinatura mantida.
    - Já conferido: o app empacotado do macOS consulta o repositório (hoje responde "No published versions on GitHub").
    - **Falta para marcar:** ver uma versão nova ser baixada e aplicada ao reiniciar (o critério de aceitação). Precisa de dois releases publicados (instalar o primeiro, atualizar para o segundo). Dá para fazer no Windows ou no AppImage; no macOS só depois da assinatura (passo 3).
3. **[ ] RNF-17 (instaladores assinados).** **Bloqueado.** Depende do usuário fornecer o Apple Developer ID (assinar e notarizar) e o certificado de assinatura para Windows. Enquanto isso não chegar, não tente contornar. Hoje o macOS usa assinatura ad-hoc (`resetAdHocDarwinSignature`).
4. **[ ] RNF ainda sem cumprimento.** Este levantamento foi feito comparando a especificação com o código em 03/10/2026. Confirme cada item antes de começar:
    - **RNF-13:** os textos da interface estão fixos nos componentes. A especificação pede arquivos de tradução (pt-BR, prontos para inglês). É a maior lacuna.
    - **RNF-14:** não há log interno do app em arquivo rotativo (5 × 10 MB na pasta de dados).
    - **RNF-15:** não há lint (ESLint) nem relatório de cobertura no CI. A meta é 70% ou mais na camada de domínio.
    - **RNF-06:** a reconexão usa o `autoReconnect` do easy-sipjs. Falta a espera crescente com limite de tentativas configurável e o teste que derruba o contêiner do PBX.
    - **RNF-04:** falta medir no CI a abertura (≤ 3 s) e o registro (≤ 2 s). A resposta da interface (≤ 100 ms) já é medida em `load.mjs`.
    - **RNF-01:** os testes e2e rodam só em Linux. A especificação pede smoke test nos três sistemas.
    - **RNF-02:** falta o checklist manual com FreeSWITCH e Kamailio.
    - **RNF-17:** além da assinatura, falta o `.deb`, que depende de repositório e página nos metadados (veja `electron-builder.yml`).
5. **[ ] Entregas do M4 que não são código:** o guia de uso e o teste com 3 pessoas (RNF-11: primeira chamada em até 2 minutos). O agente prepara o roteiro e o guia; o teste em si é com o usuário.
6. **[ ] Fechar o M4.** Critério de saída: todos os RF/RNF essenciais e importantes aprovados, sem defeito crítico aberto. Atualize o "Estado atual" do README, que ainda diz "M0 a M3" e "RNF-17 fica para o M4", e as pendências do `docs/SEGURANCA.md`.

**Fora do 1.0** (não faça sem o usuário pedir): RF-20 (early media), RF-27 (BLF), RF-34 (atalhos globais) e RF-36 (gravação). O RF-31 também era "depois", mas já foi feito.

**Decisões em aberto na especificação** (pergunte ao usuário, não decida sozinho): quem providencia os certificados e quais PBX além do Asterisk entram nos testes automáticos. Já decidido: o nome é Íris, a licença é MIT (arquivo `LICENSE`) e os instaladores e atualizações ficam no GitHub Releases.

Pendências conhecidas, que não precisam ser feitas agora:
- RNF-05, memória: de 331 a 389 MB no macOS com tela retina, contra o limite de 300 MB. O heap JS fica em 10 MB; o peso está no processo de GPU (150 a 190 MB durante a chamada) e na memória nativa da interface. Só abrir o app já custa de 180 a 260 MB. Desligar a aceleração de GPU não resolve.
- A primeira conexão não tenta de novo: com muitas contas no mesmo host, o Chromium abre os WebSockets um de cada vez, e a última da fila pode passar dos 5 s do SIP.js e ficar em erro (`1006`). Entra no RNF-06.
- Os testes e2e rodam o app sem empacotar, e os fuses impedem o Playwright de abrir o app empacotado. Antes de um release, abra o app empacotado e **olhe a janela**: a tela em branco do Keychain passou por todos os testes. Para inspecionar, gere um pacote de diagnóstico com `npx electron-builder --dir -c.electronFuses.enableNodeCliInspectArguments=true -c.directories.output=<pasta>` e abra com `electron.launch({ executablePath })`.
- No macOS sem assinatura, o Keychain pede a senha de login a cada build novo ("Iris Safe Storage"). O cofre usa as funções assíncronas do `safeStorage` para não travar a janela.
- O terminal do VSCode exporta `ELECTRON_RUN_AS_NODE=1`, e os testes e2e falham com "Process failed to launch". Rode com `env -u ELECTRON_RUN_AS_NODE`.
- Fechar o app no meio de uma chamada de teste deixa canais presos no Asterisk, e o `test:pbx` seguinte falha. Limpe com `docker exec iris-asterisk-1 asterisk -rx 'channel request hangup all'`.
- `grantFileProtocolExtraPrivileges` continua ligado. Para desligar, a interface teria que ser servida por um protocolo próprio (`app://`).
- Abrir a issue do `transport=wss` no easy-sipjs. O patch fica em `patches/`, e o motivo está no README.
- No Docker Desktop do macOS, o DTMF por RTP às vezes perde pacotes. O problema é do ambiente, não do app.

## Releases

- O repositório é público: `github.com/phs-santos/iris`. A primeira versão pública é a 1.0.0 (decisão do usuário em 03/10/2026, com o M4 ainda aberto e os instaladores sem assinatura).
- Uma tag `v` + versão dispara `.github/workflows/release.yml`, que gera os instaladores dos três sistemas e cria um release **em rascunho**. Publicar o rascunho é com o usuário. O passo a passo está no README, em "Atualização automática".
- Dar push na `main` e criar tag só com autorização do usuário para aquele release.

## Como trabalhar aqui

- **Idioma:** código, comentários, interface, mensagens de teste, commits e documentação em **português**. Escreva frases simples, sem jargão desnecessário.
- **Commits:**
    - título curto, com o marco e/ou o requisito: `M4: …`, `RF-31: …`, `… (RNF-05)`;
    - no corpo, em lista com `-`, o que mudou e por quê, e por último os testes;
    - termine com a linha `Co-Authored-By`;
    - só faça o commit quando o usuário pedir.
- **Requisitos no código:** cite o RF/RNF no comentário quando ele explica uma decisão, por exemplo `// … (RNF-19)`. Comente o *porquê*, com a mesma densidade do código ao redor.
- **Formato:** Prettier, com 4 espaços, sem ponto e vírgula, aspas simples e 120 colunas. Rode `npm run format` antes do commit.
- **Antes de dar algo por pronto:** rode `npm run typecheck`, `npm test` e `npm run format:check`. Se mexer na interface, rode também `npm run test:e2e` e `npm run test:a11y`. Se mexer no SIP, rode `test:pbx` com o Asterisk. Informe o que rodou e o que não rodou.
- **Arquitetura que deve ser mantida:**
    - a interface só conhece `SipEngine` (`src/renderer/src/sip/engine.ts`, RNF-16). O motor real é `easysip-engine.ts`; o simulado é `mock-engine.ts`. Recursos novos entram nos dois;
    - o IPC passa só pelos canais fixos de `src/preload`, registrados com `handle`/`on` de `src/main/ipc-guard.ts`, e os argumentos são conferidos (veja `docs/SEGURANCA.md`);
    - nada de `v-html`, `innerHTML` ou `eval`. Senhas nunca vão para log nem para exportação (RNF-10);
    - mudança de formato em `accounts.json`, `settings.json` ou `scenarios.json` precisa de migração (RNF-19).
- **Testes e2e:**
    - são scripts Playwright em `tests/e2e/*.mjs`;
    - usam `IRIS_USER_DATA` (pasta temporária) e `IRIS_FAKE_MEDIA=1`;
    - `PBX_WS` aponta para o Asterisk. O plano de discagem está no README.
- **README:** quando um requisito terminar, atualize a tabela "Estado atual" e, se houver comando novo, a seção "Testes".
