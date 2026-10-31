# SIP Bench — Especificação do softphone desktop

Oct 3, 2026 · @Henrilgrim

> **Atualizada em 31/10/2026 para a Íris 2.0.** O produto se chama Íris. Na 2.0 a Íris ficou mais simples, a pedido do usuário: uma tela só, para ligar escolhendo a conta e, de vez em quando, depurar. Os requisitos que saíram estão na seção "Retirados em 29/10/2026", com o motivo; as tabelas abaixo têm só o que vale. O desenho da 2.0 está em [superpowers/specs/2026-10-29-iris-mais-simples-design.md](superpowers/specs/2026-10-29-iris-mais-simples-design.md).

## Visão geral

O SIP Bench é um softphone desktop para desenvolvedores e QA testarem telefonia: registra várias contas de vários PBX ao mesmo tempo, liga entre elas e mostra o tráfego SIP de cada uma na mesma janela. Roda em Windows, macOS e Linux, construído com Electron e a biblioteca [easy-sipjs](https://www.npmjs.com/package/easy-sipjs) (versão 2.7.6). O conceito visual está [nesta página](https://claude.ai/artifact/TTjAHFVyYi7vRFxLPpL8XV).

**Objetivo.** Reduzir o tempo de montar e repetir um teste de telefonia (registro, chamada, URA, transferência) de vários softphones e um `sngrep` para uma única tela.

**Público.** Desenvolvedores que integram PBX e WebRTC, analistas de QA de telefonia e equipe de suporte N2/N3 que reproduz problemas de cliente.

**Dentro do escopo**

- Várias contas SIP, de PBX diferentes, registradas em paralelo: por SIP puro (UDP, TCP ou TLS, com motor próprio, RF-39), que é o padrão, ou por WebSocket seguro (WSS) com WebRTC, como opção avançada
- Chamadas de áudio: discar, atender, recusar, desligar, mudo, espera, DTMF, transferência, gravação
- Log de eventos e de SIP bruto por conta, com dados sensíveis removidos, e o fluxo SIP de cada chamada
- Saúde da conexão, diagnóstico de microfone e de rede, e qualidade da chamada
- Modo simulado, sem PBX
- Instaladores para Windows, macOS e Linux com atualização automática

**Fora do escopo**

- Chat, mensagens de texto e conferência
- Vídeo (RF-52, retirado na 2.0)
- Cenários de teste automatizados, até voltarem repensados (retirados na 2.0)
- Uso como softphone de atendimento em produção (fila, CRM, relatórios)
- Versão mobile

## Glossário

| Termo | Significado neste documento |
| --- | --- |
| Conta | Um ramal SIP cadastrado no app: nome, servidor, ramal e senha |
| Servidor | Os dados de conexão de um PBX (domínio, transporte, endereço), escritos uma vez e usados pelas contas |
| Etiqueta | Nome e cor que marcam contas, para buscar e filtrar |
| Conta atual | A conta de onde sai a próxima chamada, escolhida no seletor |
| PBX | Central telefônica que registra as contas (Asterisk, FreeSWITCH, Kamailio etc.) |
| Preset | Conjunto de ajustes prontos do easy-sipjs para `asterisk`, `kamailio` ou `generic`; não aparece na tela, vem do servidor |
| WSS | WebSocket seguro, o transporte do SIP no WebRTC |
| REGISTER | Mensagem SIP que anuncia a conta ao PBX; o registro expira e é renovado |
| OPTIONS | Mensagem SIP usada como ping para medir se o PBX responde |
| DTMF | Tons do teclado numérico enviados na chamada (via SIP INFO ou RTP) |
| Transferência cega | Passa a chamada para outro número sem falar com ele antes (REFER) |
| Transferência assistida | Liga para o destino, conversa e depois junta as duas chamadas |
| ICE / STUN / TURN | Mecanismos do WebRTC para atravessar NAT e estabelecer a mídia |
| Modo simulado | Provedor falso que imita um PBX, sem rede; na tela, é o servidor fixo "PBX simulado" |
| Codec | Forma de codificar o áudio: G.722, PCMA e PCMU (G.711) e Opus |

## Personas e casos de uso

| Persona | O que faz no dia a dia | O que precisa do SIP Bench |
| --- | --- | --- |
| Dev de integração | Integra sistemas com PBX e WebRTC | Ligar entre ramais de PBX diferentes e ver o SIP de cada lado |
| Analista de QA | Valida URAs, filas e regras de discagem | Ligar de várias contas e mandar DTMF, vendo o SIP de cada lado |
| Suporte N2/N3 | Reproduz problemas relatados por clientes | Importar contas, reproduzir e exportar um log limpo |
| Implantador de PBX | Sobe e configura PBX novos | Validar WSS, certificado, registro e áudio antes de entregar |

**Casos de uso principais**

1. **UC-01 Primeiro uso.** Instalar, cadastrar uma conta, testar a conexão e ver o registro ficar verde.
2. **UC-02 Chamada entre contas.** Ligar da conta A (PBX 1) para a conta B (PBX 2), atender em B, conversar e desligar.
3. **UC-03 Teste de URA.** Ligar para um número, ouvir a mensagem e enviar uma sequência de DTMF com pausas.
4. **UC-04 Transferência.** Em chamada, transferir de forma cega ou assistida e confirmar se completou.
5. **UC-05 Diagnóstico.** Uma conta não registra; o app mostra o código SIP e o motivo provável.
6. ~~**UC-06 Cenário repetível.**~~ Retirado na 2.0 com os cenários.
7. **UC-07 Compartilhar configuração.** Exportar as contas para um colega, sem as senhas.
8. **UC-08 Demonstração sem PBX.** Usar o modo simulado para conhecer o app ou fazer uma apresentação.

## Requisitos funcionais

Desde a 2.0 são 40 requisitos: 15 essenciais, 20 importantes e 5 desejáveis. A coluna Marco indica em qual entrega do plano cada um entrou. Os números dos requisitos retirados não são reaproveitados.

### Contas e registro

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-01 | Cadastrar, editar, duplicar e excluir contas. Campos à vista: **nome** (obrigatório, identifica a conta), **etiquetas** (da lista configurada, RF-61; dá para criar uma ali), **servidor** (obrigatório, da lista de servidores, RF-51; a última opção cria um servidor novo), **ramal** e **senha** (obrigatórios). Em **Avançado**, fechado por padrão: transporte (UDP padrão, TCP, TLS ou WebSocket; vem do servidor e pode ser trocado), usuário de autenticação (vazio = ramal), endereço:porta (vazio = do servidor), nome de exibição, DTMF (RTP ou SIP INFO), registrar ao abrir, exigir SRTP, atender sozinho com atraso, toque e cor; com WebSocket, endereço WSS, STUN/TURN e early media. Revisado na 2.0 | Essencial | M1 | Conta salva continua na lista depois de reiniciar o app; sem nome ou sem servidor, a conta não é salva |
| RF-02 | Agrupar as contas por servidor no seletor de contas, com o nome e o transporte do servidor no cabeçalho do grupo. Revisado na 2.0 (antes era por domínio) | Importante | M2 | Contas de dois servidores aparecem em dois grupos; o PBX simulado é um grupo |
| RF-03 | Registrar e desregistrar cada conta, ou todas de uma vez | Essencial | M1 | Com 10 contas válidas, "Registrar todas" deixa as 10 registradas |
| RF-04 | Mostrar o estado de cada conta (desconectada, conectando, registrada, erro) com código e frase SIP do erro | Essencial | M1 | Senha errada mostra "401" ou "403" na conta, não um erro genérico |
| RF-05 | Testar a conexão antes de salvar a conta | Importante | M2 | O teste registra, informa o resultado e desregistra |
| RF-06 | Registrar ao abrir o app as contas marcadas para isso | Importante | M2 | Contas marcadas ficam registradas sem ação do usuário |
| RF-07 | Importar e exportar contas em JSON, sem senhas, a menos que o usuário marque a opção | Essencial | M1 | Arquivo exportado não contém o campo de senha por padrão |
| RF-08 | Renovar o registro e reconectar sozinho após queda de rede | Essencial | M1 | Após 30 s sem rede, a conta volta a registrada sem ação |

### Chamadas

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-09 | Discar a partir da conta atual, pelo campo ou pelo teclado de 12 teclas, com sugestão dos contatos da conta enquanto se digita (RF-50). As discagens rápidas da conta saíram na 2.0 e viraram contatos | Essencial | M1 | A chamada sai pela conta atual |
| RF-10 | Avisar chamada recebida com notificação do sistema, indicando a conta e quem liga; atender ou recusar | Essencial | M1 | Com a janela minimizada, a notificação aparece e permite atender |
| RF-11 | Atender automaticamente por conta, com atraso de 0 a 10 s | Essencial | M1 | Conta com auto-atender em 1 s atende sozinha |
| RF-12 | Manter várias chamadas ao mesmo tempo, de contas diferentes, cada uma numa linha da coluna de chamadas, com a conta indicada | Essencial | M1 | 4 chamadas simultâneas com controles independentes |
| RF-13 | Mudo, espera e retomar em cada chamada | Essencial | M1 | O outro lado deixa de ouvir no mudo e recebe música ou silêncio na espera |
| RF-14 | Enviar DTMF pelo teclado ou como sequência com pausas (ex.: `1,w2,4321#`), via SIP INFO, RTP ou automático | Essencial | M1 | A URA de teste recebe os dígitos na ordem e no tempo certos |
| RF-15 | Transferência cega | Importante | M2 | O destino toca e a chamada original sai do app |
| RF-16 | Transferência assistida entre duas chamadas da mesma conta | Importante | M2 | As duas pontas ficam conectadas entre si |
| RF-17 | Mostrar o progresso da transferência (100, 180, 200, 486…) | Importante | M2 | A linha da chamada mostra se a transferência completou ou falhou |
| RF-18 | Enviar cabeçalhos SIP extras na chamada (ex.: `X-Test-Id`) | Importante | M2 | O cabeçalho aparece no INVITE do SIP bruto |
| RF-19 | Escolher microfone e alto-falante, no geral e por chamada, e ajustar o volume | Importante | M2 | Trocar o fone durante a chamada sem derrubá-la |
| RF-20 | Indicar se o som antes do atendimento é early media do PBX (183) ou o toque local, e tocar esse áudio. Em SIP puro sempre; em WebSocket por opção da conta, desligada por padrão, porque a biblioteca derruba a chamada se o PBX bifurcar o INVITE. Feito na 1.8 | Desejável | 1.8 | Ligando para um destino que responde 183 com áudio, a linha da chamada mostra "early media" e o medidor mostra o áudio antes do atendimento |

### Log e diagnóstico

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-21 | Log de eventos legível com hora em milissegundos e filtros por conta, nível e texto | Essencial | M1 | Filtrar por uma conta esconde as linhas das outras |
| RF-22 | Aba de SIP bruto por conta, sem Authorization, nonce e senhas | Essencial | M1 | Nenhuma senha ou hash de autenticação aparece no log |
| RF-23 | Copiar o log ou salvá-lo em arquivo .txt e .json | Essencial | M1 | O arquivo salvo abre e contém o mesmo que a tela |
| RF-24 | Health check por conta: WebSocket, registro e OPTIONS com latência | Importante | M2 | Mostra a latência em ms e a hora da verificação |
| RF-25 | Diagnóstico de ambiente: microfone, dispositivos, ICE e TURN, com recomendação para cada aviso | Importante | M2 | Sem TURN configurado, aparece um aviso com a ação sugerida |
| RF-26 | Qualidade da chamada em tempo real: jitter, perda, RTT, codec e o medidor do áudio que chega | Importante | M2 | Os valores atualizam a cada 2 s durante a chamada |

### Aplicativo

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-32 | Modo simulado com contas de exemplo e um PBX falso. Desde a 2.0, é o servidor fixo "PBX simulado" (RF-51) | Essencial | M1 | O app funciona sem rede, com registro e chamadas simuladas |
| RF-33 | Ícone na bandeja com o estado geral; o app continua ativo com a janela fechada | Importante | M2 | Fechar a janela não derruba registros nem chamadas |
| RF-35 | Atualização automática, com canais estável e beta | Importante | M4 | Uma versão nova é baixada e aplicada ao reiniciar |
| RF-36 | Gravar a chamada em arquivo de áudio local (WAV, um lado em cada canal). Só em SIP puro; em WebSocket, depois. Feito na 1.6 | Desejável | 1.6 | O arquivo contém os dois lados da conversa |
| RF-37 | Aceitar certificado autoassinado de um host específico, com aviso explícito | Importante | M2 | Só o host aceito conecta; os demais continuam recusados |
| RF-39 | SIP puro por UDP, TCP ou TLS com motor próprio em TypeScript, sem biblioteca nativa, atrás da interface `SipEngine`. Três entregas: (1) registro, renovação, OPTIONS e Saúde; (2) chamadas com G.711 e DTMF (RFC 4733 e SIP INFO); (3) espera, transferência, SRTP e qualidade por RTCP. Feito na 1.5; desde a 2.0, é o transporte padrão das contas | Importante | Depois do M4 | Entrega 1: um ramal registra no Asterisk por UDP, por TCP e por TLS, renova o registro e aparece nos contatos do PBX. Entrega 2: chamada com áudio nos dois sentidos entre um ramal de SIP puro e um ramal WebRTC. Entrega 3: as mesmas ações de chamada do WebRTC |

### Depois do 1.5 (pedidos pelo usuário em 04/10/2026)

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-46 | Diagnóstico de rede na Saúde: registros DNS SRV do domínio, certificado TLS do PBX (emissor, validade, nomes) e endereço público visto por um servidor STUN | Desejável | 1.6 | Para um domínio com SRV, a tela lista os destinos e as portas |
| RF-47 | Mais codecs em SIP puro, além do G.711: Opus (feito na 1.6, em banda estreita) e G.722 (feito na 1.8, em banda larga: o microfone e o alto-falante do motor próprio passaram a 16 kHz; a gravação e o medidor continuam a 8 kHz) | Desejável | 1.6 e 1.8 | Chamada com um ramal que só aceita Opus completa com áudio; chamada entre um ramal só G.722 e um só G.711 leva o mesmo tom de um lado ao outro |
| RF-48 | Contas em lote por planilha CSV (colunas nome, ramal, servidor e senha; o servidor é o nome ou o domínio de um servidor cadastrado). As variáveis nos cenários saíram na 2.0, com os cenários | Importante | 1.6 | Um CSV com 20 linhas cria 20 contas |
| RF-50 | Contatos por conta: nome, número e observação. Cada contato pertence a uma conta e só aparece para ela: como sugestão no discador enquanto se digita (número ou nome; ↑/↓ escolhe, Enter liga) e como nome de quem liga numa chamada recebida daquela conta. Cria-se pelo "+ Salvar como contato" do discador ou numa chamada; edita-se e apaga-se pela janela de contatos da conta (clique direito no seletor). Importar e exportar em CSV, por conta. Revisado na 2.0: antes a agenda era global, com empresa, favoritos e conta preferida | Importante | 1.6 | Um contato salvo numa conta aparece como sugestão ao digitar o começo do nome e não aparece em outra conta; quando ele liga, a chamada recebida mostra o nome |
| RF-51 | Cadastro de servidores (PBX), numa janela própria: nome, domínio e transporte (UDP padrão) obrigatórios, endereço:porta, e em Avançado SRTP e DTMF padrão (com WebSocket, WSS e STUN/TURN); Testar manda um OPTIONS e mostra a latência. Editar o servidor atualiza todas as contas ligadas a ele e registra de novo as que estavam no ar; um servidor em uso não pode ser apagado. O **PBX simulado** (RF-32) é um servidor fixo, sempre presente, que não se edita nem se apaga: escolher esse servidor cria uma conta simulada. Revisado na 2.0 | Importante | 1.6 | Trocar o endereço de um servidor muda as três contas que o usam, sem editar uma por uma |

### Depois do 1.7 (pedidos pelo usuário em 04/10/2026)

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-55 | Toque de chamada por conta, entre os que vêm com o app (clássico, digital, suave, sino ou nenhum), com volume. Os botões de mídia do fone saíram na 2.0 | Desejável | 1.8 | Duas contas com toques diferentes soam diferente ao receber chamada |

### Na 2.0 (pedidos pelo usuário em 29/10/2026)

| ID | Requisito | Prioridade | Marco | Critério de aceitação |
| --- | --- | --- | --- | --- |
| RF-60 | Ordem dos codecs: em Ajustes → Áudio, a lista G.722, PCMA (G.711 A), PCMU (G.711 µ) e Opus se reordena arrastando ou pelos botões ↑/↓ (teclado, RNF-12), e cada codec pode ser ligado ou desligado; pelo menos um fica ligado. Vale para todas as contas de SIP puro: é a ordem da oferta no INVITE e a escolha na resposta a uma chamada recebida. Padrão: G.722, PCMU, PCMA, Opus. Fica em `settings.json` (campo `codecs`, opcional). Em WebSocket a ordem é a do Chromium, e a tela diz isso | Importante | 2.0 | Com PCMA em primeiro, o INVITE oferece PCMA primeiro, e a resposta a uma chamada recebida escolhe PCMA se a oferta tiver PCMA |
| RF-61 | Etiquetas: cadastradas uma vez em Ajustes → Etiquetas, com nome e cor. A mesma etiqueta serve para várias contas; renomear ou mudar a cor vale em todas, e apagar tira de todas. No cadastro da conta, escolhem-se da lista (e dá para criar uma ali). No seletor de contas, servem para buscar e filtrar; o agrupamento continua por servidor. Ficam em `tags.json` | Importante | 2.0 | Uma etiqueta posta em duas contas filtra as duas no seletor; mudar a cor dela muda nas duas; apagá-la tira das duas |

## Requisitos não funcionais

Os números abaixo são metas iniciais para validar no M0 e ajustar se necessário.

| ID | Categoria | Requisito | Como verificar |
| --- | --- | --- | --- |
| RNF-01 | Plataformas | Roda em Windows 10 e 11 (x64), macOS 12 ou superior (Intel e Apple Silicon) e Ubuntu 22.04 ou superior (x64) | Smoke test em cada plataforma no CI e manualmente antes de cada release |
| RNF-02 | Compatibilidade de PBX | Funciona com Asterisk 18 ou superior (PJSIP + WSS), FreeSWITCH 1.10 ou superior e Kamailio 5.x como proxy WebRTC | Suíte de integração contra um Asterisk em contêiner; os demais por checklist manual |
| RNF-03 | Escala | Suporta 20 contas registradas e 4 chamadas simultâneas sem travar a interface | Teste manual com PBX em contêiner (o teste de carga automático saiu na 2.0) |
| RNF-04 | Desempenho | Abre em até 3 s; interface responde em até 100 ms; registro de uma conta saudável em até 2 s | Medição automatizada no CI |
| RNF-05 | Recursos | Usa até 300 MB de RAM com 10 contas e 1 chamada; CPU ociosa abaixo de 2% | Monitor do sistema em teste de 1 h |
| RNF-06 | Confiabilidade | Reconecta após queda de rede ou reinício do PBX, com espera crescente e limite de tentativas configurável | Testes de unidade da regra de reconexão; derrubar o contêiner do PBX à mão (o teste de tela que fazia isso saiu em 31/10/2026) |
| RNF-07 | Segurança | Senhas guardadas em arquivo local cifrado (AES-256-GCM) na pasta de dados, legível só pelo usuário; nunca em texto puro em disco. O cofre do sistema foi deixado de lado em 04/10/2026, por decisão do usuário, porque pedia a senha de login a cada versão sem assinatura | Inspeção do arquivo de dados |
| RNF-08 | Segurança | Renderer isolado: `contextIsolation` ligado, `nodeIntegration` desligado, sandbox ativo, CSP restrita e IPC com lista fechada de canais | Checklist de segurança do Electron no code review |
| RNF-09 | Segurança | Certificados inválidos recusados por padrão; exceção apenas por host, escolhida pelo usuário (RF-37) | Teste com certificado autoassinado |
| RNF-10 | Privacidade | Logs, arquivos exportados e relatórios não contêm senha, Authorization nem nonce; o app não envia telemetria sem consentimento | Teste automatizado que procura esses campos no log |
| RNF-11 | Usabilidade | Um usuário novo registra uma conta e faz a primeira chamada em até 2 minutos, só com a tela: o guia de uso dentro do app saiu em 31/10/2026, a pedido do usuário | Teste com 3 pessoas |
| RNF-12 | Usabilidade | Todas as ações principais têm atalho de teclado; estados usam cor e forma (não só cor); contraste WCAG AA | Revisão de acessibilidade |
| RNF-13 | Idioma | Interface em português do Brasil, com os textos num catálogo (`i18n/pt-BR.ts`), fora dos componentes. A tradução para inglês (RF-56) saiu na 2.0 | Nenhum texto fixo no código dos componentes (`scripts/check-i18n.mjs` no lint) |
| RNF-14 | Observabilidade | Log interno do app em arquivo rotativo (5 arquivos de 10 MB) para investigar falhas do próprio app | Arquivo presente na pasta de dados do usuário |
| RNF-15 | Manutenibilidade | TypeScript estrito, lint e formatação no CI, cobertura de testes de 70% ou mais na camada de domínio | Relatório de cobertura no CI |
| RNF-16 | Manutenibilidade | A camada SIP fica atrás de uma interface própria, para trocar ou atualizar o easy-sipjs sem mexer na interface | Revisão de arquitetura |
| RNF-17 | Distribuição | Instaladores assinados: `.exe` (NSIS) no Windows, `.dmg` assinado e notarizado no macOS, `.AppImage` e `.deb` no Linux | Pipeline de release gera e assina os artefatos |
| RNF-18 | Distribuição | Atualização automática com verificação de assinatura do pacote | Atualização de 1.0.0 para 1.0.1 em cada plataforma |
| RNF-19 | Portabilidade de dados | Contas, servidores, etiquetas, contatos e preferências em JSON versionado (`schemaVersion`), com migração automática entre versões do app. Exceção decidida pelo usuário em 30/10/2026: a 2.0 apaga os dados das versões 1.x na primeira abertura, sem migrar | Abrir dados de uma versão anterior (a partir da 2.0) sem perda |
| RNF-20 | Licenças | Somente dependências com licença compatível com o uso pretendido (easy-sipjs é ISC, SIP.js é MIT) | Verificação de licenças no CI |

## Retirados em 29/10/2026

Na 2.0 a Íris ficou mais simples, a pedido do usuário. O uso real dele (único usuário) é **fazer uma ligação escolhendo de qual conta ela sai**, com contas por UDP como num softphone comum, e **de vez em quando** depurar uma chamada (ver o que chega e o que sai). O resto deixava a tela confusa e obrigava a manter tudo em dobro. Os requisitos abaixo saíram do aplicativo, com código, testes, textos e dados; os números não são reaproveitados.

| ID | Requisito | Motivo |
| --- | --- | --- |
| RF-27 | Presença e BLF de ramais escolhidos e aviso de correio de voz (MWI) | Não é usado para ligar nem para depurar |
| RF-28, 29, 30 | Cenários de teste: criar, executar e repetir N vezes com relatório | Não eram usados como estavam. Devem voltar depois, repensados; a barra de ícones da 2.0 já tem lugar para eles |
| RF-31 | Cenários pela linha de comando, para CI | Sai com os cenários |
| RF-34 | Atalhos de teclado globais | Pouco uso; os atalhos dentro da janela ficam (RNF-12) |
| RF-38 | Ajuda de IA para explicar o log, pela OpenRouter | Pouco uso; a chave da OpenRouter some das preferências |
| RF-40 | Histórico de chamadas | A coluna de chamadas e o log bastam; `history.json` é apagado |
| RF-41 | Áudio nos cenários (tocar tom ou arquivo, esperar áudio ou silêncio) | Sai com os cenários. A medida de volume continua, no medidor da chamada (RF-26) |
| RF-42 | Teste de carga por SIP puro | Não é usado |
| RF-43 | Monitor de cenários, com webhook | Sai com os cenários |
| RF-44 | Exportar PCAP | A aba SIP e o Fluxo bastam para depurar |
| RF-45 | Requisição SIP manual | Não é usada |
| RF-48 (parte) | Variáveis `{ramal}`, `{dominio}` e `{nome}` nos cenários | Sai com os cenários; as contas por CSV ficam |
| RF-49 | Relatório JUnit na linha de comando | Sai com a linha de comando |
| RF-50 (parte) | Agenda global, com empresa, favoritos, conta preferida e "salvar a partir do histórico" | Os contatos passam a ser por conta, só como sugestão no discador |
| RF-52 | Chamada de vídeo | Não é usada |
| RF-53 | Links `tel:`, `callto:`, `sip:` e `sips:` | Não são usados |
| RF-54 | Mensagens de texto por SIP MESSAGE | Não são usadas; `messages.json` é apagado |
| RF-55 (parte) | Botões de mídia do fone (atender, desligar e mudo) | Saem com os atalhos globais; os toques por conta ficam |
| RF-56 | Interface em inglês | Um só usuário, que usa português. O catálogo pt-BR continua (RNF-13) |
| RF-57 | Áudio de atendimento (tocar um WAV ao atender) | Não é usado |
| RF-58 | Modos escondidos (área secreta) | Sem os recursos que ele escondia, não tem o que esconder |
| RF-59 | Modo SDR | Não é usado; `sdr.json` é apagado. Gravações já salvas em Downloads ficam (são arquivos do usuário) |
| RF-09 (parte) | Discagens rápidas da conta | Viram contatos da conta |

Saíram também, sem número de requisito: o **modo Telefone** (a tela única substitui as duas), os **primeiros passos**, a **paleta de comandos** (Ctrl/Cmd+K), o **perfil** e as **seis paletas de cor** (a Aparência ficou com claro, escuro ou sistema e uma cor de destaque) e, em 31/10/2026, o **guia de uso** dentro do app, também a pedido do usuário.

Dos RNF, nenhum saiu. Mudaram: RNF-11 (o teste com 3 pessoas mede a tela sem guia), RNF-13 (sem inglês) e RNF-19 (a 2.0 apaga os dados da 1.x, sem migrar).

**Dados das versões anteriores.** Sem migração, por decisão do usuário em 30/10/2026 ("pode descartar tudo, precisa migrar não"). Na primeira abertura da 2.0, se houver um arquivo de dados sem `schemaVersion: 2`, a Íris apaga contas, servidores, contatos, preferências, senhas e a chave local, além dos órfãos (`history.json`, `scenarios.json`, `sdr.json`, `messages.json`), e começa com as contas de exemplo do PBX simulado.

## Arquitetura

O app usa Electron com Vue 3 e TypeScript. Há três motores SIP atrás da mesma interface (`SipEngine`, RNF-16): o **SIP puro**, motor próprio em TypeScript que roda no processo principal, com os sockets UDP, TCP e TLS e o RTP (RF-39); o **WebSocket**, com o easy-sipjs no processo de interface, porque precisa do WebRTC do Chromium; e o **simulado**, sem rede (RF-32). O processo principal também cuida do que é do sistema operacional: arquivos, senhas, bandeja, notificações, certificados e atualização.

&#91;embedded content: arquitetura · 3 processos, 2 PBX\]

A interface só fala com o sistema pela API fixa do preload. Cada conta abre sua própria conexão com o PBX dela.

**Por que Electron e não Tauri.** O Electron leva o mesmo Chromium para os três sistemas, então o WebRTC se comporta igual em todos. O Tauri usa o navegador do sistema, e no Linux (WebKitGTK) o suporte a WebRTC é limitado. O custo do Electron é um instalador maior (cerca de 100 MB) e mais memória, aceitável para uma ferramenta de desenvolvedor.

**Stack**

| Camada | Escolha |
| --- | --- |
| Casca desktop | Electron, com electron-vite para build e electron-builder para instaladores |
| Interface | Vue 3 + Pinia + TypeScript |
| SIP puro | Motor próprio em TypeScript (mensagens, digest, transporte, diálogo, SDP, RTP, RTCP, SRTP, G.711, G.722 e Opus pelo opusscript) |
| SIP sobre WebSocket e WebRTC | easy-sipjs 2.7.x, sempre com o SIP.js |
| Atualização | electron-updater, publicando no GitHub Releases |
| Testes | Vitest (unidade), Playwright para Electron (testes de tela), Asterisk em Docker (chamada de verdade) |

**Módulos**

| Processo | Módulo | Responsabilidade |
| --- | --- | --- |
| Principal | Janela e bandeja | Cria a janela, mantém o app vivo na bandeja, mostra o estado geral |
| Principal | Armazenamento | Lê e grava contas, servidores, etiquetas, contatos e preferências em JSON na pasta de dados do usuário |
| Principal | Senhas | Cifra as senhas com AES-256-GCM num arquivo próprio, com uma chave local (sem o cofre do sistema) |
| Principal | Certificados e mídia | Libera o microfone para a janela e aplica as exceções de certificado por host |
| Principal | Motor SIP puro | Sockets, registro, chamadas, RTP, SRTP, codecs e gravação (RF-39) |
| Principal | Notificações, atualizador e log do app | Notificações do sistema, verificação de versões e log interno rotativo |
| Preload | Ponte | Expõe uma API tipada `window.iris` com canais fixos de IPC |
| Interface | Motores SIP | Interface própria `SipEngine`, com três implementações: SIP puro (fala com o processo principal), easy-sipjs e simulada |
| Interface | Contas, servidores, etiquetas e contatos | Estado de cada conta; converte os eventos dos motores em estado da tela |
| Interface | Chamadas e áudio | Chamadas de todas as contas, escolha de dispositivo, toque central por conta |
| Interface | Log e depuração | Memória circular de linhas por conta, filtros, exportação, fluxo SIP e Saúde |

**Modelo de dados** (arquivos na pasta de dados do usuário, todos com `schemaVersion: 2`)

| Arquivo | Conteúdo principal |
| --- | --- |
| `accounts.json` | id, nome, cor, servidor (`serverId`), etiquetas (`tagIds`), ramal, usuário de autenticação, nome de exibição, e uma cópia dos dados de conexão do servidor (domínio, transporte, endereço, WSS, STUN/TURN, preset), DTMF, SRTP, early media, toque, registrar ao abrir, auto-atender e atraso |
| `servers.json` | id, nome, domínio, transporte, endereço, WSS, STUN/TURN, preset, SRTP e DTMF padrão. O PBX simulado não é gravado: é fixo |
| `tags.json` | id, nome e cor de cada etiqueta |
| `contacts.json` | id, nome, número, observação e a conta do contato |
| `settings.json` | Dispositivos de áudio, volume do toque, aparência, canal de atualização, reconexão, notificações, ordem dos codecs, hosts de certificado aceitos |
| `senhas.json` + `chave-local.bin` | Senhas por id de conta, cifradas com AES-256-GCM pela chave local |
| `gravacoes/` | Gravações das chamadas em WAV (RF-36) |
| `logs/` | Log interno do app |

**Pontos de atenção técnicos**

- Cada `SipClient` do easy-sipjs toca o próprio toque. O app passa um som vazio para a biblioteca e toca um toque central, por conta, para não sobrepor sons com várias contas.
- O modo simulado usa a opção `customProvider` da biblioteca, então a interface não distingue PBX real de simulado.
- O SIP bruto é sempre guardado, sem senhas, Authorization nem nonce (RF-22), porque a aba SIP da depuração depende dele.

## Interface

Uma tela só, em tema claro por padrão (escuro e "do sistema" como opção), compacta e sem espaço vazio. As demais telas abrem como janelas sobre ela. O desenho está na [especificação da 2.0](superpowers/specs/2026-10-29-iris-mais-simples-design.md).

| Tela | O que mostra | Requisitos |
| --- | --- | --- |
| Barra de ícones | A conta atual (avatar na cor da conta, estado e ramal; um número vermelho com as outras contas em erro), a tela Telefone e, no pé, Ajustes | RF-04 |
| Seletor de contas | Busca, filtro por etiqueta, contas agrupadas por servidor, ações da conta (Registrar, Editar, Por quê?; no clique direito Duplicar, Saúde, Contatos, Excluir), Nova conta e Registrar todas | RF-01 a RF-04, RF-61 |
| Discar | "Discar de *conta atual*", campo do número com Ligar, sugestão de contatos da conta e teclado de 12 teclas | RF-09, RF-14, RF-18, RF-50 |
| Chamadas | Chamada recebida no topo, com Atender e Recusar; uma linha por chamada, de todas as contas, com qualidade e os botões Mudo, Espera, DTMF, Transferir, Gravar e Desligar. Sem chamada: os detalhes da conta atual | RF-10 a RF-17, RF-20, RF-24, RF-26, RF-36 |
| Depuração | Gaveta à direita, recolhida numa tira que muda de cor quando chega um erro; abas SIP, Fluxo, Log e Saúde, com filtro de conta que acompanha a conta atual; largura ajustável | RF-21 a RF-25, RF-46 |
| Conta | Nome, etiquetas, servidor, ramal e senha; Avançado; Testar e Salvar | RF-01, RF-05, RF-06, RF-11 |
| Servidor | Nome, domínio, transporte, endereço; Avançado; Testar (OPTIONS) | RF-51 |
| Contatos da conta | Lista com criar, editar, apagar, ligar e CSV | RF-50 |
| Ajustes | Áudio (com a ordem dos codecs), Aparência, Servidores, Etiquetas, Conexão, Notificações, Certificados, Importar e exportar, Atualização e Sobre | RF-07, RF-19, RF-35, RF-37, RF-48, RF-55, RF-60, RF-61, RNF-06 |

**Estados visuais da conta**

| Estado | Bolinha | Texto |
| --- | --- | --- |
| Desconectada | Cinza, anel | "desconectada" |
| Conectando | Amarela, anel pulsando | "conectando" ou "tentando de novo" |
| Registrada | Verde, cheia | "registrada", e nos detalhes a latência do último OPTIONS |
| Erro | Vermelha, losango | Código e frase SIP, ex.: "403 Forbidden", com "Por quê?" explicando em português |

**Atalhos de teclado**

| Ação | Atalho |
| --- | --- |
| Focar o discador | Ctrl/Cmd + L |
| Ligar | Enter no discador |
| Atender a chamada que está tocando | Ctrl/Cmd + Enter |
| Desligar a chamada selecionada | Ctrl/Cmd + E |
| Mudo | Ctrl/Cmd + M |
| Espera | Ctrl/Cmd + H |
| Trocar a conta atual | Ctrl/Cmd + 1 a 9 |
| Abrir os Ajustes | Ctrl/Cmd + , |

**Fluxos principais**

1. **Primeiro uso:** abrir o app, criar um servidor e uma conta, testar, salvar e ver a bolinha verde no avatar.
2. **Chamada entre contas:** escolher a conta A no seletor, digitar o ramal da conta B e ligar; B toca na mesma janela e atende (ou auto-atende); as duas chamadas aparecem na coluna de chamadas e o log intercala os eventos por horário.
3. **Teste de URA:** discar o número da URA, ouvir, enviar a sequência `1,w2,4321#` e conferir os dígitos no log.
4. **Transferência:** em chamada, clicar em Transferir, escolher cega ou consultando antes, acompanhar 100, 180 e 200 na linha da chamada.
5. **Depurar:** abrir a gaveta, ver o SIP da conta, clicar numa mensagem para vê-la inteira ou no Fluxo para ver a escada da chamada.

## Plano de entrega

A versão 1.0 saiu em cinco marcos. Cada marco termina numa versão instalável. As datas do cronograma abaixo eram estimativas do começo do projeto.

&#91;embedded content: cronograma · 5 marcos até a versão 1.0\]

| Marco | Versão | Entregas | Critério de saída |
| --- | --- | --- | --- |
| M0 Fundação | 0.0 | Repositório, Electron + Vue + TS, CI com lint e testes, Asterisk de teste em Docker, prova de conceito: uma conta do easy-sipjs registrando e ligando dentro do Electron | Chamada com áudio nos dois sentidos dentro do app, nos três sistemas |
| M1 MVP | 0.1 alfa interna | Contas (RF-01, 03, 04, 07, 08), chamadas (RF-09 a 14), log (RF-21 a 23), modo simulado (RF-32) | UC-01, UC-02 e UC-03 funcionam de ponta a ponta contra o Asterisk de teste |
| M2 Diagnóstico e transferência | 0.2 | RF-02, 05, 06, 15 a 19, 24 a 26, 33, 37 | UC-04 e UC-05 funcionam; 20 contas registradas sem travar (RNF-03) |
| M3 Cenários | 0.3 beta | RF-28 a 30, editor e executor de cenários (retirados na 2.0) | Um cenário de URA roda 20 vezes seguidas com relatório |
| M4 Lançamento | 1.0 | Instaladores assinados (RNF-17), atualização automática (RF-35), revisão de segurança e acessibilidade, teste com 3 usuários (RNF-11). O guia de uso foi feito e saiu na 2.0 | Todos os requisitos essenciais e importantes **que ficaram nesta especificação** aprovados; nenhum defeito crítico aberto |

Os marcos M0 a M3 estão concluídos. Do M4, faltam: a assinatura dos instaladores (RNF-17, bloqueada até haver os certificados), ver a atualização automática aplicada no Windows ou no AppImage (RF-35), o teste com 3 pessoas (RNF-11) e o checklist manual com FreeSWITCH e Kamailio (RNF-02).

## Estratégia de testes

O próprio produto é uma ferramenta de teste, então a base é um PBX real em contêiner, além do modo simulado para o que não depende de rede.

| Nível | O que cobre | Ferramenta | Quando roda |
| --- | --- | --- | --- |
| Unidade | Regras de contas, servidores, etiquetas, contatos, codecs, seletor, reconexão, log, parser de sequência DTMF, motor SIP puro contra um PBX falso em memória, codecs de áudio | Vitest | Todo push e pull request, nos três sistemas |
| Tela | Fumaça, acessibilidade, senhas, arquivos de dados, notificações, contatos e servidores, toques e chamada, no modo simulado | Playwright para Electron | Na `main` e sob pedido |
| Chamada de verdade | Registro UDP, ligar, ordem dos codecs, DTMF, espera, transferência e desligar pela tela (`chamada.mjs` com `PBX_WS`) | Playwright + Asterisk em Docker | Na `main` e sob pedido, no CI Linux |
| App empacotado | Abre o pacote, mede abertura e registro, confere o log interno (RNF-01, RNF-04) | Playwright | Em cada release, nos três sistemas |
| Manual | Áudio real, fones Bluetooth, troca de dispositivo, reconexão derrubando o PBX, memória (RNF-05), FreeSWITCH e Kamailio | Checklist de release | Antes de cada versão |
| Segurança | Checklist do Electron, busca de senhas em logs e exportações, licenças | Revisão + teste automatizado | M4 |

**Definição de pronto para cada requisito:** critério de aceitação atendido, teste automatizado quando possível, revisão de código feita e texto da interface no catálogo.

## Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| PBX do usuário sem WebSocket | O app não conecta por WebRTC | SIP puro por UDP, TCP ou TLS com o motor próprio (RF-39), que é o padrão desde a 2.0 |
| Certificado autoassinado no TLS ou no WSS | Falha silenciosa de conexão | Detectar o erro de certificado e oferecer a exceção por host (RF-37) |
| easy-sipjs é recente e muda rápido | Quebras ao atualizar | Fixar a versão, isolar atrás de `SipEngine` (RNF-16), testar a chamada contra o Asterisk antes de atualizar |
| Áudio sem som atrás de NAT simétrico | Chamada muda | RTP simétrico no SIP puro; campo de TURN na conta WebSocket e aviso no diagnóstico |
| Várias chamadas disputando o mesmo microfone | Eco ou áudio cortado | Uma chamada ativa por vez com áudio aberto; as demais em espera por padrão |
| Assinatura de código (Apple e Windows) exige contas pagas | Instalador bloqueado pelo sistema | No macOS, instalação e atualização pela própria Íris, conferindo o SHA-512 do release; a assinatura depende dos certificados |

## Decisões

**Tomadas**

- Produto desktop, multiplataforma (pedido do usuário em 3 de outubro de 2026)
- Electron em vez de Tauri, pela consistência do WebRTC
- easy-sipjs como motor do WebRTC, atrás da interface `SipEngine`
- Contas e senhas guardadas localmente (senhas cifradas em arquivo, sem o cofre do sistema, desde 04/10/2026), importação e exportação em JSON
- Motor SIP próprio em TypeScript para SIP puro (RF-39), no processo principal, em vez de biblioteca nativa: o PJSIP é GPL e exigiria compilar para três sistemas (decisão do usuário em 4 de outubro de 2026)
- Íris mais simples (decisões do usuário em 29 e 30 de outubro de 2026): uma tela só, sem o modo Telefone; contas por UDP por padrão e WebSocket como opção avançada; servidor em janela própria e nome obrigatório na conta; etiquetas reaproveitáveis; contatos por conta, só como sugestão; ordem dos codecs configurável; retirada dos recursos da seção "Retirados em 29/10/2026"; dados da 1.x apagados, sem migração; publicada como 2.0.0
- Guia de uso fora do app (decisão do usuário em 31 de outubro de 2026)

**Em aberto**

- [x] Nome definitivo do produto: Íris
- [x] Licença: código aberto, MIT (decidido em 3 de outubro de 2026)
- [x] Onde publicar instaladores e atualizações: GitHub Releases (decidido em 3 de outubro de 2026)
- [ ] Quem providencia os certificados de assinatura da Apple e da Microsoft
- [ ] Quais PBX além do Asterisk entram nos testes automáticos
