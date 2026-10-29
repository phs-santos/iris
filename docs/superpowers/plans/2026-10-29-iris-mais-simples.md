# Íris 2.0.0 mais simples: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar da Íris tudo o que não é ligar e depurar, e refazer a Bancada como uma tela só, clara, densa e moderna, com contas num seletor, contatos por conta como sugestão, etiquetas, servidor em janela própria e ordem de codecs.

**Architecture:** Primeiro remover (de fora para dentro: telas, stores, IPC, armazenamento, testes), depois migrar os dados para o esquema 2 numa função pura testada, depois as regras novas em `src/shared/` (etiquetas, codecs, sugestões), e por último a interface nova em componentes pequenos. A interface continua só conhecendo `SipEngine` (RNF-16); os três motores recebem as mudanças.

**Tech Stack:** Electron, Vue 3 (`<script setup>`), Pinia, TypeScript estrito, Vitest, Playwright (`tests/e2e/*.mjs`), electron-vite, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-10-29-iris-mais-simples-design.md` (leia antes de cada tarefa). Esboços aprovados: `.superpowers/brainstorm/67562-1793284940/content/bancada-v6.html`, `bancada-v7.html`, `conta-servidor.html`, `conta-ajustes.html`.

## Global Constraints

- Tudo em português: código, comentários, interface, testes, commits. Frases simples.
- Prettier: 4 espaços, sem ponto e vírgula, aspas simples, 120 colunas (`npm run format`).
- Nenhum texto fixo em `.vue`: entrada em `src/renderer/src/i18n/pt-BR.ts`, `$t()`/`t()` (RNF-13). Só existe o catálogo pt-BR depois da Tarefa 5.
- IPC só por canais fixos em `src/preload` registrados com `handle`/`on` de `src/main/ipc-guard.ts`, argumentos conferidos.
- Canal de IPC que a interface chama ao abrir: registrado **antes** de `createWindow()`, sem `await` na frente.
- Nada de `v-html`, `innerHTML`, `eval`. Senha nunca em log nem exportação (RNF-10).
- `settings.json` só muda por `settings:update` / `updateSettings` (um campo de cada vez, em fila).
- Mudança de formato em `accounts.json`/`settings.json`/`contacts.json`/`servers.json`: migração (RNF-19).
- Testes de unidade de código do processo principal: no `include` do `tsconfig.node.json` e no `exclude` do `tsconfig.web.json`.
- e2e: `env -u ELECTRON_RUN_AS_NODE`, `IRIS_USER_DATA` temporário, `IRIS_FAKE_MEDIA=1`.
- Comentário cita o RF/RNF quando explica decisão; mesma densidade do código ao redor.
- Commits: título `2.0: …` ou com o requisito; corpo em lista com `-` (o que mudou e por quê, por último os testes); última linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Só faça o commit se o usuário autorizou a execução do plano com commits**; caso contrário, pare antes do commit e informe.
- Trabalhar na branch `iris-2.0`. Push, tag e apagar o rascunho da 1.9.0 só com autorização do usuário.
- Ao fim de cada tarefa: `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run format:check`. Tarefas de interface: também `npm run test:e2e` e `npm run test:a11y`. Informe o que rodou e o que não rodou.

## Review Focus

1. **Arquivo de contas da 1.8.0 com conta WebSocket, conta simulada e conta solta do servidor** → depois da migração todas as contas registram como antes, cada uma ligada a um servidor, nenhuma perdida, e a senha continua valendo (o id da conta não muda). Teste: `tests/migrate-2.test.ts` › "conta solta do servidor ganha servidor próprio sem perder conexão".
2. **Migração que falha no meio (arquivo de contas estragado)** → nenhum arquivo é apagado (`history.json` etc. só saem depois de as contas migrarem e serem gravadas). Teste: `tests/migrate-2.test.ts` › "não lista arquivos para apagar se as contas não migraram".
3. **Todos os codecs desmarcados ou lista com nome desconhecido em `settings.json`** → a oferta volta ao padrão `['G722','PCMU','PCMA','opus']`, nunca vazia. Teste: `tests/codecs.test.ts` › "lista vazia ou inválida volta ao padrão".
4. **Digitar no discador com teclado e mouse misturados, número com máscara (`+55 (11) 4000-1002`) ou nome com acento ("João" ao digitar "joao")** → a sugestão aparece e Enter liga o número do contato, não o texto digitado. Teste: `tests/contacts.test.ts` › "sugere por dígitos e por nome sem acento".
5. **Apagar uma etiqueta ou um servidor que contas usam** → etiqueta some das contas; servidor com contas não pode ser apagado (aviso), o simulado nunca. Testes: `tests/tags.test.ts` › "apagar etiqueta tira de todas as contas"; `tests/servers.test.ts` › "não apaga servidor em uso nem o simulado".

---

## Mapa de arquivos

**Saem (Tarefas 2 a 5):** `components/sdr/`, `MessagesPane.vue`, `HistoryPane.vue`, `ScenariosPane.vue`, `scenarios/`, `LoadDialog.vue`, `AiDialog.vue`, `SipRequestDialog.vue`, `CallVideo.vue`, `PhoneView.vue`, `FirstSteps.vue`, `CommandPalette.vue`, `settings/{AiSection,ModesSection,ProfileSection,ShortcutsSection}.vue`, `stores/{sdr,messages,history,scenarios,monitor,ai}.ts`, `sip/mock-video.ts`, `i18n/{en,guide.en}.ts`, `src/shared/{sdr,messages,history,monitor,cli,ai,load,presence,modes,links,shortcuts}.ts`, `src/main/{cli,ai,load*,pcap?,links?,shortcuts?}.ts` (conferir nomes com `ls src/main`), `src/renderer/src/cli.ts`, testes de unidade e e2e correspondentes, scripts do `package.json` e passos do CI correspondentes.

**Novos:**
- `src/shared/migrate-2.ts`: migração pura do esquema 1 para o 2.
- `src/shared/tags.ts`: etiquetas (tipo, validação, aplicar/apagar).
- `src/shared/codecs.ts`: ordem e escolha dos codecs.
- `src/renderer/src/stores/tags.ts`
- `src/renderer/src/components/shell/IconRail.vue`, `AccountPicker.vue`, `DialPanel.vue`, `ContactSuggestions.vue`, `CallsPanel.vue`, `CallRow.vue`, `IncomingRow.vue`, `AccountDetails.vue`, `DebugDrawer.vue`
- `src/renderer/src/components/ServerDialog.vue`, `ContactsDialog.vue`, `settings/TagsSection.vue`, `settings/CodecsList.vue`
- `src/renderer/src/components/icons/Icon.vue` (ícones SVG por nome)
- `tests/e2e/chamada.mjs`, `tests/e2e/helpers/tela.mjs`
- `tests/migrate-2.test.ts`, `tests/tags.test.ts`, `tests/codecs.test.ts`, `tests/servers.test.ts`

**Mudam:** `src/shared/types.ts`, `src/shared/servers.ts`, `src/shared/contacts.ts`, `src/main/storage.ts`, `src/main/index.ts`, `src/main/native-sip.ts`, `src/main/sip/call.ts`, `src/main/sip/user-agent.ts`, `src/preload/index.ts`, `src/renderer/src/App.vue`, `stores/{accounts,calls,contacts,servers,preferences,log}.ts`, `AccountForm.vue`, `settings/SettingsDialog.vue` e seções que ficam, `styles.css`, `i18n/pt-BR.ts`, `i18n/guide.pt-BR.ts`, `scripts/check-i18n.mjs`, `docs/ESPECIFICACAO.md`, `README.md`, `CLAUDE.md`, `package.json`, `.github/workflows/ci.yml`, `.gitignore`.

---

### Task 1: Branch, `.gitignore` e teste de chamada pela tela

Garante a cobertura de chamada real antes de tirar `scenarios.mjs` e `cli.mjs`.

**Files:**
- Modify: `.gitignore` (acrescentar `graphify-out/` e `.superpowers/`)
- Create: `tests/e2e/helpers/tela.mjs`, `tests/e2e/chamada.mjs`
- Modify: `package.json` (script `test:chamada`), `.github/workflows/ci.yml` (passo novo no job e2e, simulado e Asterisk)

**Interfaces:**
- Produces: `tela.mjs` exporta `abrir(opts) → { app, page }`, `escolherConta(page, nome)`, `discar(page, numero)`, `chamadaAtiva(page, numero) → Locator`, `acao(page, numero, nome)` ('Mudo', 'Espera', 'DTMF', 'Transferir', 'Desligar'). Todos os seletores do teste ficam só neste arquivo, para as Tarefas 9 a 12 trocarem num lugar só.

- [ ] **Step 1:** `git switch -c iris-2.0`; acrescentar as duas linhas ao `.gitignore`.
- [ ] **Step 2:** Escrever `chamada.mjs`. No modo simulado: registra a conta de exemplo, liga para 8000, manda DTMF `123`, põe em espera e retoma, desliga; liga para 1002 e faz transferência cega para 1003. Com `PBX_WS` (Asterisk): o mesmo com uma conta **UDP** no ramal 2001 ligando para 2002. Asserções: a chamada aparece "em chamada" em até 5 s; o log do SIP contém `INFO` ou o evento DTMF; "em espera" aparece e some; a chamada some depois de desligar; na transferência, o NOTIFY final 200 aparece no log.
- [ ] **Step 3:** Rodar com a tela atual: `env -u ELECTRON_RUN_AS_NODE npm run test:chamada`. Esperado: PASS (seletores apontando para a Bancada atual).
- [ ] **Step 4:** Commit `2.0: teste de chamada pela tela antes de tirar os cenários`.

### Task 2: Tirar SDR, Mensagens e Histórico

**Files:** apagar `components/sdr/`, `MessagesPane.vue`, `HistoryPane.vue`, `stores/{sdr,messages,history}.ts`, `src/shared/{sdr,messages,history}.ts`, `tests/{sdr,messages,history}.test.ts`, `tests/e2e/{sdr,mensagens}.mjs`; editar `App.vue`, `types.ts` (tipos e canais), `preload/index.ts`, `main/index.ts`, `storage.ts` (`load/saveSdr`, `load/saveMessages`, `load/saveHistory`), `stores/calls.ts` (gravação no histórico), `SipEngine` (`sendMessage`, evento `message`) nos três motores e em `native-sip.ts`/`user-agent.ts` (MESSAGE de saída e de entrada: responder 405 ao MESSAGE recebido), i18n, guia, `package.json`, CI.

**Interfaces:**
- Produces: `SipEngine` sem `sendMessage` nem evento `message`.

- [ ] **Step 1:** Apagar e editar até `npm run typecheck` passar; `grep -rniE "sdr|messages?Pane|history" src tests` sem resto (exceto `resample.ts`, que usa "history" em outro sentido).
- [ ] **Step 2:** Teste em `tests/user-agent.test.ts`: "MESSAGE recebido responde 405" (o PBX falso manda MESSAGE e recebe 405).
- [ ] **Step 3:** `npm run test:coverage`, `npm run lint`, `npm run test:chamada`. Esperado: PASS.
- [ ] **Step 4:** Commit `2.0: tira SDR, mensagens e histórico (RF-59, RF-54, RF-40)`.

### Task 3: Tirar Cenários, linha de comando, JUnit, monitor e áudio dos cenários

**Files:** apagar `ScenariosPane.vue`, `scenarios/`, `lib/scenarios.ts`, `stores/{scenarios,monitor}.ts`, `src/shared/{monitor,cli}.ts`, `src/main/cli.ts`, `src/renderer/src/cli.ts`, `tests/{scenarios,cli,monitor,attended-transfer?}.test.ts` (o de transferência assistida: se só usa o executor de cenários, reescrever o essencial sobre o motor simulado em `tests/mock-engine.test.ts`), `tests/e2e/{scenarios,cli,monitor,audio}.mjs`, `tests/helpers/mock-driver.ts` se só os cenários usam; editar `types.ts` (Scenario*, `CliConfig`), `storage.ts` (`load/saveScenarios`), `main/index.ts` (modo CLI e argumentos), `preload`, i18n, guia, `package.json`, CI (tirar os 4 passos de cenários/CLI/áudio e manter `chamada.mjs`).
- `NativeCallAction` `play`/`stopPlay` e `EngineCall` correspondentes saem se nada mais usa depois da Tarefa 4 (decidir lá).

- [ ] **Step 1:** Apagar e editar até `npm run typecheck` passar; `grep -rniE "scenario|cenario|junit|monitor|--conta|--relatorio" src tests .github` sem resto.
- [ ] **Step 2:** `npm run test:coverage`, `npm run lint`, `npm run test:chamada`. Esperado: PASS.
- [ ] **Step 3:** Commit `2.0: tira cenários, linha de comando, JUnit e monitor (RF-28 a 31, 41, 43, 49)`.

### Task 4: Tirar carga, IA, PCAP, requisição manual, BLF/MWI, áudio ao atender e vídeo

**Files:** apagar `LoadDialog.vue`, `AiDialog.vue`, `SipRequestDialog.vue`, `CallVideo.vue`, `sip/mock-video.ts`, `stores/ai.ts`, `settings/AiSection.vue`, `src/shared/{ai,load,presence}.ts`, `src/main/{ai,load…}.ts`, `src/main/sip/pcap.ts`, testes de unidade e e2e correspondentes (`ai`, `load`, `presence`, `video`, `atendimento`, `carga-sip`, `load.mjs`); editar `types.ts` (`Account.blf`, `answerAudio`, `NativeSipConfig.blf`, eventos `presence`/`mwi`, `SipManualRequest`, `videoInputId`, `ai`), `user-agent.ts` (SUBSCRIBE de BLF/MWI, PCAP, pedido manual; NOTIFY de `message-summary` não solicitado: responder 200 e ignorar), `SipEngine` (`video`, `videoStreams`, `DialOptions.video`, `answer({video})`, eventos `presence`/`mwi`) nos três motores, `easysip-engine.ts` (sem vídeo), `docker/asterisk` (pode manter `hint` e `vp8`, não atrapalham), i18n, guia, `package.json`, CI.
- Se `play`/`stopPlay` ficarem sem uso, saem de `NativeCallAction`, `call.ts` e `EngineCall`.

- [ ] **Step 1:** Apagar e editar até `npm run typecheck` passar; `grep -rniE "blf|mwi|presence|pcap|answerAudio|video|camera|openrouter|carga" src tests` sem resto (exceto `resample`/`audio` se o termo for outro sentido).
- [ ] **Step 2:** `npm run test:coverage`, `npm run lint`, `npm run test:chamada`, `npm run test:sip` com o Asterisk. Esperado: PASS.
- [ ] **Step 3:** Commit `2.0: tira carga, IA, PCAP, pedido manual, BLF, áudio ao atender e vídeo`.

### Task 5: Tirar modo Telefone, modos, primeiros passos, paleta, inglês, atalhos globais, links e perfil

**Files:** apagar `PhoneView.vue`, `PhoneIcon.vue` (se só o Telefone usa), `FirstSteps.vue`, `CommandPalette.vue`, `settings/{ModesSection,ProfileSection,ShortcutsSection}.vue`, `i18n/{en,guide.en}.ts`, `src/shared/{modes,links,shortcuts}.ts` e os do main correspondentes, testes `{links,shortcuts}.test.ts`, e2e `{modos,idioma,atalhos}.mjs`; editar `App.vue` (canal `window:mode`, `IRIS_MODES`, área secreta, chave do idioma), `i18n/index.ts` (só pt-BR), `tests/i18n.test.ts` (só confere o pt-BR e o guia pt-BR), `appearance.ts` (só `theme: 'light'|'dark'|'system'` e `accent: string`), `types.ts` (`profile`, `modes`, `links`, `shortcuts`, `mediaKey`), `main/index.ts` (protocolo `tel:`, `globalShortcut`, tecla de mídia), `electron-builder.yml` (`protocols`, se houver), `package.json`, CI.

- [ ] **Step 1:** Teste em `tests/appearance.test.ts`: "aparência aceita só tema e cor de destaque" (`isAppearance({ theme: 'light', accent: '#2563eb' })` true; com `palette` antigo, false).
- [ ] **Step 2:** Rodar: FAIL.
- [ ] **Step 3:** Apagar e editar até typecheck e o teste passarem. Tema padrão: `light`.
- [ ] **Step 4:** `npm run test:coverage`, `npm run lint`, `npm run test:chamada`. Esperado: PASS.
- [ ] **Step 5:** Commit `2.0: tira modo Telefone, modos, primeiros passos, paleta, inglês, atalhos e links`.

### Task 6: Migração para o esquema 2

Os tipos novos e a função pura que leva os dados da 1.8.0 (e os restos da 1.9.0) para a 2.0.0.

**Files:**
- Create: `src/shared/migrate-2.ts`, `tests/migrate-2.test.ts`
- Modify: `src/shared/types.ts`, `src/shared/servers.ts`, `src/shared/contacts.ts`, `src/main/storage.ts`, `src/main/index.ts` (rodar a migração antes de `createWindow()`, sem atrasar o registro dos canais)

**Interfaces:**
- Produces (em `types.ts`):
  ```ts
  export interface Account {            // AccountsFile.schemaVersion: 2
      id: string; name: string; color: string
      serverId: string                  // obrigatório; SIMULATED_SERVER_ID para o simulado
      tagIds: string[]
      extension: string; authUsername?: string; displayName?: string
      // cópia dos dados de conexão do servidor (RF-51), como hoje:
      domain: string; transport: AccountTransport; wssUrl: string; sipServer?: string; preset: Preset
      iceServers: string; srtp?: boolean; earlyMedia?: boolean
      ringtone?: RingtoneId; dtmfMode: DtmfMode; autoRegister: boolean
      autoAnswer: { enabled: boolean; delayMs: number }
  }
  ```
  Saem `provider`, `rawSipLog`, `simulated`, `quickDials`, `blf`, `answerAudio`. `preset` sai da tela mas continua no servidor e na cópia da conta, porque o `easysip-engine.ts:334` usa (o formulário do servidor não mostra; vale `'asterisk'` para servidor novo). O motor simulado passa a ser escolhido por `account.serverId === SIMULATED_SERVER_ID`.
- Produces (em `servers.ts`): `SIMULATED_SERVER_ID = 'simulado'`, `simulatedServer(): SipServer` (nome "PBX simulado", domínio `demo.local`, transporte `udp`), `SipServer` com `outboundProxy?: string`, `dtmfMode?: DtmfMode`.
- Produces (em `contacts.ts`): `Contact = { id; name; number; notes?; accountId: string }` (obrigatório; saem `company`, `favorite`).
- Produces (em `migrate-2.ts`):
  ```ts
  export interface V1Data { accounts: unknown[]; servers: unknown[]; contacts: unknown[]; settings: Record<string, unknown> }
  export interface V2Data { accounts: Account[]; servers: SipServer[]; contacts: Contact[]; settings: Settings }
  export const ORPHAN_FILES = ['history.json', 'scenarios.json', 'sdr.json', 'messages.json'] as const
  export function migrateToV2(v1: V1Data): V2Data
  ```
  Regras: servidor para cada combinação diferente de `domain|transport|wssUrl|sipServer|iceServers|srtp` das contas sem `serverId` ou soltas (`!matchesServer`), com nome `${domain} · ${TRANSPORTE}`; conta `simulated` → `SIMULATED_SERVER_ID`; contatos sem `accountId` → id da primeira conta (sem contas: descartados); `settings` perde `ai`, `profile`, `modes`, `links`, `shortcuts`, `mediaKey`, `videoInputId`, e `appearance` vira `{ theme, accent }` (tema antigo mantido; sem tema: `light`); `transport` ausente vira `'ws'`.
- `storage.ts`: `loadAccounts()` lê esquema 1 ou 2; com 1, chama `migrateToV2` com os quatro arquivos, grava contas, servidores, contatos e preferências **nessa ordem**, e só depois apaga os `ORPHAN_FILES` que existirem. Se qualquer leitura vier estragada (vai para o lado, como hoje), não apaga nada.

- [ ] **Step 1: testes que falham** em `tests/migrate-2.test.ts`:
  - "conta WebSocket sem servidor ganha servidor ws" → `servers` tem 1 com `transport: 'ws'` e o `wssUrl` da conta; `accounts[0].serverId` é o id dele.
  - "duas contas do mesmo domínio e transporte dividem o servidor" → 1 servidor.
  - "conta solta do servidor ganha servidor próprio sem perder conexão" → 2 servidores; `sipServer` da conta solta preservado.
  - "conta simulada vai para o servidor simulado" → `serverId === 'simulado'`; nenhum servidor `simulado` gravado em `servers` (ele é fixo).
  - "contato sem conta vai para a primeira conta"; "sem contas, contatos somem".
  - "campos que saíram não ficam" → nenhuma conta tem `provider|rawSipLog|simulated|quickDials|blf|answerAudio`; settings sem `ai|profile|modes|links|shortcuts|mediaKey|videoInputId`.
  - "id da conta não muda" (a senha é guardada pelo id).
  - "não lista arquivos para apagar se as contas não migraram" (teste em `storage` com pasta temporária: `accounts.json` estragado → `history.json` continua lá).
- [ ] **Step 2:** `npx vitest run tests/migrate-2.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar tipos, `migrate-2.ts` e a leitura em `storage.ts`; ajustar quem usava os campos que saíram (motores escolhem simulado por `serverId`; `createEngine` em `sip/index.ts`).
- [ ] **Step 4:** `npm run test:coverage`, `npm run typecheck`, `npm run test:chamada`, `npm run test:arquivos`. Esperado: PASS.
- [ ] **Step 5:** Commit `2.0: migra contas, servidores, contatos e preferências para o esquema 2 (RNF-19)`.

