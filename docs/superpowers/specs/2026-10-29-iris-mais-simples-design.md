# Íris mais simples: desenho

> **Entregue na 2.0.0, publicada em 31/10/2026.** Depois da publicação, também a pedido do usuário, o guia de uso saiu do app (o botão Guia no pé dos Ajustes e a tecla F1 deixaram de existir). Onde este texto fala em "guia curto", vale isso. A especificação ([docs/ESPECIFICACAO.md](../../ESPECIFICACAO.md)) registra o que saiu na seção "Retirados em 29/10/2026"; nela, a ordem dos codecs virou o RF-60 e as etiquetas, o RF-61.

Data: 29/10/2026. Combinado com o usuário em conversa, com esboços de tela em `.superpowers/brainstorm/67562-1793284940/content/` (a versão final da tela principal é `bancada-v7.html` + `bancada-v6.html` B; cadastro em `conta-servidor.html` e `conta-ajustes.html`).

## Por que

A Íris ficou confusa e com funcionalidade demais. O uso real do dono (único usuário) é: **fazer uma ligação escolhendo de qual conta ela sai**, configurar contas **por UDP como um softphone comum**, e **raramente** depurar uma chamada do Asterisk (ver o que chega e o que sai). Ter dois modos (Bancada e Telefone) obrigava a fazer tudo duas vezes.

Sucesso: abrir o app, escolher a conta, digitar o número (ou o começo do nome de um contato) e ligar, numa tela só, clara e densa, sem nada à vista que não sirva para isso.

## Objetivos

1. Uma tela só (a Bancada redesenhada). O modo Telefone deixa de existir.
2. Tirar do aplicativo, sem resquícios, o que não é usado (lista abaixo).
3. Contas por UDP por padrão; WebSocket continua como opção avançada.
4. Contatos por conta, oferecidos como sugestão enquanto se digita.
5. Deixar a navegação pronta para os Cenários voltarem depois, repensados.

## Não objetivos

- Repensar os Cenários agora. Eles saem; a volta é outro projeto.
- Mexer no motor SIP puro além do necessário (ele fica como está).
- Assinatura dos instaladores, memória (RNF-05) e outras pendências do CLAUDE.md.

## Anti-objetivos (seria fracasso mesmo funcionando)

- Sobrar código, tela, texto, teste, chave de configuração ou arquivo de dados de algo que saiu.
- Tela com muito espaço em branco. O usuário gosta de tema claro, **mas não de espaço vazio**: compacto, tudo aproveitado.
- O WebSocket sumir ou quebrar: ele precisa continuar funcionando, só que escondido em "Avançado".

## O que sai do aplicativo (código, testes, i18n, guia, dados, especificação)

| Sai | Requisitos | Observação |
|---|---|---|
| Modo Telefone | (redesenho 2) | `PhoneView.vue`, `PhoneIcon.vue` se só ele usa, canal `window:mode` |
| Histórico | RF-40 | `history.json` apagado do disco |
| Cenários | RF-28, 29, 30, 41 | `scenarios.json` apagado; variáveis `{ramal}` etc. do RF-48 |
| Linha de comando e JUnit | RF-31, RF-49 | `src/main/cli.ts`, `src/shared/cli.ts`, `src/renderer/src/cli.ts` |
| Monitor | RF-43 | webhook incluso |
| SDR | RF-59 | `sdr.json` apagado; gravações já salvas em Downloads ficam (são arquivos do usuário) |
| Mensagens | RF-54 | `messages.json` apagado |
| Vídeo | RF-52 | `CallVideo.vue`, `mock-video.ts`, vídeo do `SipEngine` |
| Teste de carga | RF-42 | |
| Ajuda da IA | RF-38 | chave da OpenRouter some do settings |
| PCAP e requisição SIP manual | RF-44, RF-45 | |
| BLF e correio de voz | RF-27 | `presence.ts`, campo `blf` |
| Áudio ao atender | RF-57 | campo `answerAudio` |
| Modos escondidos | RF-58 | área secreta, `settings.modes`, `IRIS_MODES` |
| Primeiros passos | | `FirstSteps.vue`, `profile.tourDone` |
| Paleta de comandos (Ctrl/Cmd+K) | | |
| Inglês | RF-56 | `i18n/en.ts`, `guide.en.ts`; o catálogo pt-BR continua (RNF-13) |
| Atalhos globais e botões de mídia do fone | RF-34, parte do RF-55 | os toques por conta ficam |
| Links `tel:`/`sip:` | RF-53 | |
| Perfil e as 6 paletas | | Aparência fica só com Claro/Escuro/Sistema e uma cor de destaque |
| Discagens rápidas da conta | parte do RF-09 | viram contatos |

