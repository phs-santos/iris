# Graph Report - iris  (2026-10-29)

## Corpus Check
- 253 files · ~293,164 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 5, .conf 5, .patch 1)

## Summary
- 2525 nodes · 5922 edges · 124 communities (111 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 240 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Tipos compartilhados
- Mensagens SIP
- Atualização automática
- Fluxo SIP (ladder)
- Diálogo de chamada e SDP
- Áudio e toques
- Processo principal e bandeja
- User agent SIP e testes
- Dependências npm
- App.vue e contas
- User agent SIP
- Armazenamento de dados
- RTP e codecs
- Modo SDR
- Ajuda da IA
- Modo Telefone
- Motor simulado
- call.ts
- Log interno, CLI e IPC
- Mensagem SIP (parser)
- LogPane.vue
- Ponte SIP nativa (IPC)
- Servidores
- Cenários e monitor
- Aparência
- Especificação e requisitos
- package.json
- accounts.ts
- Teste de carga
- ScenariosPane.vue
- recorder.ts
- Interface SipEngine
- Motor easy-sipjs
- Segurança e CI
- ai.ts
- AccountForm.vue
- SdrView.vue
- SettingsDialog.vue
- Atalhos
- CallCard.vue
- Contatos
- engine.ts
- net-diag.ts
- presence.ts
- types.ts
- Guia
- package.json
- easysip-engine.ts
- Motor SIP puro (interface)
- DialerPane.vue
- Tradução
- runner.ts
- scenarios.ts
- AccountsPane.vue
- codec.ts
- CommandPalette.vue
- engine.ts
- cli.ts
- CallVideo.vue
- SdrSettings.vue
- native-engine.ts
- mock-engine.ts
- Pipeline de release
- G.722
- HealthDialog.vue
- ContactsPane.vue
- Modos escondidos
- guide-shots.mjs
- g722.ts
- FirstSteps.vue
- NotificationsSection.vue
- tsconfig.web.json
- CONCEITO.html
- pcap.ts
- HistoryPane.vue
- tsconfig.node.json
- electron-builder.yml
- SipRequestDialog.vue
- runner.ts
- carga-sip.mjs
- WavPicker.vue
- AiSection.vue
- sdr.mjs
- sip-puro.mjs
- pacote.mjs
- check-licenses.mjs
- call.ts
- srtp.ts
- dtmf.ts
- check-i18n.mjs
- g711.ts
- sdr.ts
- senhas.mjs
- a11y.mjs
- transport.ts
- transport.ts
- pcm-worklet.js
- arquivos.mjs
- atalhos.mjs
- atendimento.mjs
- idioma.mjs
- load.mjs
- monitor.mjs
- resources.mjs
- docker-compose.yml
- .prettierrc.json
- cli.mjs
- mensagens.mjs
- modos.mjs
- notificacoes.mjs
- reconexao.mjs
- video.mjs
- ESPECIFICACAO.md
- SEGURANCA.md
- links.ts
- contatos.mjs
- scenarios.mjs
- sdr.ts
- package.json
- package.json
- install-macos.sh
- tsconfig.json
- gen-cert.sh

## God Nodes (most connected - your core abstractions)
1. `t()` - 112 edges
2. `Especificação SIP Bench` - 71 edges
3. `registerIpc()` - 56 edges
4. `vue` - 55 edges
5. `useAccountsStore` - 55 edges
6. `useCallsStore` - 49 edges
7. `SipCall` - 48 edges
8. `scripts` - 44 edges
9. `SipUserAgent` - 39 edges
10. `vitest` - 36 edges

## Surprising Connections (you probably didn't know these)
- `Dados e segurança (arquivos JSON, senhas.json)` --semantically_similar_to--> `Cofre de senhas do sistema nunca usado`  [INFERRED] [semantically similar]
  README.md → docs/SEGURANCA.md
- `run()` --calls--> `runScenario()`  [EXTRACTED]
  tests/scenarios.test.ts → src/renderer/src/scenarios/runner.ts
- `Job build (fumaça do pacote + instaladores)` --references--> `electron-builder config`  [INFERRED]
  .github/workflows/release.yml → electron-builder.yml
- `Job build (fumaça do pacote + instaladores)` --implements--> `RNF-01 Plataformas`  [INFERRED]
  .github/workflows/release.yml → docs/ESPECIFICACAO.md
- `Testes por publicação` --rationale_for--> `Job e2e (Playwright + Asterisk)`  [INFERRED]
  CLAUDE.md → .github/workflows/ci.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pipeline de publicação (tag → build → rascunho → atualização)** — _github_workflows_release_build_job, _github_workflows_release_release_job, _github_release_notes, electron_builder_publish_github, docs_especificacao_rf_35 [INFERRED 0.85]
- **Endurecimento do Electron (RNF-08)** — electron_builder_electronfuses, src_renderer_index_content_security_policy, docs_seguranca_ipc_guard, docs_seguranca_csp_restrita, docs_especificacao_rnf_08 [INFERRED 0.85]
- **Distribuição sem assinatura (RNF-17 bloqueado)** — electron_builder_resetadhocdarwinsignature, _github_release_notes_install_macos_script, readme_mac_update, docs_especificacao_rnf_17 [INFERRED 0.85]

## Communities (124 total, 13 thin omitted)

### Community 0 - "Tipos compartilhados"
Cohesion: 0.03
Nodes (17): AiSettings, Appearance, Profile, LinkSettings, ModeSettings, NotificationSettings, AccountsFile, check() (+9 more)

### Community 1 - "Mensagens SIP"
Cohesion: 0.05
Nodes (50): RFC-3428, close(), itemsEl(), MenuItem, onMenuKey(), onOutside(), onTriggerKey(), open (+42 more)

### Community 2 - "Atualização automática"
Cohesion: 0.06
Nodes (24): FoundUpdate, MacSelfUpdater, run, UpdaterState, checkExtractedApp(), MAC_BUNDLE_ID, macZipUrl(), pickMacZip() (+16 more)

### Community 3 - "Fluxo SIP (ladder)"
Cohesion: 0.06
Nodes (47): accountFilter, accounts, all, chosen, copyMessage(), current, currentId, describeAccount() (+39 more)

### Community 4 - "Diálogo de chamada e SDP"
Cohesion: 0.10
Nodes (7): CallHost, SipCall, answerDirection(), MediaDirection, parseSdp(), SdpError, newSrtpKey()

### Community 5 - "Áudio e toques"
Cohesion: 0.07
Nodes (27): chooseInput(), devices, folderError, level, micError, openRecordings(), startMeter(), stopMeter() (+19 more)

### Community 6 - "Processo principal e bandeja"
Cohesion: 0.08
Nodes (43): cliOptions, BENCH_MIN, callsNow, cli, createTray(), createWindow(), failedShortcuts, PHONE_MIN (+35 more)

### Community 7 - "User agent SIP e testes"
Cohesion: 0.07
Nodes (25): RFC-3581, digestAuthorization(), SipMessage, SipTransport, TlsCertificateError, TransportFactory, TransportOptions, SipTimeoutError (+17 more)

### Community 8 - "Dependências npm"
Cohesion: 0.05
Nodes (44): scripts, build, cenario, dev, dist, dist:linux, dist:mac, dist:win (+36 more)

### Community 9 - "App.vue e contas"
Cohesion: 0.06
Nodes (35): accounts, ai, calls, centerTab, certError, devices, dialer, editing (+27 more)

### Community 10 - "User agent SIP"
Cohesion: 0.12
Nodes (6): ResponseOptions, parseChallenge(), redact(), SipUserAgent, token(), UaEvents

### Community 11 - "Armazenamento de dados"
Cohesion: 0.09
Nodes (35): dataDir(), decrypt(), defaultSettings, encrypt(), exists(), file(), loadHistory(), loadSdr() (+27 more)

### Community 12 - "RTP e codecs"
Cohesion: 0.09
Nodes (11): RFC-3550, CodecInstance, buildRtp(), FRAME_SAMPLES, ntpMiddle(), parseRtp(), RtpEvents, RtpPacket (+3 more)

### Community 13 - "Modo SDR"
Cohesion: 0.12
Nodes (31): SdrCurrent, SdrPhase, useSdrStore, plain(), AnswerDetectorOptions, AnswerKind, applyOutcome(), ATTEMPTS_LIMIT (+23 more)

### Community 14 - "Ajuda da IA"
Cohesion: 0.08
Nodes (31): ai, answer, canSend, copied, dialogEl, emit, error, keyError (+23 more)

### Community 15 - "Modo Telefone"
Cohesion: 0.06
Nodes (28): timer, account, accounts, bars, calls, current, dial(), dialingAnother (+20 more)

### Community 16 - "Motor simulado"
Cohesion: 0.15
Nodes (3): MockCall, publishPresence(), testPattern

### Community 17 - "call.ts"
Cohesion: 0.08
Nodes (27): RFC-2617, RFC-3264, RFC-3515, RFC-3711, RFC-3891, RFC-4566, RFC-4568, RFC-5589 (+19 more)

### Community 18 - "Log interno, CLI e IPC"
Cohesion: 0.13
Nodes (23): electron, appLog, AppLogLevel, describeError(), LOG_FILE_BYTES, LOG_FILES, startAppLog(), cleanup() (+15 more)

### Community 19 - "Mensagem SIP (parser)"
Cohesion: 0.14
Nodes (23): addressOf(), Base, CANONICAL, canonicalName(), COMPACT, cseqOf(), formatUri(), header() (+15 more)

### Community 20 - "LogPane.vue"
Cohesion: 0.09
Nodes (25): vue, accounts, ai, asText(), copied, copy(), filter, follow (+17 more)

### Community 21 - "Ponte SIP nativa (IPC)"
Cohesion: 0.12
Nodes (28): isPlainObject(), isString(), agents, callKey(), calls, DTMF_MODES, isCallAction(), isCallId() (+20 more)

### Community 22 - "Servidores"
Cohesion: 0.10
Nodes (24): chooseServer(), blank(), confirmDelete, edit(), editing, error, form, message (+16 more)

### Community 23 - "Cenários e monitor"
Cohesion: 0.11
Nodes (25): addStep(), changeType(), createIvrExample(), errors, CALL_STATES, CHECKS, lastCallAlias(), newScenario() (+17 more)

### Community 24 - "Aparência"
Cohesion: 0.13
Nodes (27): custom, prefs, size, sizes, theme, themes, tokens, accentTokens (+19 more)

### Community 25 - "Especificação e requisitos"
Cohesion: 0.08
Nodes (29): Especificação SIP Bench, Modo simulado via customProvider, RF-01 Cadastro de contas, RF-08 Renovar registro e reconectar, RF-10 Notificação de chamada recebida, RF-14 DTMF com sequência, RF-15 Transferência cega, RF-16 Transferência assistida (+21 more)

### Community 26 - "package.json"
Cohesion: 0.08
Nodes (27): author, description, homepage, license, main, name, private, productName (+19 more)

### Community 27 - "accounts.ts"
Cohesion: 0.11
Nodes (27): takeLink(), importCsv(), outcomeName(), phaseText, accounts, doExport(), doImport(), doImportCsv() (+19 more)

### Community 28 - "Teste de carga"
Cohesion: 0.09
Nodes (25): account, accounts, close(), dialogEl, emit, error, form, log (+17 more)

### Community 29 - "ScenariosPane.vue"
Cohesion: 0.08
Nodes (21): accountOptions, accounts, addType, calls, exportReport(), monitor, monitorOf(), monitorText (+13 more)

### Community 30 - "recorder.ts"
Cohesion: 0.11
Nodes (15): patchesDir, root, icon, jobs, tray, TRAY_COLORS, stopRecording(), WavRecorder (+7 more)

### Community 31 - "Interface SipEngine"
Cohesion: 0.13
Nodes (20): vitest, newAccount(), sampleAccounts(), CallEnd, DialOptions, EngineLog, LogKind, LogLevel (+12 more)

### Community 32 - "Motor easy-sipjs"
Cohesion: 0.12
Nodes (14): AnyListener, Emitter, EasySipEngine, getHeader(), levelOf(), SILENT_WAV, SipJsMessage, CallEvents (+6 more)

### Community 33 - "Segurança e CI"
Cohesion: 0.10
Nodes (24): CI workflow, Job check (lint, typecheck, cobertura, 3 SOs), Job e2e (Playwright + Asterisk), RF-34 Atalhos globais, RF-36 Gravação de chamada, RF-38 Ajuda da IA (OpenRouter), RF-39 SIP puro com motor próprio, RF-42 Teste de carga por SIP puro (+16 more)

### Community 34 - "ai.ts"
Cohesion: 0.16
Nodes (24): electron-updater, AI_SECRET_PREFIX, baseUrl(), describe(), explain(), models(), registerAiIpc(), request() (+16 more)

### Community 35 - "AccountForm.vue"
Cohesion: 0.10
Nodes (25): accounts, applyQuickDials(), dialogEl, effectivePassword(), emit, errors, form, linked (+17 more)

### Community 36 - "SdrView.vue"
Cohesion: 0.09
Nodes (26): account, accounts, addPasted(), call, callbackAt, calls, choose(), choosingCallback (+18 more)

### Community 37 - "SettingsDialog.vue"
Cohesion: 0.08
Nodes (20): accounts, prefs, accounts, current, dialogEl, emit, initials, prefs (+12 more)

### Community 38 - "Atalhos"
Cohesion: 0.12
Nodes (22): capturing, error, failed, label(), links, mac, mediaKeyFailed, onCapture() (+14 more)

### Community 39 - "CallCard.vue"
Cohesion: 0.08
Nodes (23): account, accounts, ai, autoAnswerIn, bars, c, calls, consulting (+15 more)

### Community 40 - "Contatos"
Cohesion: 0.13
Nodes (23): accounts, contacts, dialogEl, emit, errors, form, props, save() (+15 more)

### Community 41 - "engine.ts"
Cohesion: 0.11
Nodes (8): CallQuality, SipEngine, qualityOf(), LoadProgress, LoadReport, LoadSpec, SipManualRequest, SipManualResponse

### Community 42 - "net-diag.ts"
Cohesion: 0.16
Nodes (17): RFC-3263, RFC-5389, diagnoseNetwork(), lookupSrv(), message(), readCertificate(), SERVICES, stunQuery() (+9 more)

### Community 43 - "presence.ts"
Cohesion: 0.13
Nodes (13): RFC-3842, HealthReport, Runtime, MwiInfo, parseBlfList(), parseDialogInfo(), parseMessageSummary(), PresenceState (+5 more)

### Community 44 - "types.ts"
Cohesion: 0.09
Nodes (13): api, Window, AiModel, AiRequest, AiResult, WebhookPayload, NotificationAction, NotifyRequest (+5 more)

### Community 45 - "Guia"
Cohesion: 0.10
Nodes (17): contentEl, current, currentId, dialogEl, emit, GUIDE, images, matches (+9 more)

### Community 46 - "package.json"
Cohesion: 0.09
Nodes (23): devDependencies, axe-core, easy-sipjs, electron, electron-builder, electron-vite, eslint, @eslint/js (+15 more)

### Community 49 - "DialerPane.vue"
Cohesion: 0.09
Nodes (17): accounts, calls, canVideo, contacts, destination, dial(), error, from (+9 more)

### Community 50 - "Tradução"
Cohesion: 0.13
Nodes (15): en, Messages, Catalog, catalogs, ComponentCustomProperties, currentLocale(), installI18n(), Locale (+7 more)

### Community 51 - "runner.ts"
Cohesion: 0.18
Nodes (8): stateLabel(), runScenario(), execute(), until(), ScenarioDriver, sleep(), StepFailure, Stopped

### Community 52 - "scenarios.ts"
Cohesion: 0.21
Nodes (18): pinia, runCli(), notify(), describeStep(), buildReport(), RunResult, ScenarioReport, StepResult (+10 more)

### Community 53 - "AccountsPane.vue"
Cohesion: 0.11
Nodes (15): accounts, ai, allActions, calls, collapsed, confirmDelete, emit, loadFor (+7 more)

### Community 54 - "codec.ts"
Cohesion: 0.16
Nodes (9): createCodec(), OpusCodec, RFC-3551, decodeG711(), encodeG711(), G722Decoder, G722Encoder, COEFFS (+1 more)

### Community 55 - "CommandPalette.vue"
Cohesion: 0.15
Nodes (18): accounts, active, calls, contacts, dial(), dialFrom(), dialogEl, emit (+10 more)

### Community 57 - "cli.ts"
Cohesion: 0.18
Nodes (14): mark, pickScenarios(), resolveAccount(), UsageError, BOOLEAN, CLI_USAGE, CliConfig, CliOptions (+6 more)

### Community 58 - "CallVideo.vue"
Cohesion: 0.14
Nodes (12): calls, localEl, props, remoteEl, streams, ATTENDED_CLEANUP_MS, CallState, CallView (+4 more)

### Community 59 - "SdrSettings.vue"
Cohesion: 0.12
Nodes (13): accounts, actions, days, dialogEl, emit, error, form, save() (+5 more)

### Community 60 - "native-engine.ts"
Cohesion: 0.16
Nodes (3): NativeSipEngine, NativeCallEvent, NativeSipEvent

### Community 61 - "mock-engine.ts"
Cohesion: 0.22
Nodes (5): MockEngine, connect(), registered(), mockDriver(), registered()

### Community 62 - "Pipeline de release"
Cohesion: 0.17
Nodes (16): Release notes template, install-macos.sh (instalação pelo Terminal), Release workflow, Job build (fumaça do pacote + instaladores), Job release (rascunho no GitHub), Próximos passos do M4, M4 Lançamento, Plano de entrega M0 a M4 (+8 more)

### Community 63 - "G.722"
Cohesion: 0.18
Nodes (5): G722Codec, Band, saturate(), clamp(), Upsampler

### Community 64 - "HealthDialog.vue"
Cohesion: 0.15
Nodes (16): native, account, accounts, Check, checkedAt, checks, copyReport(), dialogEl (+8 more)

### Community 65 - "ContactsPane.vue"
Cohesion: 0.14
Nodes (16): accounts, call(), calls, confirmDelete, contacts, create(), editing, emit (+8 more)

### Community 66 - "Modos escondidos"
Cohesion: 0.15
Nodes (13): prefs, emit, hide(), label(), prefs, usePreferencesStore, ALL_MODES, MODE_IDS (+5 more)

### Community 67 - "guide-shots.mjs"
Cohesion: 0.13
Nodes (10): args, close(), dialog(), out, server, userData, args, requests (+2 more)

### Community 68 - "g722.ts"
Cohesion: 0.12
Nodes (15): IHN, IHP, ILB, ILN, ILP, Q6, QM2, QM4 (+7 more)

### Community 69 - "FirstSteps.vue"
Cohesion: 0.16
Nodes (13): accounts, calls, doneCount, emit, history, prefs, real, servers (+5 more)

### Community 70 - "NotificationsSection.vue"
Cohesion: 0.21
Nodes (10): label(), prefs, test(), tested, isNotificationKind(), isNotificationSettings(), isNotifyRequest(), NOTIFICATION_KINDS (+2 more)

### Community 71 - "tsconfig.web.json"
Cohesion: 0.12
Nodes (15): compilerOptions, composite, jsx, lib, module, moduleResolution, noUnusedLocals, paths (+7 more)

### Community 72 - "CONCEITO.html"
Cohesion: 0.18
Nodes (10): AGENTS.md (agent guide), CLAUDE.md (agent guide), Conceito visual SIP Bench, Uma instância SipClient por conta, Barramento de eventos, Tela principal (contas, discador, log), Tela Saúde (checkHealth/diagnose), easy-sipjs 2.7.6 (+2 more)

### Community 73 - "pcap.ts"
Cohesion: 0.14
Nodes (7): CAPTURE_LIMIT_BYTES, Endpoint, ipv4(), Packet, PacketCapture, udpPacket(), closers

### Community 74 - "HistoryPane.vue"
Cohesion: 0.14
Nodes (11): accounts, calls, clear(), confirming, contacts, emit, history, ladderFor (+3 more)

### Community 75 - "tsconfig.node.json"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, esModuleInterop, module, moduleResolution, noUnusedLocals, paths, skipLibCheck (+5 more)

### Community 76 - "electron-builder.yml"
Cohesion: 0.18
Nodes (12): RF-53 Links tel:/sip:, RNF-07 Senhas em arquivo cifrado, Fuses do Electron, electron-builder config, electronFuses, enableCookieEncryption: false, linux targets AppImage + deb, mac targets dmg + zip (arm64, x64) (+4 more)

### Community 77 - "SipRequestDialog.vue"
Cohesion: 0.15
Nodes (12): account, accounts, dialogEl, emit, error, form, log, props (+4 more)

### Community 78 - "runner.ts"
Cohesion: 0.17
Nodes (12): AUDIO_POLL_MS, AUDIO_READS, describeCall(), DriverCall, DTMF_SETTLE_MS, reached(), REGISTER_TIMEOUT_MS, reportsToJUnit() (+4 more)

### Community 79 - "carga-sip.mjs"
Cohesion: 0.18
Nodes (9): playwright-core, addAccount(), args, step(), userData, account, args, CALLS (+1 more)

### Community 80 - "WavPicker.vue"
Cohesion: 0.21
Nodes (8): choose(), emit, error, props, record(), recording, seconds, stop()

### Community 81 - "AiSection.vue"
Cohesion: 0.21
Nodes (10): keyError, keyInput, mask, model, refresh(), removeKey(), saved, saveKey() (+2 more)

### Community 82 - "sdr.mjs"
Cohesion: 0.17
Nodes (7): args, csv, downloads, messageWav, openingWav, pageErrors, userData

### Community 83 - "sip-puro.mjs"
Cohesion: 0.24
Nodes (8): account(), args, contacts(), dial(), expectAudio(), expectContact(), step(), userData

### Community 84 - "pacote.mjs"
Cohesion: 0.20
Nodes (4): OUT, userData, pageErrors, userData

### Community 85 - "check-licenses.mjs"
Cohesion: 0.24
Nodes (9): ALLOWED, bad, licenseOf(), list, resolve(), root, seen, SHIPPED (+1 more)

### Community 87 - "srtp.ts"
Cohesion: 0.33
Nodes (3): deriveKey(), keystream(), SrtpContext

### Community 88 - "dtmf.ts"
Cohesion: 0.33
Nodes (7): sendDtmf(), DTMF_GAP_MS, DtmfStep, DtmfSyntaxError, parseDtmfSequence(), runDtmfSequence(), MockAccount

### Community 89 - "check-i18n.mjs"
Cohesion: 0.25
Nodes (7): ATTRS, files, KEYS, literals(), looksLikeText(), problems, walk()

### Community 90 - "g711.ts"
Cohesion: 0.28
Nodes (6): ALAW_DECODE, alawToLinear(), G711, RFC-3551, ULAW_DECODE, ulawToLinear()

### Community 91 - "sdr.ts"
Cohesion: 0.39
Nodes (9): isAttempt(), isInt(), isLead(), isOutcome(), isSdrSettings(), isSdrWebhookPayload(), isText(), isTime() (+1 more)

### Community 92 - "senhas.mjs"
Cohesion: 0.25
Nodes (4): args, launch(), reopen(), userData

### Community 93 - "a11y.mjs"
Cohesion: 0.29
Nodes (6): args, axeSource, problems, scan(), step(), userData

### Community 97 - "arquivos.mjs"
Cohesion: 0.25
Nodes (3): args, launch(), userData

### Community 98 - "atalhos.mjs"
Cohesion: 0.25
Nodes (3): args, pageErrors, userData

### Community 99 - "atendimento.mjs"
Cohesion: 0.25
Nodes (4): args, data, userData, wav

### Community 100 - "idioma.mjs"
Cohesion: 0.29
Nodes (6): args, expectEnglish(), launch(), pageErrors, screenText(), userData

### Community 101 - "load.mjs"
Cohesion: 0.25
Nodes (4): args, exts, importFile, userData

### Community 102 - "monitor.mjs"
Cohesion: 0.25
Nodes (6): args, deadline, launch(), received, server, userData

### Community 103 - "resources.mjs"
Cohesion: 0.32
Nodes (6): exts, footprint(), importFile, metrics(), sample(), userData

### Community 104 - "docker-compose.yml"
Cohesion: 0.29
Nodes (7): docker-compose Asterisk de teste, Serviço asterisk (andrius/asterisk, network_mode host), compose.ports.yml (Docker Desktop ports), Override de portas do Asterisk (Docker Desktop), Asterisk em Docker (integração), Estratégia de testes, Plano de discagem do Asterisk de teste

### Community 105 - ".prettierrc.json"
Cohesion: 0.29
Nodes (6): printWidth, semi, singleQuote, tabWidth, trailingComma, useTabs

### Community 106 - "cli.mjs"
Cohesion: 0.33
Nodes (5): expect(), fixtures, sim, step(), tmp

### Community 107 - "mensagens.mjs"
Cohesion: 0.29
Nodes (4): args, launch(), pageErrors, userData

### Community 108 - "modos.mjs"
Cohesion: 0.29
Nodes (3): args, env, userData

### Community 109 - "notificacoes.mjs"
Cohesion: 0.33
Nodes (4): account(), args, ring(), userData

### Community 111 - "video.mjs"
Cohesion: 0.33
Nodes (5): args, pageErrors, playing(), step(), userData

### Community 112 - "ESPECIFICACAO.md"
Cohesion: 0.33
Nodes (4): Modelo de dados (accounts/scenarios/settings JSON), RNF-13 Textos em arquivos de tradução, RNF-16 Camada SIP atrás de SipEngine, RNF-19 JSON versionado com migração

### Community 113 - "SEGURANCA.md"
Cohesion: 0.40
Nodes (5): RNF-08 Renderer isolado e CSP, CSP restrita, IPC conferido (ipc-guard), Renderer index.html, Content-Security-Policy do renderer

### Community 114 - "links.ts"
Cohesion: 0.53
Nodes (4): findCallLink(), LINK_SCHEMES, LinkStatus, parseCallLink()

### Community 115 - "contatos.mjs"
Cohesion: 0.33
Nodes (3): args, errors, userData

### Community 116 - "scenarios.mjs"
Cohesion: 0.33
Nodes (4): args, reportFile, RUNS, userData

### Community 118 - "package.json"
Cohesion: 0.67
Nodes (3): dependencies, electron-updater, opusscript

### Community 119 - "package.json"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **65 isolated node(s):** `@types/node`, `@vitest/coverage-v8`, `axe-core`, `electron-builder`, `eslint` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1051 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Interface SipEngine` to `Mensagens SIP`, `Atualização automática`, `Fluxo SIP (ladder)`, `Áudio e toques`, `Processo principal e bandeja`, `User agent SIP e testes`, `Armazenamento de dados`, `Modo SDR`, `Ajuda da IA`, `Log interno, CLI e IPC`, `Mensagem SIP (parser)`, `Servidores`, `Cenários e monitor`, `Aparência`, `package.json`, `accounts.ts`, `Teste de carga`, `recorder.ts`, `Atalhos`, `net-diag.ts`, `presence.ts`, `Tradução`, `codec.ts`, `cli.ts`, `CallVideo.vue`, `NotificationsSection.vue`, `pcap.ts`, `dtmf.ts`, `links.ts`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `registerIpc()` (e.g. with `isContact()` and `isHistoryEntry()`) actually correct?**
  _`registerIpc()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/node`, `@vitest/coverage-v8`, `axe-core` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tipos compartilhados` be split into smaller, more focused modules?**
  _Cohesion score 0.03365384615384615 - nodes in this community are weakly interconnected._
- **Why does `vue` connect `LogPane.vue` to `Mensagens SIP`, `Fluxo SIP (ladder)`, `Áudio e toques`, `App.vue e contas`, `Modo SDR`, `Ajuda da IA`, `Modo Telefone`, `Servidores`, `Aparência`, `package.json`, `accounts.ts`, `Teste de carga`, `ScenariosPane.vue`, `AccountForm.vue`, `SdrView.vue`, `SettingsDialog.vue`, `Atalhos`, `CallCard.vue`, `Contatos`, `presence.ts`, `Guia`, `DialerPane.vue`, `Tradução`, `scenarios.ts`, `AccountsPane.vue`, `CommandPalette.vue`, `CallVideo.vue`, `SdrSettings.vue`, `HealthDialog.vue`, `ContactsPane.vue`, `FirstSteps.vue`, `NotificationsSection.vue`, `HistoryPane.vue`, `SipRequestDialog.vue`, `WavPicker.vue`, `AiSection.vue`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useAccountsStore` (e.g. with `newAccount()` and `load()`) actually correct?**
  _`useAccountsStore` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Mensagens SIP` be split into smaller, more focused modules?**
  _Cohesion score 0.05310734463276836 - nodes in this community are weakly interconnected._