### Task 7: Etiquetas, servidor simulado fixo e regras dos servidores

**Files:**
- Create: `src/shared/tags.ts`, `tests/tags.test.ts`, `tests/servers.test.ts`, `src/renderer/src/stores/tags.ts`
- Modify: `src/main/storage.ts` (`loadTags`/`saveTags` em `tags.json`, esquema 1), `src/preload/index.ts`, `src/main/index.ts` (canais `tags:list`, `tags:save`), `stores/servers.ts`, `stores/accounts.ts`

**Interfaces:**
- Produces (`tags.ts`):
  ```ts
  export interface Tag { id: string; name: string; color: string }   // cor '#rrggbb'
  export const TAGS_LIMIT = 200
  export function isTag(v: unknown): v is Tag                         // nome 1..40, cor hex de 7
  export function removeTag(accounts: Account[], tagId: string): Account[]
  export function accountsWithTag(accounts: Account[], tagId: string): Account[]
  ```
- Produces (`servers.ts`): `canDeleteServer(server: SipServer, accounts: Account[]): { ok: true } | { ok: false; reason: 'simulado' | 'em-uso'; count?: number }`; `serversWithSimulated(saved: SipServer[]): SipServer[]` (o simulado sempre primeiro, nunca gravado em `servers.json`).
- Produces (store `tags`): `useTagsStore()` com `tags`, `save(tag)`, `remove(id)` (remove também das contas via `useAccountsStore().removeTag(id)`).