**Sem migração** (decisão do usuário em 30/10/2026: "pode descartar tudo, precisa migrar não"). Na primeira abertura da 2.0, se houver dados de uma versão anterior (arquivo sem `schemaVersion: 2`), a Íris apaga todos: contas, servidores, contatos, preferências, senhas e a chave local, e os órfãos (`history.json`, `scenarios.json`, `sdr.json`, `messages.json`). O app começa limpo, com as contas de exemplo do simulado. As seções abaixo que falam em migração valem como "o formato novo", não como conversão.

Na especificação, os requisitos que saíram vão para uma seção "Retirados em 29/10/2026", com o motivo, em vez de sumirem sem rastro; as tabelas de RF ficam só com o que vale. O critério de saída do M4 passa a considerar só os requisitos que ficaram.

## O que fica

Contas e servidores, registro e reconexão, discador, chamadas (várias ao mesmo tempo, de contas diferentes: mudo, espera, DTMF, transferência cega e assistida, gravação, cabeçalhos extras), contatos, depuração (log, SIP bruto, Fluxo SIP, Saúde), toques por conta, notificações do sistema, bandeja, certificados, importar e exportar, atualização, guia curto, motor simulado, motor SIP puro (UDP/TCP/TLS, G.711, G.722, Opus, SRTP), motor WebRTC (WebSocket) e early media.

## Tela principal

Tema **claro** por padrão (escuro e "do sistema" continuam como opção), compacto, linhas finas, ícones de verdade (SVG, sem emoji). O usuário aprovou a estrutura dos esboços e pediu **visual moderno** na versão final: os esboços mostram onde cada coisa fica, mas o acabamento (tipografia, cantos, sombras leves, estados de foco e de passar o mouse, transições curtas) precisa ser de app atual, sem perder a densidade. Quatro áreas, da esquerda para a direita:

1. **Barra de ícones** (≈60 px):
   - No topo, a **conta atual**: avatar com a cor da conta, bolinha de estado e o ramal embaixo. Um número vermelho sobre o avatar diz quantas *outras* contas estão com erro.
   - Clicar no avatar abre o **seletor de contas** (abaixo).
   - Depois, os itens de tela: hoje só **Telefone**. **Cenários** entra aqui quando voltar; até lá não aparece.
   - No pé, **Ajustes**.
2. **Discar** (≈260 px): título "Discar de *conta atual*"; campo do número com botão **Ligar**; teclado de 12 teclas embaixo. Ao digitar (no campo ou no teclado), número ou nome, abre uma lista de **sugestões só com os contatos da conta atual**: ↑/↓ escolhe, Enter liga, clique liga. Se o que foi digitado não é de nenhum contato, a última sugestão é "+ Salvar como contato". Não existe lista de contatos fixa na tela.
3. **Chamadas** (o resto da largura):
   - Chamada **recebida** no topo, em azul, com Atender e Recusar e a etiqueta da conta que recebeu.
   - Chamadas **ativas**, cada uma numa linha compacta: nome/número, tempo, etiqueta da conta, codec, perda, jitter, RTT, e os botões Mudo, Espera, DTMF, Transferir, Gravar, Desligar. Em espera: fundo amarelo, com Retomar.
   - Chamadas de **todas** as contas aparecem aqui, não só da atual.
   - Sem chamada, a área mostra os **detalhes da conta atual**: estado e quando renova, servidor com IP e porta, transporte, usuário, IP local, codecs, DTMF, último OPTIONS com latência.
4. **Depuração** à direita: começa **recolhida** numa tira fina vertical ("SIP · Fluxo · Log"). Um clique abre o painel (≈290 px) com abas **SIP**, **Fluxo**, **Log** e **Saúde**; clicar numa linha do SIP mostra a mensagem inteira. Quando chega um erro, a tira chama atenção (pisca ou muda de cor) sem abrir sozinha.

## Seletor de contas

Abre colado à barra de ícones, por cima do conteúdo (não é tela cheia), e fecha ao escolher ou clicar fora.

