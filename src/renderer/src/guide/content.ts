// Conteúdo do guia de uso (entrega do M4). Texto puro com duas marcas: **negrito** e `código`.
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
                text: 'A Íris é um softphone: um telefone que roda no computador e fala com a central por SIP sobre WebSocket, com áudio por WebRTC. Ela foi feita para **testar** telefonia, não para atender clientes o dia todo.'
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
                text: 'A Íris só conecta em centrais que aceitam **SIP sobre WebSocket seguro (WSS)** e áudio **WebRTC**. Asterisk (PJSIP com `transport` WSS), FreeSWITCH e Kamailio fazem isso. Uma central que só aceita SIP por UDP ou TCP não conecta direto: é preciso um gateway WebRTC na frente, como o Kamailio ou um Asterisk fazendo a ponte.'
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
                        'Ver o estado de tudo de relance e abrir Áudio, Importar / Exportar, Atualização e este Guia'
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
                    '**Registrar todas**: registra as contas que ainda não estão registradas. Útil depois de abrir o app ou de a rede voltar.',
                    '**Desregistrar todas**: tira todos os ramais do ar de uma vez, por exemplo antes de mexer na central.',
                    '**Áudio**: escolhe microfone e alto-falante.',
                    '**Importar / Exportar**: leva as contas para outra máquina.',
                    '**Atualização**: mostra a versão e procura uma nova.',
                    '**Guia**: abre esta tela. A tecla **F1** também abre.'
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
                text: 'As etiquetas à direita do nome dizem: um **número** é a quantidade de chamadas ativas da conta; **AA** é auto-atender ligado; **SIM** é conta do PBX simulado.'
            },
            { type: 'h', text: 'Ações de uma conta' },
            {
                type: 'p',
                text: 'Clique na conta para selecioná-la. Ela passa a ser a conta de origem do discador e mostra os botões:'
            },
            {
                type: 'list',
                items: [
                    '**Registrar / Desregistrar**: põe ou tira o ramal do ar.',
                    '**Editar**: abre o formulário. Se a conta estava registrada, ela é registrada de novo com os dados novos.',
                    '**Saúde**: roda as verificações da conta. Veja "Saúde e diagnóstico".',
                    '**Duplicar**: cria uma cópia, para cadastrar vários ramais parecidos sem redigitar tudo.',
                    '**Excluir**: pede confirmação e apaga a conta e a senha guardada.',
                    '**Por que falhou?**: aparece quando a conta está em erro e pede a explicação à IA. Veja "Ajuda da IA".'
                ]
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
                        'WebSocket (WSS)',
                        'O endereço do WebSocket da central, por exemplo `wss://pbx.empresa.com:8089/ws`'
                    ]
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
                    '**Ir para o fim**: aparece quando você rola para cima; volta a acompanhar as linhas novas.'
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
                text: 'Selecione a conta e clique em **Saúde**. A Íris confere, na ordem:'
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
            }
        ]
    },
    {
        id: 'audio',
        title: 'Áudio',
        summary: 'Escolher microfone e alto-falante e conferir se os dois funcionam.',
        blocks: [
            { type: 'image', name: 'audio', alt: 'Janela de áudio com microfone, medidor e alto-falante' },
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
                text: 'No macOS e no Windows, o sistema pede permissão de microfone na primeira vez. Se você negou, libere nas configurações de privacidade do sistema e abra a janela de Áudio de novo.'
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
                    ['Verificar', 'Confere um código SIP, o DTMF recebido ou um texto no log']
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
                    ['--relatorio <arquivo>', 'Salva o relatório em `.json` ou `.txt`'],
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
                text: 'Códigos de saída: **0** tudo passou, **1** algum passo falhou, **2** erro de uso ou de configuração. Os nomes em inglês também valem (`--scenario`, `--all`, `--runs`, `--report`, `--accounts`, `--scenarios`, `--trust-host`, `--fake-media`, `--help`).'
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
            { type: 'image', name: 'importar', alt: 'Janela de importar e exportar contas' },
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
                text: 'Lê um arquivo exportado pela Íris. Contas com o mesmo id são substituídas; as outras são adicionadas. Depois de importar, use **Registrar todas** para pôr as contas novas no ar.'
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
                text: 'A chave fica no cofre de senhas do sistema, não aparece de novo na tela e não entra em exportações. **Remover chave** apaga.'
            }
        ]
    },
    {
        id: 'atualizacao',
        title: 'Atualização',
        summary: 'Como a Íris procura, baixa e instala versões novas.',
        blocks: [
            { type: 'image', name: 'atualizacao', alt: 'Janela de atualização' },
            {
                type: 'list',
                items: [
                    'O app instalado procura versão nova pouco depois de abrir e quando você abre a janela **Atualização**.',
                    '**Nada é baixado sozinho.** Quando há versão nova, o botão da barra vira "Atualização disponível" e você decide clicar em **Baixar**.',
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
                    ['macOS', 'Ainda não instala sozinha, porque o app não é assinado. Baixe o `.dmg` novo']
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
                    '**Sair** encerra o app de verdade: os ramais saem do ar e as chamadas caem.',
                    'Uma **chamada recebida** gera uma notificação do sistema; clicar nela abre a janela.'
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
                        'No cofre de senhas do sistema (Chaves no macOS, DPAPI no Windows, libsecret no Linux)'
                    ],
                    ['Cenários', '`scenarios.json`'],
                    ['Preferências', '`settings.json`: áudio, canal de atualização, hosts confiáveis, opções da IA'],
                    ['Log', 'Só na memória, até o app fechar ou você salvar']
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
                    'Não grava senha em arquivo em texto puro. Se o sistema não tiver cofre, a senha fica só na memória e é pedida de novo ao reabrir.',
                    'Não põe senha, hash nem nonce no log, nem na tela nem nos arquivos salvos.',
                    'Não manda nada para fora além do que você pede: o registro e as chamadas com a sua central, a busca por atualização no GitHub e, se você usar, o texto da prévia para a OpenRouter.',
                    'Não aceita certificado inválido sem você mandar, e só para o host escolhido.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'No macOS, enquanto o app não for assinado, o sistema pode pedir a senha de login para liberar as Chaves depois de uma atualização. Digite e escolha **Permitir Sempre**. A Íris mostra um aviso enquanto espera.'
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
                        'Rode Saúde. Cadastre um TURN em Avançado. Confira a janela de Áudio'
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
                        'O sistema está pedindo a senha do cofre',
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