- [ ] **Step 1: testes que falham:** `tags.test.ts`: "valida nome e cor", "apagar etiqueta tira de todas as contas", "renomear não mexe nas contas" (contas guardam só o id). `servers.test.ts`: "não apaga servidor em uso nem o simulado" (`reason: 'em-uso', count: 2`; `reason: 'simulado'`), "simulado sempre na lista e nunca gravado".
- [ ] **Step 2:** Rodar: FAIL.
- [ ] **Step 3:** Implementar; canais com argumentos conferidos por `isTag`.
- [ ] **Step 4:** `npm run test:coverage`, `npm run typecheck`, `npm run lint`. Esperado: PASS.
- [ ] **Step 5:** Commit `2.0: etiquetas e servidor simulado fixo`.

### Task 8: Ordem dos codecs e sugestão de contatos

**Files:**
- Create: `src/shared/codecs.ts`, `tests/codecs.test.ts`
- Modify: `src/shared/types.ts` (`Settings.codecs?: CodecPrefs`, `SettingsPatch` com `codecs`, `NativeSipConfig.codecs: AudioCodecName[]`), `src/main/native-sip.ts` (passa a ordem para o `SipUserAgent`; lê `loadSettings()` em cada `sip:start` e em cada `sip:dial`), `src/main/sip/user-agent.ts` e `call.ts` (o `SipCall` recebe `codecs` no construtor em vez da lista fixa da linha 97), `src/shared/contacts.ts`, `tests/contacts.test.ts`, `tests/user-agent.test.ts`

