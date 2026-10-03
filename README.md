# Íris

Na mitologia grega, Íris é a mensageira dos deuses, que leva recados entre o céu e a terra pelo arco-íris. Esta Íris leva chamadas entre várias contas e vários PBX ao mesmo tempo.

Softphone desktop para testar telefonia: registra várias contas de vários PBX ao mesmo tempo, liga entre elas e mostra o SIP de cada uma na mesma janela. Feito com Electron, Vue 3 e [easy-sipjs](https://www.npmjs.com/package/easy-sipjs).

A especificação completa (requisitos, arquitetura e plano de entrega) está no documento do projeto.

## Estado atual

Marco **M0 (fundação)** concluído, com boa parte do **M1 (MVP)** já funcionando:

| Requisito | O que já funciona |
| --- | --- |
| RF-01, 02, 03, 04 | Cadastro de contas, agrupamento por PBX, registrar uma ou todas, estado com código SIP do erro |
| RF-05, 06 | Testar conexão antes de salvar; registrar ao abrir o app |
| RF-07 | Importar e exportar contas em JSON, sem senhas por padrão |
| RF-08 | Reconexão e renovação de registro (do easy-sipjs) |
| RF-09 a RF-14 | Discar, receber, auto-atender, várias chamadas, mudo, espera, DTMF com sequência e pausas |
| RF-15, 17, 18 | Transferência cega com progresso; cabeçalhos SIP extras no INVITE |
| RF-21, 22, 23 | Log por conta com filtros, aba de SIP bruto sem senhas, copiar e salvar .txt/.json |
| RF-24, 25, 26 | Saúde da conta, diagnóstico de microfone e TURN, qualidade da chamada |
| RF-32, 33, 37 | Modo simulado, ícone na bandeja, aceite de certificado autoassinado por host |

Ainda não: transferência assistida (RF-16), escolha de microfone e alto-falante (RF-19), cenários (RF-28 a 31), atualização automática (RF-35).

## Rodar

Requer Node.js 22.

```bash
npm install
npm run dev
```

No primeiro uso o app cria três contas no **PBX simulado** (senha `1234`), então dá para explorar sem servidor. No simulado, `8000` é uma URA, `486` dá ocupado, `408` não atende e qualquer ramal de outra conta simulada do mesmo domínio toca nela.

## PBX de teste (Asterisk)

```bash
./docker/asterisk/gen-cert.sh   # certificado autoassinado para o WSS
docker compose up -d
```

Cadastre contas com domínio `127.0.0.1`, WebSocket `wss://127.0.0.1:8089/ws`, ramais `1001` a `1003` e senha `1234`. Na primeira conexão o app recusa o certificado e oferece **Confiar neste host**.

Números do plano de discagem: `1001`–`1003` (ramais), `8000` (URA que lê 4 dígitos), `600` (eco), `486` (ocupado).

## Testes

```bash
npm run typecheck   # TypeScript estrito
npm test            # testes de unidade (Vitest)
npm run test:e2e    # ponta a ponta no modo simulado (abre o app)
npm run test:pbx    # integração com o Asterisk do docker compose
```

Em Linux sem tela, rode os de ponta a ponta com `xvfb-run -a`.

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
```

## Correção no easy-sipjs

O easy-sipjs 2.7.6 registra com `transport=wss` no Contact. O Asterisk responde o 200 OK com `transport=ws`, e o SIP.js descarta a resposta ("No Contact header pointing to us"), então a conta nunca fica registrada. O arquivo `patches/easy-sipjs+2.7.6.patch` troca para `transport=ws`, que é o padrão do SIP.js, e é aplicado automaticamente por `scripts/apply-patches.mjs` depois do `npm install` (o `patch-package` saiu porque depende do braces, que tem vulnerabilidade sem correção). Vale abrir uma issue no repositório da biblioteca.

## Dados e segurança

- Contas em `accounts.json` e preferências em `settings.json`, na pasta de dados do usuário.
- Senhas criptografadas pelo sistema (Keychain, DPAPI ou libsecret). Sem criptografia disponível, ficam só na memória.
- A interface roda isolada (`contextIsolation`, `sandbox`, CSP) e só fala com o sistema pelos canais de `src/preload`.