- Busca no topo: por nome, ramal ou etiqueta.
- Filtros por etiqueta logo abaixo (chips com a cor da etiqueta, mais "todas").
- Contas **agrupadas por servidor** (nome do servidor e transporte no cabeçalho do grupo).
- Cada linha: bolinha de estado, nome, ramal e servidor, etiquetas, e a conta atual marcada.
- Ações na linha, ao passar o mouse: **Editar**, **Registrar**/**Desregistrar**, e **Por quê?** quando há erro (explicação em português, como o `explainRegError` de hoje). Clique direito: Duplicar, Excluir, Saúde.
- Rodapé: **+ Nova conta**, **Registrar todas**.
- Clicar numa conta torna ela a conta atual e fecha o seletor.

## Cadastro de conta (janela)

Campos à vista, nesta ordem: **Nome*** (obrigatório, identifica a conta), **Etiquetas** (escolhidas da lista configurada; dá para criar uma nova ali), **Servidor*** (lista dos cadastrados; a última opção é "+ Novo servidor…", que abre a janela de servidor e volta com ele escolhido), **Ramal***, **Senha***.

"Avançado", fechado por padrão: transporte (**UDP** padrão, TCP, TLS, WebSocket; vem do servidor e pode ser trocado), usuário de autenticação (vazio = ramal), endereço:porta (vazio = do servidor), DTMF (RTP ou SIP INFO), registrar ao abrir, exigir SRTP, atender sozinho com atraso, toque, cor. Com WebSocket aparecem: endereço WSS, STUN/TURN, early media.

Rodapé: **Testar** (registra, mostra o resultado e desregistra, RF-05) e **Salvar**.

## Servidor (janela própria)

Nome*, domínio SIP*, transporte (UDP padrão), endereço:porta. "Avançado": proxy de saída, SRTP padrão, DTMF padrão; com WebSocket, WSS e STUN/TURN. **Testar** manda OPTIONS e mostra a latência. Abre pelo cadastro de conta e por Ajustes → Servidores (lista para criar, editar e apagar). Editar o servidor vale para todas as contas dele (comportamento atual do RF-51).

## Etiquetas

Cadastradas uma vez, com **nome e cor**, em Ajustes → Etiquetas. A mesma etiqueta serve para várias contas. Renomear ou mudar a cor vale em todas; apagar tira de todas. Servem para buscar e filtrar no seletor; o agrupamento continua por servidor.

## Contatos

- Cada contato pertence a **uma conta**: nome, número e, se quiser, observação. Contato de uma conta não aparece em outra.
- Aparecem só como sugestão no discador (acima) e como nome de quem liga numa chamada recebida daquela conta.
- Criar: "+ Salvar como contato" no discador; e numa chamada (salvar o número do outro lado).
- Editar e apagar: pelo item "Contatos" no clique direito da conta no seletor (uma janela simples com a lista daquela conta).
- Contatos que já existem hoje (globais) vão para a **primeira conta** na migração.

## Ajustes (janela)

Seções à esquerda: **Áudio** (microfone com medidor, alto-falante, saída do toque, volume do toque, pasta das gravações com Abrir/Trocar, e a **ordem dos codecs**), **Aparência** (Claro/Escuro/Sistema e uma cor de destaque), **Servidores**, **Etiquetas**, **Conexão** (reconexão, RNF-06), **Notificações**, **Certificados** (RF-37), **Importar e exportar** (RF-07), **Atualização** (RF-35). No pé: Sobre e Guia.

### Ordem dos codecs (recurso novo, pedido pelo usuário)

Em Ajustes → Áudio, a lista G.722, PCMA (G.711 A), PCMU (G.711 µ) e Opus, que se reordena arrastando (e com botões ↑/↓ para teclado, RNF-12), e uma caixa para ligar ou desligar cada codec. Pelo menos um tem que ficar ligado. Vale para todas as contas de SIP puro: é a ordem da oferta no INVITE e no 200 OK. Padrão: a ordem de hoje (G.722 primeiro). Fica guardada em `settings.json` (campo novo, opcional, com migração, RNF-19). Em WebSocket a ordem é a do Chromium; a tela diz isso numa linha. Precisa entrar como requisito novo na especificação.

## Restrições que continuam valendo

Tudo do CLAUDE.md: interface só conhece `SipEngine` (motores real, SIP puro e simulado recebem as mudanças), IPC por canais fixos com argumentos conferidos, nenhum texto fixo em componente (catálogo pt-BR), sem `v-html`/`innerHTML`/`eval`, senhas fora de log e exportação, migração para qualquer mudança em `accounts.json`/`settings.json`, Prettier, commits em português, um passo por commit, commit só quando o usuário pedir. Testes e2e e de acessibilidade precisam ser atualizados para a tela nova (RNF-12: estados com cor **e** forma, contraste AA, atalhos para as ações principais).

## Decisões do usuário

- Eliminar o modo Telefone e repensar a Bancada.
- Tirar Histórico, Cenários, SDR e Mensagens do aplicativo, e com eles CLI, JUnit e monitor; apagar os dados antigos.
- Tirar carga, IA, vídeo, PCAP, requisição manual, BLF e modos.
- Tema claro, sem espaço em branco.
- Layout de painéis fixos com barra de ícones à esquerda; contas no topo da barra, abrindo um seletor.
- Contatos por conta, só como sugestão ao digitar.
- WebSocket como opção avançada.
- Janela própria para servidor; nome obrigatório na conta; etiquetas configuráveis e reaproveitáveis.
- Seletor agrupado por servidor, etiquetas como filtro.
- Ordem dos codecs configurável em Ajustes → Áudio.

## Decisões minhas (o usuário pode mudar)

- Saem também: primeiros passos, paleta Ctrl+K, inglês, atalhos globais e botões de mídia, links `tel:`, perfil, as 6 paletas. Ficam: notificações do sistema, tema claro/escuro, guia curto.
- Chamadas de todas as contas aparecem na coluna de chamadas, com etiqueta da conta.
- Contatos antigos vão para a primeira conta.
- Seletor abre colado à barra (não é janela centralizada).
- Requisitos retirados ficam numa seção própria da especificação, com o motivo.
- A ordem dos codecs é uma só para todas as contas (não por conta), só em SIP puro, e cada codec pode ser desligado.

## Versão e publicação (decisão do usuário)

- O rascunho da 1.9.0 no GitHub é **descartado** e não será publicado. O commit e a tag dela continuam no histórico do git.
- O trabalho sai como **2.0.0**. A migração parte da 1.8.0, a última versão publicada, mas apaga também o que veio da 1.9.0 (`sdr.json`, `settings.modes`, `answerAudio`), porque a máquina do usuário tem esses dados.
- O trabalho é feito numa branch própria, não direto na `main`. Apagar o rascunho, criar a tag e dar push na `main` continuam dependendo de autorização do usuário no momento do release (CLAUDE.md).

## Pontos levantados pela revisão (decisões minhas)

- **Motor simulado (RF-32):** vira um servidor fixo, "PBX simulado", sempre presente na lista de servidores e que não pode ser editado nem apagado. Para criar uma conta simulada, basta escolher esse servidor. No seletor ele aparece como mais um grupo. As contas com `simulated: true` passam para esse servidor na migração.
- **Campos da conta que a conversa não cobriu:**
  - `rawSipLog` sai. O SIP bruto, sem senhas e sem Authorization (RF-22), é sempre guardado, porque a aba SIP da depuração depende dele.
  - `displayName` fica em Avançado, com o rótulo "Nome de exibição".
  - A escolha de biblioteca (`provider`, SIP.js ou JsSIP) sai: o WebSocket usa sempre o SIP.js.
  - `preset` sai da tela. Se o código ainda depender dele, ele passa a vir do servidor.
  - A migração tira os campos que saíram.
- **Painel de depuração:** mostra todas as contas, com um filtro de conta que começa na conta atual (RF-21). Ao trocar a conta no seletor, o filtro troca junto. Clicar numa chamada filtra pela conta dela.
- **Contas sem servidor, ou com conexão diferente da do servidor:** a migração cria um servidor para cada combinação diferente de domínio, transporte e endereço (com o nome "domínio · transporte") e liga cada conta ao servidor dela. Nenhum dado de conexão se perde.
- **Testes:** antes de apagar `scenarios.mjs` e `cli.mjs` do CI, entra um teste e2e de chamada pela tela nova contra o Asterisk. Ele precisa cobrir registro UDP, ligar, DTMF, espera, transferência e desligar, para não perder a cobertura de chamada real.

## Fica a cargo de quem implementar

Tamanhos exatos, cores e ícones dentro do que está acima; como a tira de depuração chama atenção; a ordem dos passos e dos commits (sugestão: primeiro remover, depois migrar dados, depois a tela nova).