**Interfaces:**
- Produces (`codecs.ts`):
  ```ts
  export type AudioCodecName = 'G722' | 'PCMA' | 'PCMU' | 'opus'
  export interface CodecPrefs { order: AudioCodecName[]; disabled: AudioCodecName[] }
  export const DEFAULT_CODECS: AudioCodecName[] = ['G722', 'PCMU', 'PCMA', 'opus']
  export function offerOrder(prefs: CodecPrefs | undefined): AudioCodecName[]   // nunca vazia
  export function isCodecPrefs(v: unknown): v is CodecPrefs | undefined
  ```
- Produces (`contacts.ts`): `suggestContacts(contacts: Contact[], accountId: string, query: string, limit = 6): Contact[]` (só da conta; casa por dígitos com `digits()` contidos no número, ou por nome com `plain()` contendo o texto; prefixo antes de "contém"; ordem alfabética no empate).

- [ ] **Step 1: testes que falham:**
  - `codecs.test.ts`: "padrão quando não há preferência" → `DEFAULT_CODECS`; "respeita a ordem e tira os desligados"; "lista vazia ou inválida volta ao padrão" (todos desligados → padrão; nome desconhecido ignorado; repetido ignorado); "codec que falta na ordem vai para o fim".
  - `contacts.test.ts`: "sugere só da conta atual"; "sugere por dígitos e por nome sem acento" (`'joao'` acha "João"; `'4000'` acha `+55 (11) 4000-1002`); "prefixo vem antes de contém"; "texto vazio não sugere nada".
  - `user-agent.test.ts`: "a oferta segue a ordem dos codecs" (com `['PCMA','PCMU']`, o SDP do INVITE tem `m=audio … RTP/AVP 8 0 101` e não tem G722).
