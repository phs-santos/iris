# Revisão de segurança (M4)

Revisão de 03/10/2026, sobre o checklist de segurança do Electron e os RNF-07 a RNF-10 e RNF-20. Os itens marcados com teste rodam no CI.

| Item | Situação | Onde |
| --- | --- | --- |
| Interface isolada: `contextIsolation`, sem `nodeIntegration`, `sandbox` ligado (RNF-08) | ok | `src/main/index.ts`, `src/main/cli.ts` |
| CSP restrita: só código local; WebSocket para os PBX | ok | `src/renderer/index.html` |
| A janela não navega para fora nem abre janelas; links `https` vão para o navegador | ok | `will-navigate`, `setWindowOpenHandler` |
| `ELECTRON_RENDERER_URL` ignorada no app empacotado (antes carregaria qualquer URL com acesso ao preload) | corrigido | `src/main/ipc-guard.ts` |
| IPC só aceita mensagens da própria interface (confere o frame remetente) | corrigido | `handle`/`on` em `src/main/ipc-guard.ts` |
| Argumentos do IPC conferidos antes de gravar em disco (tipos, tamanhos, ids) | corrigido | `registerIpc` |
| Salvar arquivo: a interface sugere só o nome; a pasta é sempre escolhida no diálogo | corrigido | `files:save-text` |
| Permissões: só microfone (sem câmera), saída de áudio e notificações | ok | `setupSecurity` |
| Certificado inválido recusado; exceção só por host, escolhida pelo usuário (RNF-09, RF-37) | ok, com teste | `certificate-error`, `test:pbx` |
| Senhas em arquivo local cifrado com AES-256-GCM (`senhas.json` + `chave-local.bin`, permissão 0600), sem o cofre do sistema, por decisão do usuário em 04/10/2026 (RNF-07) | ok | `src/main/storage.ts` |
| Linha de comando com `--contas`: pasta de dados temporária e senhas só em memória | ok, com teste | `src/main/cli.ts`, `test:cli` |
| Log na tela e exportado (.txt/.json) sem Authorization, hash, nonce nem senha (RNF-10) | ok, com teste | `test:pbx` |
| Exportação de contas sem senha por padrão (RNF-10) | ok, com teste | `tests/privacy.test.ts` |
| Nada de `v-html`, `innerHTML` ou `eval` na interface; o SIP recebido é mostrado como texto | ok | busca no código |
| Fuses do Electron: sem `RunAsNode`, sem `NODE_OPTIONS`, sem `--inspect`, só carrega do asar, com verificação de integridade | corrigido | `electron-builder.yml` |
| Atualização automática (RF-35): só por HTTPS no GitHub Releases, com o sha512 de cada arquivo conferido e a verificação de assinatura do electron-updater mantida; nada é baixado sem o usuário pedir; não roda na linha de comando; o canal vem por IPC conferido | ok, com teste da lógica | `src/main/updater.ts`, `tests/updater.test.ts` |
| Ajuda da IA (RF-38): a chamada à OpenRouter sai do processo principal, por HTTPS, sem afrouxar a CSP da interface; a chave fica no arquivo de senhas e os canais de senha recusam o id dela, então a interface não a lê; o texto passa por uma segunda remoção de credenciais antes de sair; máscara de dados ligada por padrão; a resposta é mostrada como texto | ok, com teste | `src/main/ai.ts`, `src/shared/ai.ts`, `test:ai`, `tests/ai.test.ts` |
| Licenças das bibliotecas empacotadas (RNF-20) | ok, com verificação | `npm run licenses` |
| `npm audit` | 0 vulnerabilidades | — |

## Pendências

- Senhas fora do cofre do sistema (RNF-07, decisão de 04/10/2026): a chave da cifra fica na mesma pasta das senhas. Isso evita expor as senhas ao abrir ou copiar só `senhas.json`, mas quem copiar a pasta de dados inteira (backup, pasta sincronizada) consegue ler as senhas dos ramais e a chave da OpenRouter.
- Ajuda da IA: com a máscara ligada, o que o app não reconhece como ramal, número, IP, domínio ou nome de conta (um texto livre num cabeçalho SIP, por exemplo) sai como está. A prévia mostra o texto exato antes do envio, e é o usuário quem confirma.
- `IRIS_AI_URL` troca o endereço da OpenRouter para os testes e é ignorada no app empacotado.
- Atualização automática sem assinatura: no Windows, enquanto o instalador não for assinado, a atualização é conferida só pelo sha512 publicado no release, sem a assinatura do editor. No macOS ela não instala sem o Developer ID. As duas dependem do RNF-17.
- No Windows 11 com o Controle Inteligente de Aplicativos ligado, o instalador sem assinatura é bloqueado sem opção de liberar (visto em 03/10/2026 com o 1.0.2). Só a assinatura resolve.
- Instaladores assinados e notarizados (RNF-17): precisam do Apple Developer ID e de um certificado de assinatura para Windows. Até lá, o macOS recebe assinatura ad-hoc (`resetAdHocDarwinSignature`), que roda na máquina onde foi gerado, mas o Gatekeeper avisa nas outras.
- `grantFileProtocolExtraPrivileges` continua ligado: a interface carrega módulos ES por `file://`. Para desligar, seria preciso servir a interface por um protocolo próprio (`app://`).
- O DTMF por RTP no Docker Desktop do macOS perde pacotes de vez em quando (ambiente de teste, não o app); no CI Linux o Asterisk usa a rede do host.
