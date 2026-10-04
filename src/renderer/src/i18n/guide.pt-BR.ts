// Conteúdo do guia de uso (entrega do M4), em português do Brasil (RNF-13). Texto puro com duas
// marcas: **negrito** e `código`. Outro idioma entra como guide.<idioma>.ts, com as mesmas seções.
// As capturas de tela ficam em assets/guide e são geradas por scripts/guide-shots.mjs.

export type GuideBlock =
    | { type: 'p'; text: string }
    | { type: 'h'; text: string }
    | { type: 'list'; items: string[] }
    | { type: 'steps'; items: string[] }
    | { type: 'image'; name: string; alt: string; caption?: string }
    | { type: 'note'; kind: 'dica' | 'atenção'; text: string }
    | { type: 'table'; head: string[]; rows: string[][] }
    | { type: 'code'; text: string }

export interface GuideSection {
    id: string
    title: string
    /** Uma linha que diz para que serve; aparece embaixo do título. */
    summary: string
    blocks: GuideBlock[]
}

export const GUIDE: GuideSection[] = [
    {
        id: 'o-que-e',
        title: 'O que é a Íris',
        summary: 'Um telefone de testes para quem configura e mantém centrais telefônicas (PBX).',
        blocks: [
            {
                type: 'p',
                text: 'A Íris é um softphone: um telefone que roda no computador e fala com a central por SIP, sobre WebSocket com áudio WebRTC ou em SIP puro com áudio G.711. Ela foi feita para **testar** telefonia, não para atender clientes o dia todo.'
            },
            { type: 'h', text: 'Para que usar' },
            {
                type: 'list',
                items: [
                    '**Conferir se um ramal registra** e ver o motivo exato quando não registra.',
                    '**Ligar de um ramal para outro** sem precisar de dois aparelhos: várias contas ficam registradas ao mesmo tempo na mesma janela.',
                    '**Testar uma URA**: discar, esperar atender, mandar os dígitos e ver o que voltou.',
                    '**Testar transferência, espera e mudo** e ver a sinalização SIP de cada ação.',
                    '**Ler o log lado a lado com a chamada**, com o SIP bruto quando precisar.',
                    '**Repetir um teste muitas vezes** com os cenários, na tela ou pela linha de comando.'
                ]
            },
            { type: 'image', name: 'principal', alt: 'Janela principal da Íris com duas chamadas em andamento' },
            { type: 'h', text: 'O que a central precisa ter' },
            {
                type: 'p',
                text: 'A Íris fala com a central de dois jeitos. O mais completo é **SIP sobre WebSocket seguro (WSS)** com áudio **WebRTC**: Asterisk (PJSIP com `transport` WSS), FreeSWITCH e Kamailio fazem isso. O outro é **SIP puro por UDP, TCP ou TLS**, para centrais sem WebSocket: a conta registra, liga e recebe chamadas com áudio **G.711** e DTMF. Em SIP puro o áudio só é cifrado se a conta exigir SRTP.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Não tem central à mão? O **PBX simulado** vem pronto e funciona sem rede. Veja "Primeira chamada em 2 minutos".'
            }
        ]
    },
    {
        id: 'primeira-chamada',
        title: 'Primeira chamada em 2 minutos',
        summary: 'O caminho mais curto para ver o app funcionando, com o PBX simulado e com a sua central.',
        blocks: [
            { type: 'h', text: 'Com o PBX simulado (sem servidor)' },
            {
                type: 'p',
                text: 'Na primeira abertura a Íris cria três contas de exemplo, marcadas com **SIM**. Duas registram sozinhas; a terceira (Lab 2001) falha de propósito com `403 Forbidden`, para você ver como um erro aparece.'
            },
            {
                type: 'steps',
                items: [
                    'Clique na conta **Suporte 1001**, na coluna da esquerda.',
                    'No centro, clique no atalho **1002 Vendas 1002**. A Íris liga de 1001 para 1002.',
                    'A conta 1002 atende sozinha (ela tem **AA**, auto-atender). Aparecem dois cartões: a chamada feita e a recebida.',
                    'Experimente **Mudo**, **Espera** e **DTMF** num dos cartões e acompanhe o log à direita.',
                    'Clique em **Desligar**.'
                ]
            },
            { type: 'h', text: 'Com a sua central' },
            {
                type: 'steps',
                items: [
                    'Clique em **+ Nova**, na coluna de contas.',
                    'Preencha **Nome**, **Ramal**, **Domínio SIP**, **Senha** e **WebSocket (WSS)**. O endereço WSS do Asterisk costuma ser `wss://seu-pbx:8089/ws`.',
                    'Desmarque **PBX simulado** se estiver marcado.',
                    'Clique em **Testar conexão**. Se der certo, clique em **Salvar e registrar**.',
                    'Com o ponto da conta verde, digite um número no centro e clique em **Ligar**.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'Se aparecer a faixa vermelha "O certificado TLS foi recusado", a central usa certificado autoassinado. Veja "Certificados".'
            }
        ]
    },
    {
        id: 'janela',
        title: 'A janela principal',
        summary: 'Três colunas fixas: contas, telefone e log. As outras telas abrem por cima.',
        blocks: [
            { type: 'image', name: 'principal', alt: 'As três colunas da janela principal' },
            {
                type: 'table',
                head: ['Onde', 'O que tem', 'Para que serve'],
                rows: [
                    [
                        'Barra de cima',
                        'Resumo (contas, PBX, registradas, chamadas) e os botões gerais',
                        'Ver o estado de tudo de relance e abrir este Guia e as Configurações'
                    ],
                    [
                        'Esquerda: Contas',
                        'As contas agrupadas por domínio (um grupo por PBX)',
                        'Escolher de qual ramal você vai ligar e ver o estado de cada um'
                    ],
                    [
                        'Centro: Telefone',
                        'O discador e os cartões de chamada',
                        'Ligar, atender e agir sobre cada chamada'
                    ],
                    [
                        'Centro: Cenários',
                        'Roteiros de teste com passos',
                        'Repetir um teste sozinho e medir tempo e taxa de sucesso'
                    ],
                    [
                        'Direita: Log',
                        'O que aconteceu, em ordem, por conta',
                        'Entender por que algo deu certo ou errado'
                    ]
                ]
            },
            { type: 'h', text: 'Botões da barra de cima' },
            {
                type: 'list',
                items: [
                    '**Modo Telefone**: troca a janela por um telefone simples, só com o teclado e a chamada. Veja "Modo Telefone".',
                    '**Atualização disponível**: aparece só quando há versão nova. Veja "Atualização".',
                    '**Guia**: abre esta tela. A tecla **F1** também abre.',
                    '**Configurações**: perfil, cores, áudio, IA, certificados, importar e exportar e atualização. O atalho é **Ctrl+,** (no macOS, **Cmd+,**).'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Fechar a janela não encerra o app: os ramais continuam registrados e as chamadas continuam. Para sair de verdade, use **Sair** no ícone da bandeja. Veja "Bandeja e notificações".'
            }
        ]
    },
    {
        id: 'contas',
        title: 'Contas',
        summary: 'Cada conta é um ramal de uma central. Você pode ter várias, de várias centrais, ao mesmo tempo.',
        blocks: [
            { type: 'image', name: 'contas', alt: 'Coluna de contas com uma conta selecionada' },
            { type: 'h', text: 'Ler o estado de uma conta' },
            {
                type: 'table',
                head: ['Símbolo', 'Estado', 'O que significa'],
                rows: [
                    ['Anel vazio', 'desconectada', 'A conta não tentou registrar ou foi desregistrada'],
                    ['Anel pulsando', 'conectando', 'Abrindo o WebSocket ou esperando a resposta do REGISTER'],
                    ['Círculo cheio verde', 'registrada', 'Pronta para fazer e receber chamadas'],
                    [
                        'Losango vermelho',
                        'erro',
                        'A central recusou ou a conexão caiu. O código aparece ao lado, por exemplo `403 Forbidden`'
                    ]
                ]
            },
            {
                type: 'p',
                text: 'Quando o registro falha por algo passageiro (rede fora, central reiniciando), a conta mostra **tentando de novo** e a Íris refaz o registro sozinha, esperando cada vez mais entre as tentativas. Senha errada, ramal inexistente e login recusado não são tentados de novo. O limite de tentativas fica em **Configurações → Conexão**.'
            },
            {
                type: 'p',
                text: 'As etiquetas à direita do nome dizem: um **número** é a quantidade de chamadas ativas da conta; **AA** é auto-atender ligado; **SIM** é conta do PBX simulado.'
            },
            { type: 'h', text: 'Todas as contas de uma vez' },
            {
                type: 'list',
                items: [
                    'O botão **Todas**, no alto da coluna de contas, abre **Registrar todas** e **Desregistrar todas**.',
                    '**Registrar todas** registra as contas que ainda não estão registradas. Útil depois de abrir o app ou de a rede voltar.',
                    '**Desregistrar todas** tira todos os ramais do ar de uma vez, por exemplo antes de mexer na central.'
                ]
            },
            { type: 'h', text: 'Ações de uma conta' },
            {
                type: 'p',
                text: 'Clique na conta para selecioná-la. Ela passa a ser a conta de origem do discador e mostra **Registrar** (ou **Desregistrar**), **Editar** e o menu **⋯** com o resto:'
            },
            {
                type: 'list',
                items: [
                    '**Registrar / Desregistrar**: põe ou tira o ramal do ar.',
                    '**Editar**: abre o formulário. Se a conta estava registrada, ela é registrada de novo com os dados novos.',
                    '**⋯ → Saúde**: roda as verificações da conta. Veja "Saúde e diagnóstico".',
                    '**⋯ → Duplicar**: cria uma cópia, para cadastrar vários ramais parecidos sem redigitar tudo.',
                    '**⋯ → Requisição SIP…** (contas de SIP puro registradas e simuladas): manda um pedido avulso, como `OPTIONS`, `MESSAGE` ou `SUBSCRIBE`, com os cabeçalhos e o corpo que você escrever, e mostra a resposta inteira do PBX e o tempo que levou.',
                    '**⋯ → Exportar PCAP** (contas de SIP puro registradas): salva o que passou pela rede daquela conta desde o registro, para abrir no Wireshark. "Só SIP" leva a sinalização; "com áudio" leva também os pacotes RTP. A captura guarda os 30 MB mais recentes.',
                    '**⋯ → Excluir**: pede confirmação e apaga a conta e a senha guardada.'
                ]
            },
            { type: 'h', text: 'Quando o registro falha' },
            {
                type: 'p',
                text: 'A conta mostra um quadro vermelho com o problema em português e o que conferir, por exemplo "O PBX recusou o login: confira usuário e senha". O código SIP original (como `403 Forbidden`) continua na linha da conta. O botão **Por que falhou?** pede a explicação à IA. Veja "Ajuda da IA".'
            },
            { type: 'h', text: 'Cadastrar ou editar' },
            { type: 'image', name: 'conta', alt: 'Formulário de conta com a seção Avançado aberta' },
            {
                type: 'table',
                head: ['Campo', 'O que colocar'],
                rows: [
                    ['Nome', 'Um apelido para você reconhecer a conta, por exemplo "Suporte 1001"'],
                    ['Ramal', 'O número do ramal na central'],
                    ['Domínio SIP', 'O domínio ou IP da central, como ela espera no endereço SIP'],
                    [
                        'Senha',
                        'A senha do ramal. Ao editar, deixe em branco para manter a atual; digite só para trocar'
                    ],
                    [
                        'Transporte',
                        '**WebSocket seguro (WebRTC)** é o padrão e o mais completo. **SIP por UDP, TCP ou TLS** fala SIP puro com a central, sem WebRTC, com áudio G.711'
                    ],
                    [
                        'WebSocket (WSS)',
                        'Com o transporte WebSocket: o endereço do WebSocket da central, por exemplo `wss://pbx.empresa.com:8089/ws`'
                    ],
                    [
                        'Servidor SIP (host e porta)',
                        'Com SIP puro: só se a central atende num endereço ou numa porta diferente do domínio, por exemplo `10.0.0.5:5080`. Vazio usa o domínio e a porta padrão (5060; em TLS, 5061)'
                    ]
                ]
            },
            { type: 'h', text: 'Contas por SIP puro (UDP, TCP ou TLS)' },
            {
                type: 'p',
                text: 'Servem para centrais que não têm WebSocket. A conta **registra**, renova o registro sozinha, **liga e recebe chamadas** com áudio G.711 (PCMU ou PCMA), manda e recebe **DTMF** (por RTP ou SIP INFO), tem **mudo**, **espera** e **transferência** cega e assistida, mede a **Saúde** e a qualidade (perda, variação do atraso e tempo de ida e volta) e mostra o **SIP bruto** e o **Fluxo SIP**.'
            },
            {
                type: 'list',
                items: [
                    'Em **TLS**, um certificado autoassinado é recusado e a tela oferece **Confiar neste host**, como no WebSocket.',
                    'Em **UDP**, a Íris repete o pedido se a central não responder e desiste depois de 32 segundos, com o erro `408`.',
                    'No arquivo **PCAP**, as mensagens aparecem sempre como UDP, mesmo em contas TCP ou TLS, e em TLS já decifradas: é o texto SIP que interessa para diagnosticar. O arquivo tem ramais, números discados e, na opção com áudio, a conversa: trate como confidencial.',
                    'O áudio vai por **RTP sem cifra**, a não ser que você marque **Exigir áudio cifrado (SRTP)** na conta. Com essa opção, a Íris oferece SRTP ao ligar e recusa (`488`) quem liga sem ele; na linha de qualidade aparece `(SRTP)` ao lado do codec. Uma chamada recebida que já venha com SRTP é atendida com cifra mesmo sem a opção.',
                    'A chave do SRTP vai dentro da sinalização (SDES). Para ela não passar em claro, use o transporte **TLS** junto.',
                    'Com SRTP, o tempo de ida e volta (RTT) fica em 0: ele vem do RTCP, que a Íris só troca sem cifra.',
                    'A central precisa aceitar **G.711**. Uma central que só oferece Opus ou G.729 para o ramal recusa a chamada com `488`.',
                    'Na primeira vez, o firewall do sistema pode perguntar se a Íris pode usar a rede. Permita: sem isso o áudio não chega.'
                ]
            },
            { type: 'h', text: 'Opções' },
            {
                type: 'list',
                items: [
                    '**PBX simulado (sem rede)**: a conta usa a central falsa embutida. Bom para treinar e para montar cenários.',
                    '**Registrar ao abrir o app**: a conta entra no ar sozinha quando a Íris abre.',
                    '**Auto-atender após … ms**: a conta atende sozinha depois do tempo informado. É o que permite testar uma chamada entre dois ramais sem clicar em Atender.',
                    '**Mostrar SIP bruto no log**: liga o registro das mensagens SIP completas dessa conta. Sem isso, a aba "SIP bruto" fica vazia para ela.'
                ]
            },
            { type: 'h', text: 'Avançado' },
            {
                type: 'table',
                head: ['Campo', 'Quando mexer'],
                rows: [
                    ['Preset', 'Ajusta detalhes para Asterisk, Kamailio ou uma central genérica'],
                    ['Biblioteca SIP', 'SIP.js é o padrão. Troque para JsSIP se a central se comportar melhor com ela'],
                    ['Usuário de autenticação', 'Só quando o usuário de login é diferente do ramal'],
                    ['Nome de exibição', 'O nome que aparece para quem recebe a sua chamada'],
                    [
                        'Modo DTMF',
                        'Automático tenta o melhor. **SIP INFO** manda os dígitos pela sinalização; **RTP (RFC 4733)** manda junto com o áudio. Troque se a URA não reconhecer os dígitos'
                    ],
                    ['Cor', 'A cor da conta na lista, nos cartões e no log'],
                    [
                        'STUN / TURN',
                        'Servidores para atravessar NAT, separados por vírgula. Sem TURN, a chamada pode ficar muda atrás de alguns roteadores'
                    ],
                    [
                        'Atalhos de discagem',
                        'Um por linha, número e descrição. Viram botões no discador quando a conta está selecionada'
                    ]
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: '**Testar conexão** registra a conta sem salvar e mostra o resultado na hora. Use antes de salvar para não guardar uma conta que não funciona.'
            }
        ]
    },
    {
        id: 'simulado',
        title: 'PBX simulado',
        summary: 'Uma central falsa embutida, para aprender o app e montar cenários sem servidor nem rede.',
        blocks: [
            {
                type: 'p',
                text: 'As contas marcadas com **SIM** falam com uma central de mentira dentro do próprio app. O registro, as chamadas, o DTMF e os erros são simulados, mas a tela, o log e os cenários funcionam igual.'
            },
            {
                type: 'table',
                head: ['Disque', 'O que acontece'],
                rows: [
                    ['8000', 'Uma URA: atende com early media e registra os dígitos DTMF que você mandar'],
                    ['486', 'Ocupado: a chamada termina com `486 Busy Here`'],
                    ['408', 'Ninguém atende: termina com `408 Request Timeout` depois de 5 s'],
                    [
                        'Ramal de outra conta simulada',
                        'Toca nessa conta, desde que ela seja do mesmo domínio e esteja registrada'
                    ],
                    ['Qualquer outro número', '`404 Not Found`']
                ]
            },
            {
                type: 'p',
                text: 'Com uma conta simulada selecionada, o discador mostra **Números do PBX simulado** com essa mesma lista.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'O simulado não tem áudio de verdade nem rede. A qualidade mostrada nos cartões é fictícia e vem marcada com "(simulado)". Para testar áudio, use uma central real.'
            }
        ]
    },
    {
        id: 'ligar',
        title: 'Fazer e receber chamadas',
        summary: 'O discador, os atalhos, os cabeçalhos extras e o que acontece quando o ramal toca.',
        blocks: [
            { type: 'image', name: 'discador', alt: 'Discador com o teclado e os cabeçalhos SIP abertos' },
            { type: 'h', text: 'Ligar' },
            {
                type: 'steps',
                items: [
                    'Em **Discar de**, escolha a conta de origem (ou clique nela na coluna da esquerda).',
                    'Digite o número ou o ramal. **Ctrl/Cmd + L** leva o cursor direto para esse campo.',
                    'Clique em **Ligar** ou aperte Enter.'
                ]
            },
            {
                type: 'p',
                text: 'O botão **Ligar** fica apagado enquanto a conta de origem não está registrada; a tela diz "Registre … para ligar".'
            },
            { type: 'h', text: 'Recursos do discador' },
            {
                type: 'list',
                items: [
                    '**Atalhos**: os botões com número e descrição ligam com um clique. Vêm dos "Atalhos de discagem" da conta e, no simulado, das outras contas e da URA.',
                    '**teclado**: abre um teclado numérico para montar o número com o mouse.',
                    '**cabeçalhos SIP**: abre um campo para mandar cabeçalhos extras no INVITE, um por linha, como `X-Test-Id: cenario-42`. Serve para testar regras da central que dependem de cabeçalho.'
                ]
            },
            { type: 'h', text: 'Receber' },
            {
                type: 'p',
                text: 'Quando um ramal registrado toca, a Íris toca o som de chamada, mostra uma notificação do sistema e cria um cartão com **Atender** e **Recusar**. **Ctrl/Cmd + Enter** atende a chamada que está tocando. Com auto-atender ligado, o botão mostra a contagem ("auto em 2 s").'
            },
            { type: 'h', text: 'Várias chamadas ao mesmo tempo' },
            {
                type: 'p',
                text: 'Cada chamada é um cartão. Uma ligação entre dois ramais seus aparece como dois cartões: o de quem ligou (seta →) e o de quem recebeu (seta ←). Clique num cartão para selecioná-lo; os atalhos de teclado agem sobre o cartão selecionado.'
            }
        ]
    },
    {
        id: 'chamada',
        title: 'Durante a chamada',
        summary: 'Mudo, espera, DTMF e os números de qualidade do áudio.',
        blocks: [
            {
                type: 'note',
                kind: 'atenção',
                text: 'Em chamadas de **SIP puro** aparece também o botão **Gravar**: ele grava os dois lados num arquivo WAV (o seu lado no canal esquerdo, o outro no direito) na pasta `gravacoes` dos dados da Íris, e o log mostra o caminho. A gravação para sozinha quando a chamada termina. Avise quem está do outro lado antes de gravar: em muitos lugares isso é exigido por lei.'
            },
            { type: 'image', name: 'dtmf', alt: 'Cartão de chamada com o painel de DTMF aberto' },
            { type: 'h', text: 'O que o cartão mostra' },
            {
                type: 'list',
                items: [
                    '**Linha de cima**: ramal da conta, direção, número do outro lado, estado e tempo.',
                    '**Estado**: chamando, tocando, early media, em chamada, em espera, encerrada ou falhou.',
                    '**Linha de baixo**: nome da conta e detalhes como o último código SIP (`180 Ringing`), mudo, transferência em andamento, DTMF recebido e o motivo do fim.'
                ]
            },
            { type: 'h', text: 'Botões' },
            {
                type: 'table',
                head: ['Botão', 'O que faz', 'Atalho'],
                rows: [
                    [
                        'Mudo / Ativar mic',
                        'Corta ou devolve o seu microfone. O outro lado continua sendo ouvido',
                        'Ctrl/Cmd + M'
                    ],
                    ['Espera / Retomar', 'Põe a chamada em espera na central (re-INVITE) ou volta', 'Ctrl/Cmd + H'],
                    ['DTMF', 'Abre o painel para mandar dígitos', '—'],
                    ['Transferir', 'Abre o painel de transferência. Veja "Transferência"', '—'],
                    ['Desligar', 'Encerra a chamada', 'Ctrl/Cmd + E']
                ]
            },
            { type: 'h', text: 'DTMF: dígitos e sequências' },
            {
                type: 'p',
                text: 'No painel de DTMF você pode clicar no teclado para mandar um dígito na hora, ou escrever uma **sequência** e clicar em **Enviar**. A sequência aceita:'
            },
            {
                type: 'list',
                items: [
                    'Dígitos `0` a `9`, `*`, `#` e as letras `A` a `D`.',
                    '`w` seguido de segundos para esperar: `w2` espera 2 s (até 60).',
                    'Vírgula e espaço são só separadores, para você organizar.'
                ]
            },
            {
                type: 'p',
                text: 'Exemplo: `1,w2,4321#` manda 1, espera 2 s e manda 4321#. É assim que se percorre uma URA: um dígito, a pausa da gravação, o próximo dígito. **Parar** interrompe uma sequência em andamento.'
            },
            { type: 'h', text: 'Qualidade' },
            {
                type: 'p',
                text: 'Com a chamada estabelecida, o cartão mostra, atualizado a cada 2 s: **qualidade** (nota de 0 a 100), **jitter** (variação do atraso, em ms), **perda** (pacotes perdidos, em %), **RTT** (ida e volta, em ms) e o **codec**. Jitter e perda altos explicam áudio picotado; RTT alto explica atraso na conversa.'
            }
        ]
    },
    {
        id: 'historico',
        title: 'Histórico de chamadas',
        summary: 'O que aconteceu com cada chamada, depois que o cartão dela sumiu da tela.',
        blocks: [
            {
                type: 'p',
                text: 'A aba **Histórico**, ao lado de Telefone e Cenários, lista as chamadas encerradas, da mais nova para a mais antiga: o número, a conta, a hora, quanto tempo durou a conversa e como terminou, com o código SIP quando houve falha (por exemplo `486 Busy Here`).'
            },
            {
                type: 'list',
                items: [
                    '**Ligar de novo** disca o mesmo número pela mesma conta e volta para a aba Telefone. Fica apagado se a conta não está registrada.',
                    '**Fluxo SIP** abre o diagrama das chamadas daquela conta. O diagrama vem do log, que só existe enquanto o app está aberto: para chamadas de antes de fechar o app, a lista continua, mas o diagrama não.',
                    '**Limpar histórico** apaga tudo, depois de confirmar.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'O histórico guarda as 500 chamadas mais recentes em `history.json`, na pasta de dados. Chamadas feitas por cenários também entram.'
            }
        ]
    },
    {
        id: 'transferencia',
        title: 'Transferência',
        summary: 'Cega, para passar a chamada adiante na hora; assistida, para falar com o destino antes.',
        blocks: [
            { type: 'image', name: 'transferencia', alt: 'Cartão de chamada com o painel de transferência aberto' },
            { type: 'h', text: 'Cega' },
            {
                type: 'steps',
                items: [
                    'Com a chamada estabelecida, clique em **Transferir**.',
                    'Digite o destino e clique em **Cega**.',
                    'A central recebe o pedido (REFER) e o cartão mostra o andamento. Quando a central confirma, a sua perna da chamada termina.'
                ]
            },
            { type: 'h', text: 'Assistida (consultar antes)' },
            {
                type: 'steps',
                items: [
                    'Clique em **Transferir**, digite o destino e clique em **Consultar antes**.',
                    'A chamada original vai para espera e a Íris liga para o destino. Aparece um segundo cartão, o da consulta.',
                    'Fale com o destino. No cartão original aparece a faixa "Consulta para transferir".',
                    'Clique em **Transferir** nessa faixa para juntar os dois, ou em **Cancelar e voltar** para desligar a consulta e retomar a chamada original.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'O log mostra o REFER e os avisos (NOTIFY) da central. Se a transferência falhar, o código de retorno fica no cartão e no log.'
            }
        ]
    },
    {
        id: 'log',
        title: 'Log',
        summary: 'Tudo o que aconteceu, em ordem, com filtro por conta e o SIP bruto quando você precisa.',
        blocks: [
            { type: 'image', name: 'log', alt: 'Painel do log na aba Tudo, com mensagens SIP' },
            { type: 'h', text: 'Abas' },
            {
                type: 'list',
                items: [
                    '**Eventos**: frases curtas do que aconteceu ("Registro: registrada", "Chamada para 1002: 180 Ringing"). É a aba do dia a dia.',
                    '**SIP bruto**: as mensagens SIP completas. Só aparece para contas com **Mostrar SIP bruto no log** ligado.',
                    '**Tudo**: as duas coisas misturadas, na ordem em que aconteceram.'
                ]
            },
            { type: 'h', text: 'Filtros' },
            {
                type: 'list',
                items: [
                    '**Conta**: mostra só as linhas de uma conta. A cor do nome é a cor da conta.',
                    '**Nível**: `debug+` mostra tudo, inclusive detalhe interno da biblioteca SIP; `info+` é o padrão; `aviso+` e `erro` deixam só os problemas.',
                    '**Buscar**: filtra pelo texto, por exemplo `486` ou `INVITE`.'
                ]
            },
            { type: 'h', text: 'Rodapé' },
            {
                type: 'list',
                items: [
                    '**Copiar**: copia as linhas filtradas para a área de transferência.',
                    '**Salvar .txt / Salvar .json**: grava as linhas filtradas num arquivo, para anexar a um chamado.',
                    '**Limpar**: apaga o log da conta filtrada, ou tudo se o filtro for "Todas as contas".',
                    '**Explicar com IA**: manda o recorte atual para a IA explicar. Veja "Ajuda da IA".',
                    '**Fluxo SIP**: desenha as chamadas como diagrama de escada. Veja abaixo.',
                    '**Ir para o fim**: aparece quando você rola para cima; volta a acompanhar as linhas novas.'
                ]
            },
            { type: 'h', text: 'Fluxo SIP (diagrama de escada)' },
            {
                type: 'image',
                name: 'fluxo',
                alt: 'Tela Fluxo SIP com uma chamada recusada: INVITE, 100 Trying, 486 Busy Here em vermelho e ACK'
            },
            {
                type: 'p',
                text: 'Mostra o SIP bruto de cada chamada como setas entre a conta e o PBX, na ordem em que as mensagens passaram, com o tempo desde a primeira. Precisa de **Mostrar SIP bruto no log** ligado na conta.'
            },
            {
                type: 'list',
                items: [
                    '**Lista à esquerda**: uma linha por chamada (Call-ID), da mais nova para a mais antiga, com o resultado. Falhas aparecem em vermelho. REGISTER e OPTIONS ficam escondidos até você marcar a opção.',
                    '**Cores das setas**: azul é pedido, cinza é resposta provisória (1xx), verde é sucesso (2xx), amarelo é o desafio de senha (401 e 407, normal no registro) e vermelho é erro. Seta tracejada é a mesma mensagem enviada de novo, sinal de que o outro lado não respondeu a tempo.',
                    '**Clique numa seta** (ou use Tab e Enter) para ver a mensagem completa embaixo e copiá-la.',
                    '**Duas pernas**: marque a caixa de duas chamadas, por exemplo a do 1001 que liga e a do 1002 que recebe, para ver as duas com o PBX no meio.',
                    '**Salvar .html**: grava o desenho e todas as mensagens num arquivo que abre em qualquer navegador, bom para anexar num chamado. O arquivo não leva senha, Authorization nem nonce.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'O log nunca mostra senha, hash nem nonce: os dados de autenticação são retirados antes de chegar à tela e aos arquivos. Pode compartilhar o arquivo salvo, lembrando que ele tem ramais, números e endereços.'
            },
            {
                type: 'p',
                text: 'O app guarda até 50 000 linhas na memória e desenha as últimas 1 500; **Copiar** e **Salvar** levam todas as que passam no filtro. O log some quando o app fecha.'
            }
        ]
    },
    {
        id: 'saude',
        title: 'Saúde e diagnóstico',
        summary: 'Uma lista de verificação da conta e do ambiente, com o que fazer em cada aviso.',
        blocks: [
            { type: 'image', name: 'saude', alt: 'Janela de saúde de uma conta com a lista de verificações' },
            {
                type: 'p',
                text: 'Selecione a conta e clique em **⋯ → Saúde**. A Íris confere, na ordem:'
            },
            {
                type: 'table',
                head: ['Verificação', 'O que diz'],
                rows: [
                    ['Registro', 'O estado atual e, em erro, o código. Com `401`, sugere conferir senha e usuário'],
                    ['WebSocket', 'Se a conexão com a central está aberta'],
                    ['OPTIONS', 'Manda um OPTIONS e mede em quantos ms a central respondeu'],
                    ['Microfone', 'Se o sistema liberou o microfone para o app'],
                    ['Saídas de áudio', 'Quantos alto-falantes ou fones foram encontrados'],
                    ['TURN', 'Avisa quando não há servidor TURN: atrás de NAT simétrico a chamada pode ficar muda'],
                    ['Transporte', 'Avisa se o endereço é `ws://` (sem TLS), que muitas centrais recusam para WebRTC']
                ]
            },
            {
                type: 'p',
                text: '✓ é aprovado, ✗ é reprovado e ! é um aviso. **Verificar de novo** repete tudo; **Copiar relatório** leva o resultado em texto, pronto para colar num chamado.'
            },
            { type: 'h', text: 'Rede' },
            {
                type: 'list',
                items: [
                    '**DNS**: se o domínio da conta tem registros SRV de SIP (`_sip._udp`, `_sip._tcp`, `_sips._tcp`), a Saúde lista para onde eles apontam, com porta, prioridade e peso. A Íris ainda não segue esses registros ao conectar: ela usa o nome e a porta da conta. Se os dois não batem, a lista mostra onde o PBX espera o ramal.',
                    '**Certificado TLS**: em contas `wss://` e de SIP por TLS, mostra para quem o certificado foi emitido, por quem, até quando vale e para quais nomes. "Não confiável" com o motivo (autoassinado, vencido, nome diferente) é um aviso: se você já aceitou o host, a conta funciona mesmo assim.',
                    '**STUN**: se a conta tem um servidor `stun:` no campo STUN / TURN, mostra com que endereço e porta a sua rede aparece do lado de fora. Compare com o endereço que o PBX vê nas mensagens SIP (`received` e `rport` no Via) para entender um NAT. Sem servidor na conta, o teste não roda: a Íris não consulta um servidor que você não escolheu.'
                ]
            }
        ]
    },
    {
        id: 'telefone',
        title: 'Modo Telefone',
        summary: 'Uma janela estreita, como um celular, para quem só quer ligar e atender.',
        blocks: [
            { type: 'image', name: 'telefone', alt: 'Modo Telefone durante uma chamada' },
            {
                type: 'p',
                text: 'O botão **Modo Telefone**, na barra de cima, encolhe a janela e mostra só o essencial. O botão **Bancada** volta para as três colunas, no mesmo tamanho de antes. O app sempre abre na Bancada.'
            },
            {
                type: 'table',
                head: ['Tela', 'O que aparece'],
                rows: [
                    [
                        'Teclado',
                        'A conta escolhida no topo, o número com o nome quando ele é conhecido, o teclado e o botão verde de ligar'
                    ],
                    [
                        'Em chamada',
                        'Quem está do outro lado, o tempo, a qualidade em barrinhas e os botões Mudo, Espera, Teclado (DTMF), Transferir, Outra chamada e Ver o log'
                    ],
                    ['Chamada recebida', 'Ocupa a tela inteira, com Recusar e Atender']
                ]
            },
            {
                type: 'list',
                items: [
                    'Troque a conta pelo menu do topo. O ponto ao lado mostra se ela está registrada.',
                    'Dá para digitar o número pelo teclado do computador e ligar com **Enter**.',
                    'Passe o mouse nas barrinhas para ver a qualidade em números (jitter, perda, RTT e codec).',
                    '**Outra chamada** volta ao teclado sem desligar; as chamadas em andamento ficam listadas embaixo e voltam com um clique.',
                    'A transferência do modo Telefone é a cega. Para a assistida, use a Bancada.'
                ]
            }
        ]
    },
    {
        id: 'configuracoes',
        title: 'Configurações',
        summary: 'Seu perfil, as cores da Íris e as preferências gerais, numa tela só.',
        blocks: [
            { type: 'image', name: 'configuracoes', alt: 'Tela de Configurações aberta em Aparência' },
            {
                type: 'p',
                text: 'Abra pelo botão **Configurações** da barra de cima ou com **Ctrl+,** (no macOS, **Cmd+,**). As seções ficam à esquerda; as setas para cima e para baixo trocam de seção. Tudo é salvo na hora.'
            },
            {
                type: 'table',
                head: ['Seção', 'O que tem'],
                rows: [
                    [
                        'Perfil',
                        'Seu nome, que já vem como nome de exibição nas contas novas, e a conta principal, que fica escolhida no discador ao abrir'
                    ],
                    [
                        'Aparência',
                        'A cor de destaque (seis paletas prontas ou a sua própria cor) e o tamanho da interface'
                    ],
                    ['Áudio', 'Microfone e alto-falante. Veja "Áudio"'],
                    [
                        'Conexão',
                        'Quantas vezes a Íris tenta registrar de novo depois de uma queda, com espera crescente (2 s, 4 s, 8 s, até 1 minuto). O padrão é 10; com 0 ela não desiste'
                    ],
                    ['Ajuda da IA', 'A chave da OpenRouter, o modelo padrão e a máscara. Veja "Ajuda da IA"'],
                    ['Certificados', 'Os PBX com certificado autoassinado que você aceitou, com a opção de remover'],
                    ['Importar e exportar', 'Levar as contas para outra máquina. Veja "Importar e exportar contas"'],
                    ['Atualização', 'A versão instalada e a busca por versão nova. Veja "Atualização"']
                ]
            },
            { type: 'h', text: 'Cor de destaque' },
            {
                type: 'p',
                text: 'A cor aparece nos botões principais, nas abas e no contorno do foco do teclado. Clique numa das bolinhas para usar uma paleta pronta, ou no **+** para escolher qualquer cor. Os botões escurecem a cor o quanto for preciso para o texto branco continuar legível.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'As paletas prontas evitam verde, amarelo e vermelho, porque essas cores já dizem o estado das contas e das chamadas. Se a cor que você escolher ficar apagada contra o fundo escuro, a tela avisa.'
            }
        ]
    },
    {
        id: 'audio',
        title: 'Áudio',
        summary: 'Escolher microfone e alto-falante e conferir se os dois funcionam.',
        blocks: [
            { type: 'p', text: 'Fica em **Configurações › Áudio**.' },
            { type: 'image', name: 'audio', alt: 'Seção de áudio com microfone, medidor e alto-falante' },
            {
                type: 'list',
                items: [
                    '**Microfone**: escolha o dispositivo. A barra embaixo se mexe quando você fala; se não mexer, o microfone está mudo ou sem permissão.',
                    '**Alto-falante**: escolha por onde sai o áudio das chamadas e o toque.',
                    '**Tocar som de teste**: toca um bipe no alto-falante escolhido.'
                ]
            },
            {
                type: 'p',
                text: 'A troca vale na hora, inclusive para as chamadas em andamento, e fica guardada para a próxima vez. Use isso para testar fone Bluetooth, headset USB e caixas de som sem derrubar a chamada.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'No macOS e no Windows, o sistema pede permissão de microfone na primeira vez. Se você negou, libere nas configurações de privacidade do sistema e abra Configurações › Áudio de novo.'
            }
        ]
    },
    {
        id: 'cenarios',
        title: 'Cenários',
        summary: 'Roteiros de teste que a Íris executa sozinha, passo a passo, quantas vezes você quiser.',
        blocks: [
            { type: 'image', name: 'cenarios', alt: 'Aba Cenários com o exemplo de URA executado' },
            {
                type: 'p',
                text: 'Um cenário é uma lista de passos. A Íris executa um por um, marca cada um como passou (✓) ou falhou (✗) e mostra quanto tempo levou. Use para repetir o mesmo teste depois de cada mudança na central.'
            },
            { type: 'h', text: 'Começar pelo exemplo' },
            {
                type: 'steps',
                items: [
                    'Abra a aba **Cenários**, ao lado de **Telefone**.',
                    'Clique em **+ Exemplo de URA**. Ele cria: registrar, discar 8000, aguardar "em chamada", esperar 2 s, mandar 1234 e desligar.',
                    'Escolha a **Conta de origem** e clique em **Executar**.'
                ]
            },
            { type: 'h', text: 'Tipos de passo' },
            {
                type: 'table',
                head: ['Passo', 'O que faz'],
                rows: [
                    ['Registrar', 'Registra a conta (a de origem ou outra) e espera ficar registrada'],
                    ['Discar', 'Liga para um número e dá um apelido à chamada, como `c1`'],
                    ['Atender', 'Atende uma chamada que está tocando numa conta e dá um apelido a ela'],
                    ['Esperar', 'Espera um tempo fixo, em segundos'],
                    [
                        'Aguardar estado',
                        'Espera a chamada chegar a um estado (chamando, early media, em chamada, em espera, encerrada) até um limite. Falha se a chamada terminar antes, mostrando o código'
                    ],
                    ['DTMF', 'Manda uma sequência de dígitos, com a mesma sintaxe do cartão de chamada'],
                    ['Transferir', 'Transfere a chamada para um destino'],
                    ['Desligar', 'Encerra a chamada'],
                    ['Verificar', 'Confere um código SIP, o DTMF recebido ou um texto no log'],
                    ['Tocar tom', 'Toca um tom (frequência e duração) na chamada, no lugar do microfone'],
                    ['Tocar arquivo WAV', 'Toca um arquivo WAV de PCM de 16 bits, de até 2 minutos'],
                    [
                        'Esperar áudio',
                        'Passa quando chega áudio na chamada; falha se ela ficar muda até o tempo limite'
                    ],
                    ['Esperar silêncio', 'Passa quando o áudio para; falha se continuar chegando até o tempo limite']
                ]
            },
            { type: 'h', text: 'Monitor: deixar um cenário de vigia' },
            {
                type: 'p',
                text: 'Marque **Monitorar** no alto do cenário e diga o intervalo em minutos: a Íris passa a rodá-lo sozinha, com o app aberto ou na bandeja. Ela avisa só quando o resultado **muda**: uma notificação do sistema e uma linha no log quando o cenário passa a falhar, e outra quando volta a passar. Enquanto continua falhando, não repete o aviso.'
            },
            {
                type: 'list',
                items: [
                    'No campo **webhook** você pode pôr um endereço `http://` ou `https://`. A cada mudança, a Íris manda um `POST` com JSON: `event` (`failed` ou `recovered`), `scenario`, `failedStep`, `message`, `durationMs` e `at`. Serve para avisar num canal de chat ou abrir um chamado.',
                    'Ao lado aparece a hora da última execução e da próxima.',
                    'Se você estiver rodando outro cenário na hora, o monitor espera terminar.',
                    'O monitor só roda com a Íris aberta. Para vigiar sem ninguém logado, use a linha de comando num agendador (cron).'
                ]
            },
            { type: 'h', text: 'O mesmo roteiro para várias contas' },
            {
                type: 'p',
                text: 'Nos campos de número, dígitos e valor esperado você pode escrever `{ramal}`, `{dominio}` e `{nome}`: na hora de rodar, eles viram os dados da **conta de origem** do cenário. Assim um roteiro como "discar `*97`, mandar `{ramal}#`" serve para qualquer ramal: troque a conta de origem no alto do cenário ou, na linha de comando, use `--conta`.'
            },
            { type: 'h', text: 'Conferir o áudio' },
            {
                type: 'p',
                text: 'Código SIP certo não garante que há som: a chamada muda, ou com áudio só de um lado, completa do mesmo jeito. Os passos de áudio pegam isso. Um roteiro típico contra um número de eco: **Discar**, **Aguardar estado** em chamada, **Tocar tom** de 1 s e **Esperar áudio**. Se o tom não voltar, o passo falha e mostra o volume medido.'
            },
            {
                type: 'list',
                items: [
                    '**Esperar áudio** e **Esperar silêncio** funcionam em qualquer conta. O limite entre os dois é −50 dBFS, e o passo exige três medidas seguidas, para um estalo não contar como áudio.',
                    '**Tocar tom** e **Tocar arquivo** só funcionam em contas de **SIP puro** e no **PBX simulado**: em WebRTC a Íris não troca o que o microfone manda, e o passo falha dizendo isso.',
                    'Enquanto um tom ou arquivo toca, o microfone não vai para a chamada.',
                    'O arquivo WAV fica onde está no disco; o cenário guarda só o caminho. Ao levar o cenário para outra máquina, leve o arquivo junto.'
                ]
            },
            {
                type: 'p',
                text: 'Os **apelidos** ligam os passos: "Discar … como c1" cria a chamada c1, e os passos seguintes escolhem c1 para agir sobre ela. Com dois apelidos você testa uma chamada entre dois ramais seus: um passo disca, outro atende.'
            },
            { type: 'h', text: 'Editar' },
            {
                type: 'list',
                items: [
                    '**+ Passo** adiciona um passo do tipo escolhido ao lado.',
                    'As setas **↑ ↓** mudam a ordem e o **✕** remove o passo.',
                    'Cada passo pode usar a conta de origem ou outra conta.',
                    '**+ Novo**, **Duplicar** e **Excluir** cuidam dos cenários. Tudo é salvo sozinho a cada edição.'
                ]
            },
            { type: 'h', text: 'Repetir e medir' },
            {
                type: 'p',
                text: 'Digite um número ao lado de **Executar** e clique em **Repetir N×**. No fim aparece o relatório: taxa de sucesso, quantas passaram, tempo médio e p95 (o tempo que 95% das execuções não ultrapassaram). **Relatório .txt** e **Relatório .json** salvam o resultado. **Parar** interrompe.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Um cenário que passa 20 vezes seguidas é um bom critério para dizer que uma URA ou uma rota está estável.'
            }
        ]
    },
    {
        id: 'linha-de-comando',
        title: 'Linha de comando',
        summary: 'Rodar cenários sem abrir a janela, para testes automáticos e CI.',
        blocks: [
            {
                type: 'p',
                text: 'O mesmo app executa cenários pelo terminal. Ele escreve o resultado de cada passo, salva o relatório se você pedir e sai com um código que o seu script pode conferir.'
            },
            {
                type: 'code',
                text: 'iris --cenario "URA 8000" --vezes 20 --relatorio resultado.json'
            },
            {
                type: 'table',
                head: ['Opção', 'O que faz'],
                rows: [
                    ['--cenario <nome|id>', 'Cenário a executar. Pode repetir a opção para rodar vários'],
                    ['--todos', 'Executa todos os cenários'],
                    ['--vezes <n>', 'Repete cada cenário n vezes (padrão 1)'],
                    [
                        '--relatorio <arquivo>',
                        'Salva o relatório em `.json`, `.txt` ou `.xml`. O `.xml` sai no formato JUnit, que os sistemas de CI mostram como lista de testes'
                    ],
                    [
                        '--conta <conta>',
                        'Roda o cenário com esta conta de origem (id, nome ou `ramal@domínio`) no lugar da que está nele. Repita a opção para rodar uma vez com cada conta'
                    ],
                    [
                        '--contas <arquivo>',
                        'Usa contas de um arquivo exportado pela Íris, com senhas. Não lê nem altera os seus dados'
                    ],
                    ['--cenarios <arquivo>', 'Usa um arquivo de cenários em vez dos salvos no app'],
                    ['--confiar-host <host>', 'Aceita o certificado autoassinado desse host. Pode repetir'],
                    ['--midia-falsa', 'Usa um microfone falso, para máquinas sem placa de som'],
                    ['--ajuda', 'Mostra a ajuda']
                ]
            },
            {
                type: 'p',
                text: 'Códigos de saída: **0** tudo passou, **1** algum passo falhou, **2** erro de uso ou de configuração. Os nomes em inglês também valem (`--scenario`, `--all`, `--runs`, `--report`, `--account`, `--accounts`, `--scenarios`, `--trust-host`, `--fake-media`, `--help`).'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'No Linux sem tela, rode com `xvfb-run -a`. O modo de linha de comando pode rodar com o app aberto e não procura atualização.'
            }
        ]
    },
    {
        id: 'importar',
        title: 'Importar e exportar contas',
        summary: 'Levar as contas para outra máquina ou passar para um colega.',
        blocks: [
            { type: 'p', text: 'Fica em **Configurações › Importar e exportar**.' },
            { type: 'image', name: 'importar', alt: 'Seção de importar e exportar contas' },
            { type: 'h', text: 'Exportar' },
            {
                type: 'p',
                text: 'Salva todas as contas num arquivo JSON. Por padrão as **senhas não vão** no arquivo: quem importar digita a senha de cada conta. Marque **Incluir senhas em texto puro no arquivo** só quando precisar, por exemplo para usar com `--contas` na linha de comando.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'Um arquivo com senhas permite registrar os seus ramais. Guarde e compartilhe com o mesmo cuidado de uma senha.'
            },
            { type: 'h', text: 'Importar' },
            {
                type: 'p',
                text: 'Lê um arquivo exportado pela Íris. Contas com o mesmo id são substituídas; as outras são adicionadas. Depois de importar, use **Todas → Registrar todas** para pôr as contas novas no ar.'
            },
            { type: 'h', text: 'Importar planilha (CSV)' },
            {
                type: 'p',
                text: 'Para cadastrar muitos ramais de uma vez, monte uma planilha, salve como CSV e use **Escolher planilha**. A primeira linha diz as colunas; as contas vêm nas linhas seguintes:'
            },
            {
                type: 'code',
                text: 'nome;ramal;dominio;senha;transporte;endereco\nSuporte 1001;1001;pbx.empresa.com;segredo;ws;wss://pbx.empresa.com:8089/ws\nFila 2001;2001;10.0.0.5;segredo;udp;10.0.0.5:5060'
            },
            {
                type: 'list',
                items: [
                    '**transporte**: `ws` (WebSocket, o padrão), `udp`, `tcp` ou `tls`.',
                    '**endereco**: o WebSocket (`wss://…`) ou, em SIP puro, o host e a porta. Em SIP puro pode ficar vazio.',
                    'Colunas opcionais: **usuario** (de autenticação), **auto-atender** e **srtp** (`sim` liga).',
                    'O separador pode ser ponto e vírgula, vírgula ou tabulação. São até 1000 contas por vez.',
                    'Se uma linha estiver errada, **nenhuma conta é criada** e a tela diz qual linha e por quê.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'A planilha tem as senhas em texto puro. Apague o arquivo depois de importar.'
            }
        ]
    },
    {
        id: 'certificados',
        title: 'Certificados',
        summary: 'O que fazer quando a central usa certificado autoassinado.',
        blocks: [
            {
                type: 'p',
                text: 'A Íris recusa qualquer certificado TLS inválido. Centrais de laboratório costumam usar certificado autoassinado, então a primeira tentativa de registro falha e aparece uma faixa vermelha no alto: "O certificado TLS de … foi recusado".'
            },
            {
                type: 'list',
                items: [
                    '**Confiar neste host**: aceita o certificado **só desse host** e refaz o registro das contas que o usam. A escolha fica guardada.',
                    '**Ignorar**: fecha a faixa sem aceitar. A conta continua sem registrar.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'Só confie num host que é seu. Aceitar o certificado de um servidor desconhecido permite que alguém no meio do caminho leia a sinalização e a senha do ramal.'
            }
        ]
    },
    {
        id: 'ia',
        title: 'Ajuda da IA',
        summary: 'Pedir a um modelo de IA que explique o log, uma chamada ou uma falha de registro.',
        blocks: [
            { type: 'image', name: 'ia', alt: 'Janela da ajuda da IA com a prévia do texto e a resposta' },
            {
                type: 'p',
                text: 'É opcional e usa a **sua chave da OpenRouter** (crie em openrouter.ai/keys). O uso é cobrado na sua conta de lá. Sem chave, nada é enviado.'
            },
            { type: 'h', text: 'Onde pedir' },
            {
                type: 'list',
                items: [
                    '**Explicar com IA**, no rodapé do log: usa as linhas do filtro atual.',
                    '**Explicar com IA**, no cartão de uma chamada encerrada: usa o log daquela conta durante a chamada.',
                    '**Por que falhou?**, numa conta em erro: usa as últimas linhas da conta.'
                ]
            },
            { type: 'h', text: 'Como usar' },
            {
                type: 'steps',
                items: [
                    'Na primeira vez, cole a chave e clique em **Salvar chave**.',
                    'Escolha o **Modelo**. A lista vem da OpenRouter; a sugestão inicial é um Claude Sonnet.',
                    'Leia o **Texto que será enviado**. É exatamente isso que sai da sua máquina, mais uma instrução fixa de como responder.',
                    'Clique em **Enviar para a OpenRouter** e espere a resposta, que vem em três partes: o que aconteceu, causa provável e o que fazer.'
                ]
            },
            { type: 'h', text: 'O que sai da sua máquina' },
            {
                type: 'list',
                items: [
                    '**Máscara ligada (padrão)**: ramais, números, IPs, domínios e nomes de conta viram marcadores como `[NÚMERO-1]` e `[HOST-1]`. A conversa SIP continua legível, mas sem os seus dados.',
                    '**Máscara desligada**: o texto vai como aparece na prévia. Útil quando a explicação depende de um número ou endereço específico.',
                    '**Senhas e dados de autenticação nunca são enviados**, com ou sem máscara.',
                    'Vão no máximo as 400 linhas mais novas do recorte.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'A máscara cobre o que o app reconhece. Um texto livre dentro de um cabeçalho SIP pode passar; por isso a prévia existe. E a IA pode errar: confira a explicação com o log antes de mexer na central.'
            },
            {
                type: 'p',
                text: 'A chave fica no arquivo de senhas da Íris, cifrada, não aparece de novo na tela e não entra em exportações. **Remover chave** apaga.'
            }
        ]
    },
    {
        id: 'atualizacao',
        title: 'Atualização',
        summary: 'Como a Íris procura, baixa e instala versões novas.',
        blocks: [
            { type: 'p', text: 'Fica em **Configurações › Atualização**.' },
            { type: 'image', name: 'atualizacao', alt: 'Seção de atualização' },
            {
                type: 'list',
                items: [
                    'O app instalado procura versão nova pouco depois de abrir e quando você abre **Configurações › Atualização**.',
                    '**Nada é baixado sozinho.** Quando há versão nova, aparece o botão "Atualização disponível" na barra e você decide clicar em **Baixar**.',
                    'Depois de baixada, a versão entra quando o app reinicia. **Reiniciar e instalar** faz isso na hora e fica desligado enquanto houver chamada ativa.'
                ]
            },
            { type: 'h', text: 'Canais' },
            {
                type: 'list',
                items: [
                    '**Estável**: só as versões finais.',
                    '**Beta**: também as versões de teste (como `1.2.0-beta.1`), para quem quer experimentar antes.'
                ]
            },
            { type: 'h', text: 'Onde funciona' },
            {
                type: 'table',
                head: ['Sistema', 'Atualização automática'],
                rows: [
                    ['Windows', 'Sim'],
                    ['Linux, AppImage', 'Sim'],
                    ['Linux, .deb', 'Não: baixe e instale o `.deb` da versão nova'],
                    [
                        'macOS',
                        'Sim. Como o app não tem assinatura da Apple, a própria Íris baixa, confere o arquivo (SHA-512) e se troca ao reiniciar, sem o aviso da Apple. Se der erro, a tela mostra um comando para colar no Terminal'
                    ]
                ]
            }
        ]
    },
    {
        id: 'bandeja',
        title: 'Bandeja e notificações',
        summary: 'O app continua trabalhando com a janela fechada.',
        blocks: [
            {
                type: 'list',
                items: [
                    '**Fechar a janela só a esconde.** Os ramais continuam registrados e as chamadas continuam.',
                    'O **ícone na bandeja** (área de notificação) traz a janela de volta com um clique e tem o menu **Mostrar Íris** e **Sair**.',
                    'A **cor do ícone** diz o estado geral: cinza sem conta registrada, verde com contas registradas, amarelo com chamada tocando, azul em chamada e vermelho quando alguma conta está em erro. Parar o mouse em cima mostra os números.',
                    '**Sair** encerra o app de verdade: os ramais saem do ar e as chamadas caem.',
                    'Uma **chamada recebida** gera uma notificação do sistema; clicar nela abre a janela. Na Bancada, ela também aparece numa faixa colorida no alto da coluna do meio, com **Atender** e **Recusar**.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Em alguns ambientes Linux não existe área de notificação. Nesse caso, fechar a janela encerra o app.'
            }
        ]
    },
    {
        id: 'atalhos',
        title: 'Atalhos de teclado',
        summary: 'As ações mais comuns sem tirar a mão do teclado.',
        blocks: [
            {
                type: 'table',
                head: ['Atalho', 'O que faz'],
                rows: [
                    ['Ctrl/Cmd + L', 'Vai para a aba Telefone e põe o cursor no campo de número'],
                    ['Ctrl/Cmd + Enter', 'Atende a chamada que está tocando'],
                    ['Ctrl/Cmd + E', 'Desliga a chamada selecionada'],
                    ['Ctrl/Cmd + M', 'Liga ou desliga o mudo da chamada selecionada'],
                    ['Ctrl/Cmd + H', 'Põe em espera ou retoma a chamada selecionada'],
                    ['Ctrl/Cmd + 1 a 9', 'Seleciona a conta nessa posição da lista'],
                    ['F1', 'Abre este guia'],
                    ['Esc', 'Fecha a janela que estiver aberta por cima']
                ]
            },
            {
                type: 'p',
                text: '"Chamada selecionada" é o cartão em que você clicou por último. No macOS use Cmd; no Windows e no Linux, Ctrl.'
            }
        ]
    },
    {
        id: 'dados',
        title: 'Seus dados e segurança',
        summary: 'Onde a Íris guarda as coisas e o que ela nunca faz.',
        blocks: [
            {
                type: 'table',
                head: ['O quê', 'Onde fica'],
                rows: [
                    ['Contas (sem senha)', '`accounts.json`, na pasta de dados'],
                    [
                        'Senhas dos ramais e chave da IA',
                        '`senhas.json`, cifrado com uma chave própria (`chave-local.bin`); os dois só podem ser lidos pela sua conta do sistema'
                    ],
                    ['Cenários', '`scenarios.json`'],
                    ['Histórico de chamadas', '`history.json`, com as 500 mais recentes'],
                    [
                        'Gravações de chamadas',
                        'Pasta `gravacoes`: um arquivo WAV por gravação, sem cifra. Só existem se você clicar em Gravar'
                    ],
                    ['Preferências', '`settings.json`: áudio, canal de atualização, hosts confiáveis, opções da IA'],
                    ['Log das contas (eventos e SIP)', 'Só na memória, até o app fechar ou você salvar'],
                    [
                        'Log interno do app',
                        'Pasta `logs`: `iris.log` e até quatro anteriores, de 10 MB cada. Guarda só as falhas do próprio app (erros, canais que falharam), para investigar um defeito. Não tem SIP nem senha'
                    ]
                ]
            },
            {
                type: 'p',
                text: 'A pasta de dados é `~/Library/Application Support/Iris` no macOS, `%APPDATA%\\Iris` no Windows e `~/.config/Iris` no Linux.'
            },
            { type: 'h', text: 'O que a Íris não faz' },
            {
                type: 'list',
                items: [
                    'Não grava senha em texto puro: o arquivo de senhas é cifrado. Quem tiver a pasta de dados inteira, porém, consegue ler as senhas; trate essa pasta como confidencial.',
                    'Não apaga um arquivo estragado. Senhas, contas, cenários ou preferências que não dão para ler são guardados ao lado, com a data no nome, e a tela avisa. O app abre mesmo assim.',
                    'Não põe senha, hash nem nonce no log, nem na tela nem nos arquivos salvos.',
                    'Não manda nada para fora além do que você pede: o registro e as chamadas com a sua central, a busca por atualização no GitHub e, se você usar, o texto da prévia para a OpenRouter.',
                    'Não aceita certificado inválido sem você mandar, e só para o host escolhido.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'A Íris não usa mais o cofre de senhas do sistema, então o macOS não pede a senha de login ao abrir. Quem veio de uma versão até a 1.0.5 pode ver esse pedido uma última vez, enquanto as senhas antigas são trazidas para o arquivo novo.'
            }
        ]
    },
    {
        id: 'problemas',
        title: 'Problemas comuns',
        summary: 'O sintoma, a causa mais provável e o que fazer.',
        blocks: [
            {
                type: 'table',
                head: ['Sintoma', 'Causa provável', 'O que fazer'],
                rows: [
                    [
                        'Conta em erro `401` ou `403`',
                        'Senha, ramal ou usuário de autenticação errados; ou o ramal não aceita WebRTC',
                        'Confira os dados em Editar. Na central, veja se o ramal tem WebRTC ligado'
                    ],
                    [
                        'Faixa "certificado TLS recusado"',
                        'Certificado autoassinado ou vencido',
                        'Se a central é sua, clique em Confiar neste host'
                    ],
                    [
                        'Conta em erro "WebSocket closed" ou `1006`',
                        'Endereço WSS errado, porta fechada, ou a central demorou a responder',
                        'Confira o endereço e a porta; rode Saúde; clique em Registrar de novo'
                    ],
                    [
                        'Fica em "conectando" e não sai',
                        'A central não responde no endereço informado',
                        'Teste o endereço WSS; veja firewall e se o serviço de WebSocket está ligado na central'
                    ],
                    [
                        'A chamada conecta, mas não tem áudio',
                        'NAT sem TURN, ou microfone sem permissão',
                        'Rode Saúde. Cadastre um TURN em Avançado. Confira Configurações › Áudio'
                    ],
                    [
                        'A URA não reconhece os dígitos',
                        'Modo DTMF diferente do que a central espera',
                        'Troque o Modo DTMF da conta entre SIP INFO e RTP'
                    ],
                    [
                        'A aba "SIP bruto" está vazia',
                        'A opção não está ligada na conta',
                        'Edite a conta e marque Mostrar SIP bruto no log'
                    ],
                    [
                        'Botão Ligar apagado',
                        'A conta de origem não está registrada',
                        'Registre a conta ou escolha outra em Discar de'
                    ],
                    [
                        'Aparece "0 contas" e um aviso amarelo ao abrir',
                        'O sistema está pedindo a senha para liberar as senhas antigas (só na primeira abertura depois de atualizar da 1.0.5 ou anterior)',
                        'Responda ao pedido do sistema; no macOS, escolha Permitir Sempre'
                    ],
                    [
                        'A central só tem SIP por UDP ou TCP',
                        'Sem WebSocket, a Íris não conecta',
                        'Ponha um gateway WebRTC na frente (Kamailio ou Asterisk como ponte)'
                    ]
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Quando o motivo não estiver claro, ligue **Mostrar SIP bruto no log** na conta, repita o teste e leia a aba **Tudo**. Se quiser, peça a explicação em **Explicar com IA**.'
            }
        ]
    }
]