- [ ] **Step 2:** Rodar: FAIL.
- [ ] **Step 3:** Implementar. `codec.ts` pode reaproveitar `AudioCodec`; não duplicar o tipo se der para exportar daquele.
- [ ] **Step 4:** `npm run test:coverage`, `npm run typecheck`, `npm run test:sip` com o Asterisk (2007 só G.722 continua atendendo com o padrão). Esperado: PASS.
- [ ] **Step 5:** Commit `2.0: ordem dos codecs em SIP puro e sugestão de contatos por conta`.

### Task 9: Casca nova da tela (tema, ícones, barra, seletor de contas)

Antes de escrever o visual, carregar a skill `frontend-design:frontend-design`: o usuário pediu **visual moderno, claro e denso, sem espaço em branco**. Seguir os esboços para a posição das coisas; o acabamento é da implementação.

**Files:**
- Create: `components/icons/Icon.vue`, `components/shell/IconRail.vue`, `components/shell/AccountPicker.vue`
- Modify: `App.vue` (grade: barra 60 px | discar 260 px | chamadas 1fr | depuração 30 px ou 290 px), `styles.css` (tokens claros e escuros; densidade), `stores/accounts.ts` (`currentId`, `setCurrent(id)`, persistido em `localStorage` chave `iris.conta-atual`, com try/catch), `i18n/pt-BR.ts`, `tests/e2e/helpers/tela.mjs` (`escolherConta` passa a usar o seletor)

