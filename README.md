# Íris

Na mitologia grega, Íris é a mensageira dos deuses, que leva recados entre o céu e a terra pelo arco-íris. Esta Íris leva chamadas entre várias contas e vários PBX ao mesmo tempo.

Softphone desktop para testar telefonia: registra várias contas de vários PBX ao mesmo tempo, liga entre elas e mostra o SIP de cada uma na mesma janela. Feito com Electron, Vue 3 e [easy-sipjs](https://www.npmjs.com/package/easy-sipjs).

A especificação completa (requisitos, arquitetura e plano de entrega) está no documento do projeto.

## Estado atual

Marcos **M0 (fundação)**, **M1 (MVP)**, **M2 (diagnóstico e transferência)** e **M3 (cenários)** concluídos:

| Requisito | O que já funciona |
| --- | --- |
| RF-01, 02, 03, 04 | Cadastro de contas, agrupamento por PBX, registrar uma ou todas, estado com código SIP do erro |
| RF-05, 06 | Testar conexão antes de salvar; registrar ao abrir o app |
| RF-07 | Importar e exportar contas em JSON, sem senhas por padrão |
| RF-08 | Reconexão e renovação de registro (do easy-sipjs) |
| RF-09 a RF-14 | Discar, receber, auto-atender, várias chamadas, mudo, espera, DTMF com sequência e pausas |
| RF-15, 16, 17, 18 | Transferência cega e assistida (consulta, concluir ou voltar) com progresso; cabeçalhos SIP extras no INVITE |
| RF-19 | Escolha de microfone e alto-falante, com medidor e som de teste, aplicada também às chamadas em andamento |
| RF-21, 22, 23 | Log por conta com filtros, aba de SIP bruto sem senhas, copiar e salvar .txt/.json |
| RF-24, 25, 26 | Saúde da conta, diagnóstico de microfone e TURN, qualidade da chamada |
| RF-28, 29, 30 | Cenários: editor de passos (registrar, discar, atender, esperar, aguardar estado, DTMF, transferir, desligar, verificar), resultado de cada passo com tempo, repetição N vezes com relatório .txt/.json |
| RF-32, 33, 37 | Modo simulado, ícone na bandeja, aceite de certificado autoassinado por host |

Ainda não: cenários pela linha de comando (RF-31), atualização automática (RF-35).

## Rodar

Requer Node.js 22.

```bash
npm install
npm run dev
```

No primeiro uso o app cria três contas no **PBX simulado** (senha `1234`), então dá para explorar sem servidor. No simulado, `8000` é uma URA, `486` dá ocupado, `408` não atende e qualquer ramal de outra conta simulada do mesmo domínio toca nela.

## Cenários

Na aba **Cenários** (ao lado de **Telefone**) você monta um roteiro de passos e a Íris executa sozinha, marcando cada passo como passou ou falhou, com o tempo. **+ Exemplo de URA** cria um pronto: registrar, discar `8000`, aguardar "em chamada", esperar 1 s, mandar `1234` e desligar.

- Cada chamada aberta por **Discar** ou **Atender** ganha um apelido (`c1`); os passos seguintes usam esse apelido.
- **Aguardar estado** falha se a chamada terminar antes, mostrando o código (ex.: `486 Busy Here`).
- **Verificar** confere um código SIP, o DTMF recebido ou um texto no log.
- **Repetir N×** roda em sequência e mostra a taxa de sucesso, a média e o p95; o relatório sai em `.txt` ou `.json`.
- Os cenários ficam em `scenarios.json` na pasta de dados e são salvos a cada edição.

## PBX de teste (Asterisk)

```bash
./docker/asterisk/gen-cert.sh   # certificado autoassinado para o WSS
docker compose up -d            # Linux
docker compose -f docker-compose.yml -f docker/compose.ports.yml up -d   # macOS e Windows
```

No Docker Desktop (macOS e Windows) a rede do host não fica exposta, então o `docker/compose.ports.yml` mapeia as portas do WSS e do RTP e faz o ICE anunciar `127.0.0.1`.

Cadastre contas com domínio `127.0.0.1`, WebSocket `wss://127.0.0.1:8089/ws`, ramais `1001` a `1020` e senha `1234`. Na primeira conexão o app recusa o certificado e oferece **Confiar neste host**.

Números do plano de discagem: `1001`–`1020` (ramais), `8000` (URA que lê 4 dígitos), `600` (eco), `486` (ocupado).

## Testes

```bash
npm run typecheck   # TypeScript estrito
npm test            # testes de unidade (Vitest)
npm run test:e2e    # ponta a ponta no modo simulado (abre o app)
npm run test:scenarios   # cenários: executa, força falha, repete 20× e exporta relatório
npm run test:pbx    # integração com o Asterisk do docker compose
npm run test:load   # carga: 20 contas e 4 chamadas no Asterisk, mede a resposta da interface
```

Em Linux sem tela, rode os de ponta a ponta com `xvfb-run -a`. Com `PBX_WS=wss://127.0.0.1:8089/ws`, o teste de cenários roda a URA do Asterisk de teste.

## Gerar instaladores

```bash
npm run dist:linux   # AppImage
npm run dist:win     # instalador NSIS (rodar no Windows)
npm run dist:mac     # .dmg (rodar no macOS)
```

Os instaladores ainda não são assinados (RNF-17 fica para o M4).

## Estrutura

```
src/main/       processo principal: janela, bandeja, arquivos, senhas, certificados
src/preload/    ponte com canais fixos de IPC (window.iris)
src/shared/     tipos usados pelos três processos
src/renderer/   interface Vue
  sip/          interface SipEngine, motor easy-sipjs e motor simulado
  stores/       estado de contas, chamadas e log (Pinia)
  components/   telas
tests/          unidade (Vitest) e ponta a ponta (Playwright)
docker/         Asterisk de teste
patches/        correção aplicada ao easy-sipjs no npm install
build/          ícone do app: icon.svg (fonte) e icon.png 1024 px, usado pelo electron-builder
resources/      icon.png 512 px para a janela e o Dock em dev
```

## Correção no easy-sipjs

O easy-sipjs 2.7.6 registra com `transport=wss` no Contact. O Asterisk responde o 200 OK com `transport=ws`, e o SIP.js descarta a resposta ("No Contact header pointing to us"), então a conta nunca fica registrada. O arquivo `patches/easy-sipjs+2.7.6.patch` troca para `transport=ws`, que é o padrão do SIP.js, e é aplicado automaticamente por `scripts/apply-patches.mjs` depois do `npm install` (o `patch-package` saiu porque depende do braces, que tem vulnerabilidade sem correção). Vale abrir uma issue no repositório da biblioteca.

## Dados e segurança

- Contas em `accounts.json` e preferências em `settings.json`, na pasta de dados do usuário.
- Senhas criptografadas pelo sistema (Keychain, DPAPI ou libsecret). Sem criptografia disponível, ficam só na memória.
- A interface roda isolada (`contextIsolation`, `sandbox`, CSP) e só fala com o sistema pelos canais de `src/preload`.
