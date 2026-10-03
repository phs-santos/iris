# SIP Bench — Especificação do softphone desktop

Oct 3, 2026 · @Henrilgrim

## Visão geral

O SIP Bench é um softphone desktop para desenvolvedores e QA testarem telefonia: registra várias contas de vários PBX ao mesmo tempo, liga entre elas e mostra o tráfego SIP de cada uma na mesma janela. Roda em Windows, macOS e Linux, construído com Electron e a biblioteca [easy-sipjs](https://www.npmjs.com/package/easy-sipjs) (versão 2.7.6). O conceito visual está [nesta página](https://claude.ai/artifact/TTjAHFVyYi7vRFxLPpL8XV).

**Objetivo.** Reduzir o tempo de montar e repetir um teste de telefonia (registro, chamada, URA, transferência) de vários softphones e um `sngrep` para uma única tela.

**Público.** Desenvolvedores que integram PBX e WebRTC, analistas de QA de telefonia e equipe de suporte N2/N3 que reproduz problemas de cliente.

**Dentro do escopo**

- Várias contas SIP sobre WebSocket seguro (WSS), de PBX diferentes, registradas em paralelo
- Chamadas de áudio: discar, atender, recusar, desligar, mudo, espera, DTMF, transferência
- Log de eventos e de SIP bruto por conta, com dados sensíveis removidos
- Saúde da conexão, diagnóstico de WebRTC e qualidade da chamada
- Cenários de teste salvos e repetíveis
- Modo simulado, sem PBX
- Instaladores para Windows, macOS e Linux com atualização automática

**Fora do escopo**

- SIP sobre UDP ou TCP puro. O PBX precisa aceitar WebRTC (WSS + DTLS-SRTP); para os demais, usa-se um gateway.
- Vídeo, chat e conferência
- Uso como softphone de atendimento em produção (fila, CRM, relatórios)
- Versão mobile

## Glossário

| Termo | Significado neste documento |
| --- | --- |
| Conta | Um ramal SIP cadastrado no app: ramal, senha, domínio e endereço WSS |
| PBX | Central telefônica que registra as contas (Asterisk, FreeSWITCH, Kamailio etc.) |
| Preset | Conjunto de ajustes prontos do easy-sipjs para `asterisk`, `kamailio` ou `generic` |
| WSS | WebSocket seguro, o transporte do SIP no WebRTC |
| REGISTER | Mensagem SIP que anuncia a conta ao PBX; o registro expira e é renovado |
| OPTIONS | Mensagem SIP usada como ping para medir se o PBX responde |
| DTMF | Tons do teclado numérico enviados na chamada (via SIP INFO ou RTP) |
| Transferência cega | Passa a chamada para outro número sem falar com ele antes (REFER) |
| Transferência assistida | Liga para o destino, conversa e depois junta as duas chamadas |
| BLF | Indicador de ocupado de outro ramal, via assinatura de presença |
| ICE / STUN / TURN | Mecanismos do WebRTC para atravessar NAT e estabelecer a mídia |
| Cenário | Sequência salva de passos de teste, por exemplo "liga, espera 2 s, DTMF 1, desliga" |
| Modo simulado | Provedor falso que imita um PBX, sem rede |

## Personas e casos de uso

| Persona | O que faz no dia a dia | O que precisa do SIP Bench |
| --- | --- | --- |
| Dev de integração | Integra sistemas com PBX e WebRTC | Ligar entre ramais de PBX diferentes e ver o SIP de cada lado |
| Analista de QA | Valida URAs, filas e regras de discagem | Repetir o mesmo roteiro de chamada e DTMF muitas vezes |
| Suporte N2/N3 | Reproduz problemas relatados por clientes | Importar contas, reproduzir e exportar um log limpo |
| Implantador de PBX | Sobe e configura PBX novos | Validar WSS, certificado, registro e áudio antes de entregar |

**Casos de uso principais**

1. **UC-01 Primeiro uso.** Instalar, cadastrar uma conta, testar a conexão e ver o registro ficar verde.
2. **UC-02 Chamada entre contas.** Ligar da conta A (PBX 1) para a conta B (PBX 2), atender em B, conversar e desligar.
3. **UC-03 Teste de URA.** Ligar para um número, ouvir a mensagem e enviar uma sequência de DTMF com pausas.
4. **UC-04 Transferência.** Em chamada, transferir de forma cega ou assistida e confirmar se completou.
5. **UC-05 Diagnóstico.** Uma conta não registra; o app mostra o código SIP e o motivo provável.
6. **UC-06 Cenário repetível.** Gravar um roteiro de passos e rodá-lo de novo com um clique.
7. **UC-07 Compartilhar configuração.** Exportar as contas para um colega, sem as senhas.
8. **UC-08 Demonstração sem PBX.** Usar o modo simulado para conhecer o app ou fazer uma apresentação.

## Requisitos funcionais

São 37 requisitos em cinco grupos: 15 essenciais, 16 importantes e 6 desejáveis. A coluna Marco indica em qual entrega do plano cada um entra.

### Contas e registro

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-01 | Cadastrar, editar, duplicar e excluir contas. Campos obrigatórios: nome, ramal, senha, domínio, WSS. Avançados: usuário de autenticação, nome de exibição, preset, provider (sipjs ou jssip), STUN/TURN, modo DTMF, cor | Essencial | M1 | Conta salva continua na lista depois de reiniciar o app |
| RF-02 | Agrupar as contas por PBX (domínio) na lista | Importante | M2 | Contas de dois domínios aparecem em dois grupos |
| RF-03 | Registrar e desregistrar cada conta, ou todas de uma vez | Essencial | M1 | Com 10 contas válidas, "Registrar todas" deixa as 10 registradas |
| RF-04 | Mostrar o estado de cada conta (desconectada, conectando, registrada, erro) com código e frase SIP do erro | Essencial | M1 | Senha errada mostra "401" ou "403" na conta, não um erro genérico |
| RF-05 | Testar a conexão antes de salvar a conta | Importante | M2 | O teste registra, informa o resultado e desregistra |
| RF-06 | Registrar ao abrir o app as contas marcadas para isso | Importante | M2 | Contas marcadas ficam registradas sem ação do usuário |
| RF-07 | Importar e exportar contas em JSON, sem senhas, a menos que o usuário marque a opção | Essencial | M1 | Arquivo exportado não contém o campo de senha por padrão |
| RF-08 | Renovar o registro e reconectar sozinho após queda de rede | Essencial | M1 | Após 30 s sem rede, a conta volta a registrada sem ação |

### Chamadas

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-09 | Discar a partir da conta escolhida, por teclado ou por atalhos para as outras contas e números salvos | Essencial | M1 | A chamada sai pela conta selecionada |
| RF-10 | Avisar chamada recebida com notificação do sistema, indicando a conta e quem liga; atender ou recusar | Essencial | M1 | Com a janela minimizada, a notificação aparece e permite atender |
| RF-11 | Atender automaticamente por conta, com atraso de 0 a 10 s | Essencial | M1 | Conta com auto-atender em 1 s atende sozinha |
| RF-12 | Manter várias chamadas ao mesmo tempo, de contas diferentes, cada uma em um cartão | Essencial | M1 | 4 chamadas simultâneas com controles independentes |
| RF-13 | Mudo, espera e retomar em cada chamada | Essencial | M1 | O outro lado deixa de ouvir no mudo e recebe música ou silêncio na espera |
| RF-14 | Enviar DTMF pelo teclado ou como sequência com pausas (ex.: `1,w2,4321#`), via SIP INFO, RTP ou automático | Essencial | M1 | A URA de teste recebe os dígitos na ordem e no tempo certos |
| RF-15 | Transferência cega | Importante | M2 | O destino toca e a chamada original sai do app |
| RF-16 | Transferência assistida entre duas chamadas da mesma conta | Importante | M2 | As duas pontas ficam conectadas entre si |
| RF-17 | Mostrar o progresso da transferência (100, 180, 200, 486…) | Importante | M2 | O cartão mostra se a transferência completou ou falhou |
| RF-18 | Enviar cabeçalhos SIP extras na chamada (ex.: `X-Test-Id`) | Importante | M2 | O cabeçalho aparece no INVITE do SIP bruto |
| RF-19 | Escolher microfone e alto-falante, no geral e por chamada, e ajustar o volume | Importante | M2 | Trocar o fone durante a chamada sem derrubá-la |
| RF-20 | Indicar se o toque ouvido é early media do PBX (183) ou ringback local | Desejável | Depois | O cartão mostra "early media" ao receber 183 com SDP |

### Log e diagnóstico

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-21 | Log de eventos legível com hora em milissegundos e filtros por conta, nível e texto | Essencial | M1 | Filtrar por uma conta esconde as linhas das outras |
| RF-22 | Aba de SIP bruto por conta, sem Authorization, nonce e senhas | Essencial | M1 | Nenhuma senha ou hash de autenticação aparece no log |
| RF-23 | Copiar o log ou salvá-lo em arquivo .txt e .json | Essencial | M1 | O arquivo salvo abre e contém o mesmo que a tela |
| RF-24 | Health check por conta: WebSocket, registro e OPTIONS com latência | Importante | M2 | Mostra a latência em ms e a hora da verificação |
| RF-25 | Diagnóstico de ambiente: microfone, dispositivos, ICE e TURN, com recomendação para cada aviso | Importante | M2 | Sem TURN configurado, aparece um aviso com a ação sugerida |
| RF-26 | Qualidade da chamada em tempo real: score, jitter, perda, RTT e codec | Importante | M2 | Os valores atualizam a cada 2 s durante a chamada |
| RF-27 | Presença e BLF das outras contas e de ramais escolhidos | Desejável | Depois | O ramal aparece como ocupado enquanto está em chamada |

### Cenários de teste

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-28 | Criar cenário com passos: registrar, discar, esperar, aguardar estado, DTMF, transferir, desligar e verificar | Importante | M3 | Um cenário de 6 passos é salvo e reaberto sem perdas |
| RF-29 | Executar o cenário e mostrar o resultado de cada passo (passou ou falhou, com tempo) | Importante | M3 | Um passo que espera "em chamada" e recebe 486 aparece como falhou |
| RF-30 | Executar um cenário N vezes e exportar um relatório | Desejável | M3 | 20 execuções geram um relatório com taxa de sucesso |
| RF-31 | Executar cenários pela linha de comando, sem janela, para uso em CI | Desejável | Depois | O comando retorna código de saída diferente de zero quando um passo falha |

### Aplicativo

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-32 | Modo simulado com contas de exemplo e um PBX falso | Essencial | M1 | O app funciona sem rede, com registro e chamadas simuladas |
| RF-33 | Ícone na bandeja com o estado geral; o app continua ativo com a janela fechada | Importante | M2 | Fechar a janela não derruba registros nem chamadas |
| RF-34 | Atalhos de teclado globais configuráveis para atender, desligar e mudo | Desejável | Depois | O atalho funciona com outro app em foco |
| RF-35 | Atualização automática, com canais estável e beta | Importante | M4 | Uma versão nova é baixada e aplicada ao reiniciar |
| RF-36 | Gravar a chamada em arquivo de áudio local | Desejável | Depois | O arquivo contém os dois lados da conversa |
| RF-37 | Aceitar certificado autoassinado de um host específico, com aviso explícito | Importante | M2 | Só o host aceito conecta; os demais continuam recusados |

## Requisitos não funcionais

Os números abaixo são metas iniciais para validar no M0 e ajustar se necessário.

| ID | Categoria | Requisito | Como verificar |
| --- | --- | --- | --- |
| RNF-01 | Plataformas | Roda em Windows 10 e 11 (x64), macOS 12 ou superior (Intel e Apple Silicon) e Ubuntu 22.04 ou superior (x64) | Smoke test em cada plataforma no CI e manualmente antes de cada release |
| RNF-02 | Compatibilidade de PBX | Funciona com Asterisk 18 ou superior (PJSIP + WSS), FreeSWITCH 1.10 ou superior e Kamailio 5.x como proxy WebRTC | Suíte de integração contra um Asterisk em contêiner; os demais por checklist manual |
| RNF-03 | Escala | Suporta 20 contas registradas e 4 chamadas simultâneas sem travar a interface | Teste de carga com PBX em contêiner |
| RNF-04 | Desempenho | Abre em até 3 s; interface responde em até 100 ms; registro de uma conta saudável em até 2 s | Medição automatizada no CI |
| RNF-05 | Recursos | Usa até 300 MB de RAM com 10 contas e 1 chamada; CPU ociosa abaixo de 2% | Monitor do sistema em teste de 1 h |
| RNF-06 | Confiabilidade | Reconecta após queda de rede ou reinício do PBX, com espera crescente e limite de tentativas configurável | Teste derrubando o contêiner do PBX |
| RNF-07 | Segurança | Senhas guardadas com a criptografia do sistema (Keychain, DPAPI, libsecret) via `safeStorage`; nunca em texto puro em disco | Inspeção do arquivo de dados |
| RNF-08 | Segurança | Renderer isolado: `contextIsolation` ligado, `nodeIntegration` desligado, sandbox ativo, CSP restrita e IPC com lista fechada de canais | Checklist de segurança do Electron no code review |
| RNF-09 | Segurança | Certificados inválidos recusados por padrão; exceção apenas por host, escolhida pelo usuário (RF-37) | Teste com certificado autoassinado |
| RNF-10 | Privacidade | Logs, arquivos exportados e relatórios não contêm senha, Authorization nem nonce; o app não envia telemetria sem consentimento | Teste automatizado que procura esses campos no log |
| RNF-11 | Usabilidade | Um usuário novo registra uma conta e faz a primeira chamada em até 2 minutos | Teste com 3 pessoas antes do 1.0 |
| RNF-12 | Usabilidade | Todas as ações principais têm atalho de teclado; estados usam cor e forma (não só cor); contraste WCAG AA | Revisão de acessibilidade |
| RNF-13 | Idioma | Interface em português do Brasil, com os textos em arquivos de tradução prontos para inglês | Nenhum texto fixo no código dos componentes |
| RNF-14 | Observabilidade | Log interno do app em arquivo rotativo (5 arquivos de 10 MB) para investigar falhas do próprio app | Arquivo presente na pasta de dados do usuário |
| RNF-15 | Manutenibilidade | TypeScript estrito, lint e formatação no CI, cobertura de testes de 70% ou mais na camada de domínio | Relatório de cobertura no CI |
| RNF-16 | Manutenibilidade | A camada SIP fica atrás de uma interface própria, para trocar ou atualizar o easy-sipjs sem mexer na interface | Revisão de arquitetura |
| RNF-17 | Distribuição | Instaladores assinados: `.exe` (NSIS) no Windows, `.dmg` assinado e notarizado no macOS, `.AppImage` e `.deb` no Linux | Pipeline de release gera e assina os artefatos |
| RNF-18 | Distribuição | Atualização automática com verificação de assinatura do pacote | Atualização de 1.0.0 para 1.0.1 em cada plataforma |
| RNF-19 | Portabilidade de dados | Contas e cenários em JSON versionado, com migração automática entre versões do app | Abrir dados de uma versão anterior sem perda |
| RNF-20 | Licenças | Somente dependências com licença compatível com o uso pretendido (easy-sipjs é ISC, SIP.js é MIT) | Verificação de licenças no CI |

## Arquitetura

O app usa Electron com Vue 3 e TypeScript. O motor SIP (easy-sipjs) roda no processo de interface, porque precisa do WebRTC do Chromium. O processo principal cuida do que é do sistema operacional: arquivos, senhas, bandeja, notificações, certificados e atualização.

&#91;embedded content: arquitetura · 3 processos, 2 PBX\]

A interface só fala com o sistema pela API fixa do preload; cada conta abre sua própria conexão WSS com o PBX dela.

**Por que Electron e não Tauri.** O Electron leva o mesmo Chromium para os três sistemas, então o WebRTC se comporta igual em todos. O Tauri usa o navegador do sistema, e no Linux (WebKitGTK) o suporte a WebRTC é limitado. O custo do Electron é um instalador maior (cerca de 100 MB) e mais memória, aceitável para uma ferramenta de desenvolvedor.

**Stack**

| Camada | Escolha |
| --- | --- |
| Casca desktop | Electron, com electron-vite para build e electron-builder para instaladores |
| Interface | Vue 3 + Pinia + TypeScript |
| SIP e WebRTC | easy-sipjs 2.7.x (SIP.js por padrão, JsSIP opcional) |
| Atualização | electron-updater, publicando no GitHub Releases ou num servidor interno |
| Testes | Vitest (unidade), Playwright para Electron (ponta a ponta), Asterisk em Docker (integração) |

**Módulos**

| Processo | Módulo | Responsabilidade |
| --- | --- | --- |
| Principal | Janela e bandeja | Cria a janela, mantém o app vivo na bandeja, mostra o estado geral |
| Principal | Armazenamento | Lê e grava contas, cenários e preferências em JSON na pasta de dados do usuário |
| Principal | Cofre de senhas | Criptografa senhas com `safeStorage` em arquivo separado |
| Principal | Certificados e mídia | Libera o microfone para a janela e aplica as exceções de certificado por host |
| Principal | Notificações e atalhos | Notificação de chamada recebida e atalhos globais |
| Principal | Atualizador e log do app | Verifica versões e grava o log interno rotativo |
| Preload | Ponte | Expõe uma API tipada `window.bench` com canais fixos de IPC |
| Interface | Motor SIP | Interface própria `SipEngine`, com duas implementações: easy-sipjs e simulada |
| Interface | Gerenciador de contas | Um `SipClient` por conta; converte os eventos da biblioteca em estado da tela |
| Interface | Chamadas e áudio | Um elemento de áudio por chamada, escolha de dispositivo, toque central |
| Interface | Log | Memória circular de 10 mil linhas por conta, filtros e exportação |
| Interface | Executor de cenários | Roda os passos, espera estados e registra o resultado |
| Interface | Diagnóstico | Usa `checkHealth()`, `diagnose()` e `getQuality()` da biblioteca |

**Modelo de dados** (arquivos na pasta de dados do usuário)

| Arquivo | Conteúdo principal |
| --- | --- |
| `accounts.json` | id, nome, cor, preset, provider, domínio, ramal, usuário de autenticação, WSS, STUN/TURN, modo DTMF, registrar ao abrir, auto-atender e atraso, atalhos de discagem |
| `secrets.bin` | Senhas por id de conta, criptografadas pelo sistema |
| `scenarios.json` | id, nome, conta de origem, lista de passos com tipo e parâmetros |
| `settings.json` | Dispositivos de áudio, toque, tema, canal de atualização, hosts de certificado aceitos |
| `logs/` | Log interno do app e logs SIP salvos pelo usuário |

Todo arquivo JSON leva um campo `schemaVersion` para a migração entre versões (RNF-19).

**Pontos de atenção técnicos**

- Cada `SipClient` toca o próprio ringtone. O app passa um som vazio para a biblioteca e toca um toque central, para não sobrepor sons com várias contas.
- O modo simulado usa a opção `customProvider` da biblioteca, então a interface não distingue PBX real de simulado.
- O log SIP bruto exige `debug: true` na conta; a biblioteca já remove dados sensíveis antes de entregar a linha.

## Interface

A janela principal tem três colunas fixas: contas à esquerda, discador e chamadas no centro, log à direita. As demais telas abrem como painéis sobre ela. Os desenhos estão na [página de conceito](https://claude.ai/artifact/TTjAHFVyYi7vRFxLPpL8XV).

| Tela | O que mostra | Requisitos |
| --- | --- | --- |
| Principal | Contas agrupadas por PBX com ponto de estado; discador com conta de origem e atalhos; cartões de chamada; log com abas Eventos, SIP bruto e Saúde | RF-02 a RF-04, RF-09 a RF-14, RF-21, RF-22 |
| Conta | Formulário com 5 campos obrigatórios e seção Avançado; botões Testar conexão e Salvar e registrar | RF-01, RF-05, RF-06, RF-11 |
| Chamada recebida | Notificação do sistema e cartão destacado com Atender e Recusar | RF-10 |
| Transferir | Campo de destino (cega) ou lista das outras chamadas da conta (assistida), com progresso | RF-15 a RF-17 |
| Saúde | Lista de verificação por conta, com recomendação em cada aviso | RF-24, RF-25, RF-37 |
| Qualidade | Score, jitter, perda, RTT e codec da chamada selecionada | RF-26 |
| Cenários | Lista de cenários, editor de passos e resultado de cada execução | RF-28 a RF-30 |
| Preferências | Áudio, toque, tema, atualização, hosts de certificado aceitos | RF-19, RF-35, RF-37 |
| Importar e exportar | Escolha de arquivo e opção de incluir senhas | RF-07 |

**Estados visuais da conta**

| Estado | Ponto | Texto sob o nome |
| --- | --- | --- |
| Desconectada | Cinza | "desconectada" |
| Conectando | Amarelo pulsando | "conectando" ou "reconectando 2/5" |
| Registrada | Verde | Latência do último OPTIONS, ex.: "42 ms" |
| Erro | Vermelho | Código e frase SIP, ex.: "403 Forbidden" |

**Atalhos de teclado**

| Ação | Atalho |
| --- | --- |
| Focar o discador | Ctrl/Cmd + L |
| Ligar | Enter no discador |
| Atender a chamada que está tocando | Ctrl/Cmd + Enter |
| Desligar a chamada selecionada | Ctrl/Cmd + E |
| Mudo | Ctrl/Cmd + M |
| Espera | Ctrl/Cmd + H |
| Trocar de conta de origem | Ctrl/Cmd + 1 a 9 |

**Fluxos principais**

1. **Primeiro uso:** abrir o app, criar conta, testar conexão, salvar e registrar, ver o ponto verde.
2. **Chamada entre contas:** selecionar a conta A, clicar no atalho da conta B, ligar; B toca na mesma janela e atende (ou auto-atende); os dois cartões ficam lado a lado e o log intercala os eventos por horário.
3. **Teste de URA:** discar o número da URA, ouvir, enviar a sequência `1,w2,4321#` e conferir os dígitos no log.
4. **Transferência:** em chamada, clicar em Transferir, escolher cega ou assistida, acompanhar 100, 180 e 200 no cartão.

## Plano de entrega

A versão 1.0 sai em cinco marcos e cerca de 10 semanas, com uma pessoa desenvolvendo em tempo integral e apoio parcial de QA. Cada marco termina numa versão instalável. As datas do cronograma abaixo supõem início em 12 de outubro de 2026 e são estimativas.

&#91;embedded content: cronograma · 5 marcos até a versão 1.0\]

O MVP (M1) é o marco mais longo; a partir dele o app já serve para testes reais.

| Marco | Versão | Entregas | Critério de saída |
| --- | --- | --- | --- |
| M0 Fundação | 0.0 | Repositório, Electron + Vue + TS, CI com lint e testes, Asterisk de teste em Docker, prova de conceito: uma conta do easy-sipjs registrando e ligando dentro do Electron | Chamada com áudio nos dois sentidos dentro do app, nos três sistemas |
| M1 MVP | 0.1 alfa interna | Contas (RF-01, 03, 04, 07, 08), chamadas (RF-09 a 14), log (RF-21 a 23), modo simulado (RF-32) | UC-01, UC-02 e UC-03 funcionam de ponta a ponta contra o Asterisk de teste |
| M2 Diagnóstico e transferência | 0.2 | RF-02, 05, 06, 15 a 19, 24 a 26, 33, 37 | UC-04 e UC-05 funcionam; 20 contas registradas sem travar (RNF-03) |
| M3 Cenários | 0.3 beta | RF-28 a 30, editor e executor de cenários | Um cenário de URA roda 20 vezes seguidas com relatório |
| M4 Lançamento | 1.0 | Instaladores assinados (RNF-17), atualização automática (RF-35), revisão de segurança e acessibilidade, guia de uso, teste com 3 usuários (RNF-11) | Todos os requisitos essenciais e importantes aprovados; nenhum defeito crítico aberto |

**Depois do 1.0** (sem data): RF-20 early media, RF-27 BLF, RF-31 cenários na linha de comando, RF-34 atalhos globais, RF-36 gravação de chamada.

**Primeiras tarefas do M0**

- [ ] Criar o repositório e escolher a licença
- [ ] Montar o esqueleto com electron-vite, Vue 3, Pinia e TypeScript estrito
- [ ] Configurar CI com lint, testes e build nos três sistemas
- [ ] Subir um Asterisk com PJSIP, WSS e dois ramais de teste em Docker
- [ ] Prova de conceito: registrar e ligar com easy-sipjs dentro do Electron
- [ ] Definir a interface `SipEngine` e o formato dos arquivos JSON

## Estratégia de testes

O próprio produto é uma ferramenta de teste, então a base dos testes é um PBX real em contêiner, além do modo simulado para o que não depende de rede.

| Nível | O que cobre | Ferramenta | Quando roda |
| --- | --- | --- | --- |
| Unidade | Gerenciador de contas, log, parser de sequência DTMF, executor de cenários, migração de dados | Vitest com motor simulado | Todo push |
| Integração | Registro, chamada entre dois ramais, DTMF, espera, transferência | Vitest + Asterisk em Docker | Todo push no CI Linux |
| Ponta a ponta | Fluxos UC-01 a UC-04 pela interface | Playwright para Electron, em modo simulado | Todo pull request, nos três sistemas |
| Carga | 20 contas e 4 chamadas (RNF-03, RNF-05) | Script com Asterisk em Docker | Antes de cada marco |
| Manual | Áudio real, fones Bluetooth, troca de dispositivo, FreeSWITCH e Kamailio | Checklist de release | Antes de cada versão |
| Segurança | Checklist do Electron, busca de senhas em logs e exportações, licenças | Revisão + teste automatizado | M4 |

**Definição de pronto para cada requisito:** critério de aceitação atendido, teste automatizado quando possível, revisão de código feita e texto da interface em arquivo de tradução.

## Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| PBX do usuário sem WebRTC (só UDP/TCP) | O app não conecta | Documentar o requisito na tela de conta e no guia; indicar gateway WebRTC (ex.: Kamailio ou Asterisk como ponte) |
| Certificado autoassinado no WSS | Falha silenciosa de conexão | Detectar o erro de certificado e oferecer a exceção por host (RF-37) |
| easy-sipjs é recente e muda rápido (17 versões em 2026) | Quebras ao atualizar | Fixar a versão, isolar atrás de `SipEngine` (RNF-16), testes de integração antes de atualizar |
| Áudio sem som atrás de NAT simétrico | Chamada muda | Campo de TURN na conta e aviso no diagnóstico |
| Várias chamadas disputando o mesmo microfone | Eco ou áudio cortado | Uma chamada ativa por vez com áudio aberto; as demais em espera por padrão |
| Assinatura de código (Apple e Windows) exige contas pagas | Instalador bloqueado pelo sistema | Providenciar os certificados no M0; até lá, builds não assinados só para uso interno |

## Decisões

**Tomadas**

- Produto desktop, multiplataforma (pedido do usuário em 3 de outubro de 2026)
- Electron em vez de Tauri, pela consistência do WebRTC
- easy-sipjs como motor SIP, atrás da interface `SipEngine`
- Contas guardadas localmente, senhas no cofre do sistema, importação e exportação em JSON

**Em aberto**

- [x] Nome definitivo do produto: Íris
- [x] Licença: código aberto, MIT (decidido em 3 de outubro de 2026)
- [x] Onde publicar instaladores e atualizações: GitHub Releases (decidido em 3 de outubro de 2026)
- [ ] Quem providencia os certificados de assinatura da Apple e da Microsoft
- [ ] Quais PBX além do Asterisk entram nos testes automáticos