**Interfaces:**
- Consumes: `useTagsStore()`, `serversWithSimulated()`, `explainRegError` (de `lib/accounts.ts`).
- Produces: `useAccountsStore().current` (conta atual ou a primeira), `setCurrent(id)`. `Icon.vue` com prop `name: 'phone'|'hangup'|'mic'|'pause'|'grid'|'transfer'|'record'|'gear'|'search'|'flow'|'plus'|'chevron'|'close'` e `aria-hidden`.
- Seletor: `role="dialog"`, `aria-label`; foco na busca ao abrir; Esc fecha; ↑/↓ navega; Enter escolhe. Grupos por servidor; chips de etiqueta como filtro (`aria-pressed`); ações na linha (Editar, Registrar/Desregistrar, Por quê?) visíveis também com foco do teclado, não só com o mouse (RNF-12); clique direito com Duplicar, Excluir, Saúde, Contatos; rodapé "+ Nova conta" e "Registrar todas". Número vermelho no avatar = contas com erro além da atual, com texto acessível ("2 contas com erro").

- [ ] **Step 1:** Ajustar `tela.mjs` e acrescentar em `chamada.mjs`: "o seletor troca a conta atual" (abre, filtra por etiqueta, escolhe, o título do discar muda). Rodar: FAIL.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** `npm run test:chamada`, `npm run test:a11y`, `npm run test:e2e`. Esperado: PASS. Abrir o app (`npm run dev`) e olhar a tela clara e a escura.
- [ ] **Step 4:** Commit `2.0: barra de ícones e seletor de contas`.

