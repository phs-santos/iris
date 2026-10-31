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
                    '**Ler o log lado a lado com a chamada**, com o SIP bruto quando precisar.'
                ]
            },
            { type: 'image', name: 'principal', alt: 'Janela principal da Íris com duas chamadas em andamento' },
            { type: 'h', text: 'O que a central precisa ter' },
            {
                type: 'p',
                text: 'A Íris fala com a central de dois jeitos. O mais completo é **SIP sobre WebSocket seguro (WSS)** com áudio **WebRTC**: Asterisk (PJSIP com `transport` WSS), FreeSWITCH e Kamailio fazem isso. O outro é **SIP puro por UDP, TCP ou TLS**, para centrais sem WebSocket: a conta registra, liga e recebe chamadas com áudio **G.711** ou **Opus** e DTMF. Em SIP puro o áudio só é cifrado se a conta exigir SRTP.'
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
                    '**Atualização disponível**: aparece só quando há versão nova. Veja "Atualização".',
                    '**Guia**: abre esta tela. A tecla **F1** também abre.',
                    '**Configurações**: aparência, áudio, certificados, importar e exportar e atualização. O atalho é **Ctrl+,** (no macOS, **Cmd+,**).'
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
            {
                type: 'p',
                text: 'Clique no nome do PBX (o domínio acima das contas) para **recolher o grupo**: ele mostra só quantas contas estão no ar, como "2/3 no ar". A escolha fica guardada nesta máquina.'
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
                    '**⋯ → Excluir**: pede confirmação e apaga a conta e a senha guardada.'
                ]
            },
            { type: 'h', text: 'Quando o registro falha' },
            {
                type: 'p',
                text: 'A conta mostra um quadro vermelho com o problema em português e o que conferir, por exemplo "O PBX recusou o login: confira usuário e senha". O código SIP original (como `403 Forbidden`) continua na linha da conta.'
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
            { type: 'h', text: 'Servidores: a conexão escrita uma vez só' },
            {
                type: 'p',
                text: 'Quando várias contas usam o mesmo PBX, cadastre o PBX em **Configurações → Servidores**: nome, domínio, transporte, endereço, STUN/TURN, preset e SRTP. Na conta, escolha o servidor na lista **Servidor** e preencha só nome, ramal e senha; os campos de conexão ficam travados. **Editar o servidor muda todas as contas dele de uma vez**, e as que estão no ar registram de novo com os dados novos.'
            },
            {
                type: 'list',
                items: [
                    'Já tem uma conta pronta? No formulário dela, **Salvar conexão como servidor** cadastra o servidor e liga a conta a ele.',
                    'Para mudar a conexão de uma conta só, escolha **Nenhum** na lista Servidor: ela se solta e os campos voltam a ser editáveis.',
                    'Excluir um servidor não apaga nem desconecta as contas: elas ficam com os dados que tinham, só deixam de mudar junto.'
                ]
            },
            { type: 'h', text: 'Contas por SIP puro (UDP, TCP ou TLS)' },
            {
                type: 'p',
                text: 'Servem para centrais que não têm WebSocket. A conta **registra**, renova o registro sozinha, **liga e recebe chamadas** com áudio G.722 (voz em alta definição), G.711 (PCMU ou PCMA) ou Opus, manda e recebe **DTMF** (por RTP ou SIP INFO), tem **mudo**, **espera** e **transferência** cega e assistida, mede a **Saúde** e a qualidade (perda, variação do atraso e tempo de ida e volta) e mostra o **SIP bruto** e o **Fluxo SIP**.'
            },
            {
                type: 'list',
                items: [
                    'Em **TLS**, um certificado autoassinado é recusado e a tela oferece **Confiar neste host**, como no WebSocket.',
                    'Em **UDP**, a Íris repete o pedido se a central não responder e desiste depois de 32 segundos, com o erro `408`.',
                    'O áudio vai por **RTP sem cifra**, a não ser que você marque **Exigir áudio cifrado (SRTP)** na conta. Com essa opção, a Íris oferece SRTP ao ligar e recusa (`488`) quem liga sem ele; na linha de qualidade aparece `(SRTP)` ao lado do codec. Uma chamada recebida que já venha com SRTP é atendida com cifra mesmo sem a opção.',
                    'A chave do SRTP vai dentro da sinalização (SDES). Para ela não passar em claro, use o transporte **TLS** junto.',
                    'Com SRTP, o tempo de ida e volta (RTT) fica em 0: ele vem do RTCP, que a Íris só troca sem cifra.',
                    'A central precisa aceitar **G.722**, **G.711** ou **Opus**. A Íris oferece o G.722 primeiro: quando a central aceita, a voz vai em alta definição (16 kHz, até 7 kHz de agudos) e a linha de qualidade mostra `G722`. Senão vale o G.711, e o Opus quando é só o que a central tem; o Opus sai em banda estreita (8 kHz), a mesma qualidade do G.711. Uma central que só oferece G.729 recusa a chamada com `488`. A gravação continua a 8 kHz, mesmo em chamada G.722.',
                    'Na primeira vez, o firewall do sistema pode perguntar se a Íris pode usar a rede. Permita: sem isso o áudio não chega.'
                ]
            },
            { type: 'h', text: 'Opções' },
            {
                type: 'list',
                items: [
                    '**PBX simulado (sem rede)**: a conta usa a central falsa embutida. Bom para treinar.',
                    '**Registrar ao abrir o app**: a conta entra no ar sozinha quando a Íris abre.',
                    '**Auto-atender após … ms**: a conta atende sozinha depois do tempo informado. É o que permite testar uma chamada entre dois ramais sem clicar em Atender.'
                ]
            },
            { type: 'h', text: 'Avançado' },
            {
                type: 'table',
                head: ['Campo', 'Quando mexer'],
                rows: [
                    ['Preset', 'Ajusta detalhes para Asterisk, Kamailio ou uma central genérica'],
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
        summary: 'Uma central falsa embutida, para aprender o app sem servidor nem rede.',
        blocks: [
            {
                type: 'p',
                text: 'As contas marcadas com **SIM** falam com uma central de mentira dentro do próprio app. O registro, as chamadas, o DTMF e os erros são simulados, mas a tela e o log funcionam igual.'
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
                    '**Atalhos**: os botões com número e descrição ligam com um clique. Vêm das outras contas do mesmo PBX e dos contatos da conta.',
                    '**teclado**: abre um teclado de telefone para montar o número com o mouse, com o botão de ligar e o de apagar. Segurar o **0** escreve **+**.',
                    '**cabeçalhos SIP**: abre um campo para mandar cabeçalhos extras no INVITE, um por linha, como `X-Test-Id: teste-42`. Serve para testar regras da central que dependem de cabeçalho.'
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
            },
            { type: 'h', text: 'O que você ouve antes de atenderem' },
            {
                type: 'p',
                text: 'Enquanto o outro lado não atende, o cartão diz de onde vem o som. **toque local** é o toque que a própria Íris toca quando o PBX responde só `180 Ringing`. **ouvindo o áudio do PBX** aparece com o estado **early media**: o PBX respondeu `183` e está mandando o próprio som (o toque da operadora, uma mensagem de "número inexistente"), e o medidor do cartão mostra esse áudio chegando. Em contas de SIP puro isso vale sempre. Em contas WebRTC é preciso ligar **Ouvir o áudio do PBX antes de atender (early media)** na conta; sem a opção, o cartão avisa que o PBX mandou áudio mas o toque é o local.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'Em WebRTC, deixe a opção de early media desligada se o PBX bifurca a chamada para vários destinos (um proxy como o Kamailio tocando em vários aparelhos): quando quem atende não é quem mandou o áudio, a biblioteca derruba a chamada. Com Asterisk e FreeSWITCH isso não acontece.'
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
                text: 'Em chamadas de **SIP puro** aparece também o botão **Gravar**: ele grava os dois lados num arquivo WAV (o seu lado no canal esquerdo, o outro no direito) na pasta `gravacoes` dos dados da Íris, e o log mostra o caminho. O botão **Gravações**, ao lado, abre essa pasta; ela também abre por **Configurações › Áudio**. A gravação para sozinha quando a chamada termina. Avise quem está do outro lado antes de gravar: em muitos lugares isso é exigido por lei.'
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
        id: 'contatos',
        title: 'Contatos',
        summary: 'A agenda: os números que você mais usa, com nome, para ligar com um clique.',
        blocks: [
            {
                type: 'p',
                text: 'A aba **Contatos**, ao lado de Telefone, guarda nome, número, observação e a conta do contato. **+ Novo contato** cadastra; a busca acha por nome, número ou observação, sem diferenciar acento.'
            },
            {
                type: 'list',
                items: [
                    '**Ligar** disca pela conta do contato; se ela não estiver registrada, pela conta escolhida no discador. O botão fica apagado quando nenhuma das duas está no ar.',
                    'Os contatos de uma conta viram atalhos no discador dela.',
                    'Quando um contato liga, ou quando você liga para ele, a chamada mostra o **nome** da agenda.',
                    'Ao digitar no discador, os números da agenda aparecem como sugestão.',
                    '**Importar CSV** e **Exportar CSV** levam a agenda de e para uma planilha, com as colunas `nome;numero;observacao`. Os importados vão para a conta escolhida no discador. Contatos com um número que já existe não entram de novo.'
                ]
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
                    '**SIP bruto**: as mensagens SIP completas, sem senhas, sempre guardadas.',
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
                text: 'Mostra o SIP bruto de cada chamada como setas entre a conta e o PBX, na ordem em que as mensagens passaram, com o tempo desde a primeira.'
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
        id: 'configuracoes',
        title: 'Configurações',
        summary: 'O tema, a cor da Íris e as preferências gerais, numa tela só.',
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
                    ['Aparência', 'O tema (claro, escuro ou o do sistema) e a cor de destaque'],
                    ['Áudio', 'Microfone e alto-falante. Veja "Áudio"'],
                    [
                        'Notificações',
                        'Quais avisos do sistema aparecem e o botão para testar. Veja "Bandeja e notificações"'
                    ],
                    ['Servidores', 'Os PBX cadastrados, para as contas reaproveitarem a conexão. Veja "Contas"'],
                    [
                        'Conexão',
                        'Quantas vezes a Íris tenta registrar de novo depois de uma queda, com espera crescente (2 s, 4 s, 8 s, até 1 minuto). O padrão é 10; com 0 ela não desiste'
                    ],
                    ['Certificados', 'Os PBX com certificado autoassinado que você aceitou, com a opção de remover'],
                    ['Importar e exportar', 'Levar as contas para outra máquina. Veja "Importar e exportar contas"'],
                    ['Atualização', 'A versão instalada e a busca por versão nova. Veja "Atualização"']
                ]
            },
            { type: 'h', text: 'Tema' },
            {
                type: 'p',
                text: 'Em **Aparência**, o **Tema** pode ser Claro (o padrão), Escuro ou **Sistema**, que acompanha o modo claro ou escuro do computador e troca sozinho.'
            },
            { type: 'h', text: 'Cor de destaque' },
            {
                type: 'p',
                text: 'A cor aparece nos botões principais, nas abas e no contorno do foco do teclado. Clique na bolinha para escolher qualquer cor; **Cor padrão** volta ao azul da Íris. Os botões escurecem a cor o quanto for preciso para o texto branco continuar legível.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Evite verde, amarelo e vermelho, porque essas cores já dizem o estado das contas e das chamadas. Se a cor que você escolher ficar apagada contra o fundo, a tela avisa.'
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
                    '**Tocar som de teste**: toca um bipe no alto-falante escolhido.',
                    '**Volume do toque**: o quão alto a chamada recebida toca. "Ouvir" toca uma vez. O som em si é de cada conta: em Editar → **Toque das chamadas recebidas**, escolha Clássico, Digital, Suave, Sino ou Nenhum, para saber qual linha está tocando sem olhar a tela.'
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
        id: 'importar',
        title: 'Importar e exportar contas',
        summary: 'Levar as contas para outra máquina ou passar para um colega.',
        blocks: [
            { type: 'p', text: 'Fica em **Configurações › Importar e exportar**.' },
            { type: 'image', name: 'importar', alt: 'Seção de importar e exportar contas' },
            { type: 'h', text: 'Exportar' },
            {
                type: 'p',
                text: 'Salva todas as contas num arquivo JSON. Por padrão as **senhas não vão** no arquivo: quem importar digita a senha de cada conta. Marque **Incluir senhas em texto puro no arquivo** só quando precisar.'
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
                    'Uma **chamada recebida** gera uma notificação do sistema, com **Atender** e **Recusar** no próprio aviso (no macOS); clicar nela abre a janela. Na Bancada, ela também aparece numa faixa colorida no alto da coluna do meio.',
                    'Também avisam: **chamada perdida** e **conta que caiu**. Em **Configurações → Notificações** você escolhe quais avisos quer, pode fazer a chamada recebida trazer a janela para a frente e tem o botão **Testar notificação**.',
                    'Não aparece nada? No macOS, confira em **Ajustes do Sistema → Notificações → Iris** se os avisos estão permitidos e se o **Não Perturbe** está desligado. Contas com auto-atender não avisam de chamada recebida.'
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
                text: '"Chamada selecionada" é o cartão em que você clicou por último. No macOS use Cmd; no Windows e no Linux, Ctrl. Os atalhos só valem com a janela da Íris em foco.'
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
                        'Senhas dos ramais',
                        '`senhas.json`, cifrado com uma chave própria (`chave-local.bin`); os dois só podem ser lidos pela sua conta do sistema'
                    ],
                    ['Contatos e servidores', '`contacts.json` e `servers.json`'],
                    [
                        'Gravações de chamadas',
                        'Pasta `gravacoes`: um arquivo WAV por gravação, sem cifra. Só existem se você clicar em Gravar'
                    ],
                    ['Preferências', '`settings.json`: áudio, canal de atualização, hosts confiáveis'],
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
                    'Não apaga um arquivo estragado. Senhas, contas ou preferências que não dão para ler são guardados ao lado, com a data no nome, e a tela avisa. O app abre mesmo assim.',
                    'Não põe senha, hash nem nonce no log, nem na tela nem nos arquivos salvos.',
                    'Não manda nada para fora além do que você pede: o registro e as chamadas com a sua central, a busca por atualização no GitHub ',
                    'Não aceita certificado inválido sem você mandar, e só para o host escolhido.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'A Íris não usa o cofre de senhas do sistema (as Chaves do macOS), então o sistema não pede a senha de login ao abrir. Se esse pedido aparecer numa versão antiga, atualize para a 1.6.1 ou mais nova.'
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
                        'Botão Ligar apagado',
                        'A conta de origem não está registrada',
                        'Registre a conta ou escolha outra em Discar de'
                    ],
                    [
                        'O macOS pede a senha das Chaves ao abrir',
                        'Versão anterior à 1.6.1, que ainda usava o cofre de senhas do sistema',
                        'Atualize a Íris. Desde a 1.6.1 ela não usa as Chaves'
                    ],
                    [
                        'A central só tem SIP por UDP ou TCP',
                        'A conta foi criada com o transporte WebSocket',
                        'Edite a conta e escolha o transporte SIP por UDP, TCP ou TLS'
                    ]
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Quando o motivo não estiver claro, repita o teste e leia a aba **Tudo**, que traz o SIP bruto.'
            }
        ]
    }
]