### Task 10: Discar, chamadas e detalhes da conta

**Files:**
- Create: `components/shell/DialPanel.vue`, `ContactSuggestions.vue`, `CallsPanel.vue`, `CallRow.vue`, `IncomingRow.vue`, `AccountDetails.vue`, `components/ContactsDialog.vue`
- Delete: `DialerPane.vue`, `CallCard.vue`, `ContactsPane.vue`, `ContactForm.vue` (se o diálogo novo cobre), `AccountsPane.vue`
- Modify: `stores/contacts.ts` (`forAccount(id)`, `suggest(query)` usando `suggestContacts` com a conta atual), `stores/calls.ts` (nome do contato só da conta da chamada), `i18n/pt-BR.ts`, `tela.mjs`

**Interfaces:**
- Consumes: `suggestContacts`, `useAccountsStore().current`, `useCallsStore()` (mesmas ações de hoje: dial, answer, reject, hangup, mute, hold, dtmf, transfer, attended, record).
- DialPanel: campo com `role="combobox"`, `aria-expanded`, lista `role="listbox"`; teclado de 12 teclas escreve no campo e manda DTMF se houver chamada ativa selecionada (como hoje). Enter com sugestão marcada liga o número **do contato**. Última opção "+ Salvar como contato" quando nada casa e há texto. Cabeçalhos SIP extras (RF-18) continuam: botão pequeno "Cabeçalhos" ao lado de Ligar.
- CallsPanel: recebidas no topo (azul, Atender/Recusar, etiqueta da conta); ativas em linhas (nome do contato ou número, tempo, etiqueta da conta, codec, perda, jitter, RTT, barras de qualidade com forma além da cor); em espera em amarelo com "Retomar"; transferência cega e assistida no botão Transferir (menu); Gravar mostra que está gravando. Sem chamadas: `AccountDetails` da conta atual (estado e renovação, servidor:porta e IP, transporte, usuário, IP local, codecs da oferta, DTMF, último OPTIONS com latência, vindos de `engine.health()` e do estado já guardado).
- ContactsDialog: lista dos contatos de uma conta, criar, editar, apagar; aberto pelo clique direito no seletor e por "Salvar como contato".

- [ ] **Step 1:** Em `chamada.mjs`: "sugestão liga para o contato" (cadastra contato "João Teste 8000" na conta, digita `joao`, Enter, a chamada para 8000 aparece) e "contato de outra conta não aparece". Atualizar `tela.mjs`. Rodar: FAIL.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** `npm run test:chamada` (simulado e Asterisk), `npm run test:contatos` (reescrever para a tela nova), `npm run test:a11y`, `npm run test:notificacoes`. Esperado: PASS.
- [ ] **Step 4:** Commit `2.0: discador com sugestão de contatos e coluna de chamadas`.

### Task 11: Gaveta de depuração

**Files:**
- Create: `components/shell/DebugDrawer.vue`
- Modify: `LogPane.vue` e `LadderDialog.vue` (viram conteúdo das abas SIP/Log e Fluxo, sem moldura própria), `HealthDialog.vue` (vira a aba Saúde, com o diagnóstico de ambiente do RF-25 e o de rede do RF-46), `stores/log.ts` (`accountFilter`, que acompanha `currentId` e muda ao clicar numa chamada), `i18n/pt-BR.ts`

**Interfaces:**
- Gaveta fechada: tira de 30 px, botão com `aria-expanded=false` e texto "SIP · Fluxo · Log"; com erro novo no log desde que fechou, a tira muda de cor e ganha um ponto, e o rótulo acessível diz "erro novo". Aberta: abas SIP, Fluxo, Log, Saúde; filtro de conta (começa na atual, tem "Todas"); clicar numa linha do SIP mostra a mensagem inteira; Copiar, Salvar .txt, Salvar .json, Limpar (RF-23). Estado aberto/fechado em `localStorage` `iris.depuracao-aberta`.

- [ ] **Step 1:** Em `chamada.mjs`: "a gaveta começa fechada e mostra o INVITE da chamada" e "clicar numa chamada filtra o SIP pela conta dela". Rodar: FAIL.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** `npm run test:chamada`, `npm run test:a11y`, `npm run test:e2e`. Esperado: PASS.
- [ ] **Step 4:** Commit `2.0: gaveta de depuração com SIP, Fluxo, Log e Saúde`.

### Task 12: Cadastro de conta, janela de servidor e Ajustes

**Files:**
- Create: `components/ServerDialog.vue`, `settings/TagsSection.vue`, `settings/CodecsList.vue`
- Modify: `AccountForm.vue` (reescrever: Nome*, Etiquetas, Servidor* com "+ Novo servidor…", Ramal*, Senha*; Avançado fechado com transporte UDP/TCP/TLS/WebSocket, usuário de autenticação, endereço:porta, nome de exibição, DTMF, registrar ao abrir, SRTP, atender sozinho com atraso 0 a 10 s, toque, cor; com WebSocket: WSS, STUN/TURN, early media; Testar e Salvar), `settings/SettingsDialog.vue` (seções: Áudio com `CodecsList`, Aparência, Servidores, Etiquetas, Conexão, Notificações, Certificados, Importar e exportar, Atualização; Sobre e Guia no pé), `settings/ServersSection.vue` (lista + `ServerDialog`, apagar com `canDeleteServer`), `settings/AppearanceSection.vue` (Claro/Escuro/Sistema + cor de destaque), `settings/ImportExportSection.vue` (sem CSV de cenários; CSV de contas mantido se usa só nome/ramal/servidor/senha), `i18n/pt-BR.ts`, `tela.mjs`

**Interfaces:**
- Consumes: `useTagsStore()`, `canDeleteServer`, `serversWithSimulated`, `offerOrder`, `isCodecPrefs`.
- Conta nova: transporte vem do servidor escolhido; servidor padrão no formulário novo é o último usado, ou o simulado se não houver outro. Nome obrigatório (erro no campo, `aria-invalid`).
- `CodecsList`: lista reordenável por arrastar e por botões ↑/↓ com rótulo; caixa para ligar/desligar; não deixa desligar o último ligado; linha dizendo que em WebSocket vale a ordem do Chromium. Grava por `settings:update` com `{ codecs }`.

- [ ] **Step 1:** Em `chamada.mjs`: "cadastra servidor e conta UDP pela tela e registra" (com `PBX_WS`: servidor 127.0.0.1 UDP, conta 2001; sem: simulado) e "a ordem dos codecs vai para o INVITE" (com Asterisk: PCMA primeiro, o 200 OK vem com PCMA). Rodar: FAIL.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** `npm run test:chamada`, `npm run test:a11y`, `npm run test:senhas`, `npm run test:arquivos`, `npm run test:e2e`. Esperado: PASS.
- [ ] **Step 4:** Commit `2.0: cadastro de conta, janela de servidor e Ajustes com etiquetas e codecs`.

### Task 13: Guia, documentação, especificação e versão 2.0.0

**Files:** `i18n/guide.pt-BR.ts` (guia curto: contas e servidores, ligar, chamada, depuração, ajustes), `GuideDialog.vue`, `scripts/guide-shots.mjs` + `npm run guide:shots`, `docs/ESPECIFICACAO.md` (seção "Retirados em 29/10/2026" com cada RF e o motivo; RF-01 com os campos novos; RF-02 por servidor; RF-09 sem atalhos de discagem rápida; RF-50 contatos por conta e por sugestão; RF-51 com o simulado fixo e etiquetas; requisito novo RF-60 "Ordem dos codecs" com critério "com PCMA primeiro, o INVITE oferece PCMA primeiro"; requisito novo RF-61 "Etiquetas"; critério de saída do M4 só com o que ficou), `README.md` (Estado atual, Testes, sem os comandos que saíram), `CLAUDE.md` (estado, o que saiu, arquivos novos; tirar as instruções de coisas apagadas), `docs/SEGURANCA.md` (canais que saíram), `package.json` (`"version": "2.0.0"`), `.github/release-notes.md`.

- [ ] **Step 1:** Escrever e atualizar. `grep -rniE "sdr|cenári|mensage|histórico|modo telefone|ia |openrouter|blf|pcap|inglês|english" README.md CLAUDE.md docs/SEGURANCA.md src` só com menções na seção de retirados.
- [ ] **Step 2:** `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run format:check`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:chamada`, `npm run test:sip` (Asterisk), `npm run test:pacote`; ler o log do app que o `test:pacote` imprime; abrir o app empacotado e **olhar a janela** (tema claro e escuro, seletor, gaveta, cadastro).
- [ ] **Step 3:** Commit `Versão 2.0.0: Íris mais simples`.
- [ ] **Step 4:** Parar e pedir ao usuário: autorização para push da branch / PR, para apagar o rascunho da 1.9.0 no GitHub e para criar a tag `v2.0.0`.
