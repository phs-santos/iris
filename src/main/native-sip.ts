// Ponte entre a interface e o motor SIP próprio (RF-39). Os sockets UDP, TCP e TLS só existem no
// processo principal; a interface fala com eles por estes canais fixos, com os argumentos conferidos
// (RNF-08). Cada motor da interface tem um id; os eventos voltam marcados com ele.

import { MESSAGE_MAX_BYTES, messageBytes } from '@shared/messages'
import { app, type WebContents } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SAMPLE_RATE } from '@shared/audio'
import { WavRecorder } from './sip/recorder'
import {
    IPC,
    type NativeCallAction,
    type NativeCallEvent,
    type NativeCallStats,
    type NativeSipConfig,
    type NativeSipEvent,
    type NativeSipEventBody,
    type NativeSipHealth,
    type SipManualRequest,
    type SipManualResponse,
    MANUAL_METHODS
} from '@shared/types'
import { isSipTransportKind, parseSipServer } from '@shared/sip-target'
import { check, handle, isPlainObject, isString, on } from './ipc-guard'
import type { CallEvents, SipCall } from './sip/call'
import { createTransport } from './sip/transport'
import { SipUserAgent } from './sip/user-agent'
import { serializeMessage } from './sip/message'
import { AUDIO_THRESHOLD_DB, toneSamples } from '@shared/audio'
import {
    buildLoadReport,
    isLoadSpec,
    type LoadCallResult,
    type LoadProgress,
    type LoadReport,
    type LoadSpec
} from '@shared/load'

interface Options {
    /** Hosts cujo certificado inválido o usuário aceitou (RF-37). */
    isTrustedHost(host: string): boolean
    onCertificateError(host: string, error: string): void
    /** Pergunta onde salvar e grava; devolve o caminho, ou null se o usuário cancelou. */
    saveFile(defaultName: string, data: Buffer): Promise<string | null>
}

const agents = new Map<string, SipUserAgent>()
/** Chamadas em andamento, por motor e id da chamada. */
const calls = new Map<string, SipCall>()
const callKey = (engineId: string, callId: string): string => `${engineId}|${callId}`
/** Testes de carga em andamento (RF-42), por motor: chamar a função encerra as chamadas e fecha o relatório. */
const loads = new Map<string, () => void>()
/** Gravações em andamento (RF-36), pela mesma chave das chamadas. */
const recorders = new Map<string, WavRecorder>()
/** Um áudio tocado numa chamada tem no máximo 2 minutos. */
const MAX_PLAY_SAMPLES = SAMPLE_RATE * 120

function stopRecording(key: string): void {
    const recorder = recorders.get(key)
    if (!recorder) return
    recorders.delete(key)
    const call = calls.get(key)
    if (call) call.tap = undefined
    recorder.finish()
}
const MAX_AGENTS = 200
const PING_TIMEOUT_MS = 5000

/** Sem espaço, quebra de linha, aspas nem <>: o valor entra direto num cabeçalho SIP. */
const isSipUser = (v: unknown): v is string => isString(v, 100) && /^[A-Za-z0-9_.!~*'()&=+$,;?/%-]+$/.test(v)
const isOptionalText = (v: unknown, max: number): v is string | undefined =>
    v === undefined || (isString(v, max) && !/[\r\n\0]/.test(v))

function isConfig(v: unknown): v is NativeSipConfig {
    if (!isPlainObject(v)) return false
    return (
        isSipUser(v.user) &&
        isSipTransportKind(v.transport) &&
        isString(v.domain, 255) &&
        parseSipServer('', v.domain, v.transport) !== null &&
        isOptionalText(v.server, 255) &&
        parseSipServer(v.server as string | undefined, v.domain, v.transport) !== null &&
        (v.authUser === undefined || v.authUser === '' || isSipUser(v.authUser)) &&
        isOptionalText(v.displayName, 120) &&
        (v.srtp === undefined || typeof v.srtp === 'boolean') &&
        (v.blf === undefined || (Array.isArray(v.blf) && v.blf.length <= 50 && v.blf.every(isSipUser)))
    )
}

const isEngineId = (v: unknown): v is string => isString(v, 100) && /^[\w:-]+$/.test(v)
const isCallId = (v: unknown): v is string => isString(v, 200) && v.length > 0

/** Cabeçalhos que só o motor escreve: um cabeçalho extra não pode trocar a rota nem a identidade. */
const RESERVED =
    /^(via|from|to|call-id|cseq|contact|route|record-route|max-forwards|content-length|content-type|authorization|proxy-authorization|[vftimlck])$/i
const isExtraHeader = (v: unknown): v is string => {
    if (!isString(v, 500) || /[\r\n\0]/.test(v)) return false
    const name = v.slice(0, v.indexOf(':')).trim()
    return v.includes(':') && /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name) && !RESERVED.test(name)
}
const DTMF_MODES = ['auto', 'sip-info', 'rtp-event']

function isCallAction(v: unknown): v is NativeCallAction {
    if (!isPlainObject(v)) return false
    if (v.type === 'answer' || v.type === 'reject' || v.type === 'hangup') return true
    if (v.type === 'mute') return typeof v.muted === 'boolean'
    if (v.type === 'hold') return typeof v.held === 'boolean'
    if (v.type === 'transfer') return isSipUser(v.target)
    if (v.type === 'attended') return isCallId(v.consultCallId)
    if (v.type === 'play') return v.pcm instanceof Int16Array && v.pcm.length > 0 && v.pcm.length <= MAX_PLAY_SAMPLES
    return (
        v.type === 'dtmf' &&
        isString(v.tone, 1) &&
        /^[0-9*#A-Da-d]$/.test(v.tone) &&
        DTMF_MODES.includes(v.mode as string)
    )
}

export function registerNativeSipIpc(options: Options): void {
    const send = (sender: WebContents, engineId: string, body: NativeSipEventBody): void => {
        const event: NativeSipEvent = { engineId, ...body }
        if (!sender.isDestroyed()) sender.send(IPC.sipEvent, event)
    }

    handle(IPC.sipStart, async (event, engineId: string, config: NativeSipConfig, password: string) => {
        check(isEngineId(engineId) && isConfig(config) && isString(password, 1000), 'conta SIP')
        check(agents.has(engineId) || agents.size < MAX_AGENTS, 'limite de contas SIP')
        await agents.get(engineId)?.stop()
        const target = parseSipServer(config.server, config.domain, config.transport)!
        const sender = event.sender
        const agent = new SipUserAgent(
            {
                user: config.user,
                domain: config.domain.trim(),
                authUser: config.authUser || undefined,
                displayName: config.displayName || undefined,
                password,
                transport: config.transport,
                host: target.host,
                port: target.port,
                trusted: options.isTrustedHost(target.host),
                srtp: config.srtp,
                blf: config.blf,
                userAgent: `Iris/${app.getVersion()}`
            },
            createTransport,
            {
                status: (status) => send(sender, engineId, { type: 'status', status }),
                log: (level, kind, text) => send(sender, engineId, { type: 'log', level, kind, text }),
                certificate: (host, error) => options.onCertificateError(host, error),
                presence: (extension, state) => send(sender, engineId, { type: 'presence', extension, state }),
                mwi: (info) => send(sender, engineId, { type: 'mwi', info }),
                message: (from, fromName, text) =>
                    send(sender, engineId, { type: 'message', from, fromName, text: text.slice(0, 4000) }),
                incoming: (call) => {
                    calls.set(callKey(engineId, call.callId), call)
                    send(sender, engineId, {
                        type: 'call',
                        callId: call.callId,
                        event: { kind: 'incoming', remote: call.remote, remoteName: call.remoteName }
                    })
                    return callEvents(sender, engineId, call.callId)
                }
            }
        )
        agents.set(engineId, agent)
        // A janela recarregada ou fechada de vez não deixa registros para trás.
        sender.once('destroyed', () => void stop(engineId, agent))
        // Sem esperar: o resultado chega pelos eventos de estado.
        void agent.start()
    })

    handle(IPC.sipStop, async (_e, engineId: string) => {
        check(isEngineId(engineId), 'id do motor SIP')
        const agent = agents.get(engineId)
        if (agent) await stop(engineId, agent)
    })

    /** Leva os eventos de uma chamada para a interface e tira a chamada da lista quando ela termina. */
    const callEvents = (sender: WebContents, engineId: string, callId: string): CallEvents => {
        const emit = (event: NativeCallEvent): void => send(sender, engineId, { type: 'call', callId, event })
        return {
            progress: (code, reason, earlyMedia) => emit({ kind: 'progress', code, reason, earlyMedia }),
            established: () => emit({ kind: 'established' }),
            ended: (end) => {
                stopRecording(callKey(engineId, callId))
                calls.delete(callKey(engineId, callId))
                emit({ kind: 'ended', ...end })
            },
            hold: (held, by) => emit({ kind: 'hold', held, by }),
            transfer: (code, reason, final) => emit({ kind: 'transfer', code, reason, final }),
            dtmf: (tone) => emit({ kind: 'dtmf', tone }),
            // Para a interface vai o áudio a 16 kHz, que é a taxa do alto-falante.
            audio: (_pcm, wide) => send(sender, engineId, { type: 'audio', callId, pcm: wide })
        }
    }

    handle(IPC.sipDial, (event, engineId: string, destination: string, headers?: string[]): string => {
        check(
            isEngineId(engineId) &&
                isSipUser(destination) &&
                (headers === undefined ||
                    (Array.isArray(headers) && headers.length <= 20 && headers.every(isExtraHeader))),
            'chamada SIP'
        )
        const agent = agents.get(engineId)
        if (!agent) throw new Error('Registre a conta antes de ligar')
        // O id nasce aqui para os eventos já saírem com ele, antes de a interface receber a resposta.
        let callId = ''
        const call = agent.dial(
            destination,
            {
                progress: (...args) => callEvents(event.sender, engineId, callId).progress(...args),
                established: () => callEvents(event.sender, engineId, callId).established(),
                ended: (end) => callEvents(event.sender, engineId, callId).ended(end),
                hold: (held, by) => callEvents(event.sender, engineId, callId).hold(held, by),
                transfer: (...args) => callEvents(event.sender, engineId, callId).transfer(...args),
                dtmf: (tone) => callEvents(event.sender, engineId, callId).dtmf(tone),
                audio: (pcm, wide) => callEvents(event.sender, engineId, callId).audio(pcm, wide)
            },
            headers ?? []
        )
        callId = call.callId
        if (!call.ended) calls.set(callKey(engineId, callId), call)
        return callId
    })

    handle(IPC.sipCallAction, async (_e, engineId: string, callId: string, action: NativeCallAction) => {
        check(isEngineId(engineId) && isCallId(callId) && isCallAction(action), 'ação da chamada')
        const call = calls.get(callKey(engineId, callId))
        if (!call) return
        if (action.type === 'answer') await call.answer()
        else if (action.type === 'reject') call.reject()
        else if (action.type === 'hangup') await call.hangup()
        else if (action.type === 'mute') call.setMuted(action.muted)
        else if (action.type === 'hold') await call.setHeld(action.held)
        else if (action.type === 'transfer') await call.transfer(action.target)
        else if (action.type === 'play') await call.play(action.pcm)
        else if (action.type === 'attended') {
            const consult = calls.get(callKey(engineId, action.consultCallId))
            if (!consult) throw new Error('A chamada de consulta não existe mais')
            await call.attendedTransfer(consult)
        } else await call.sendDtmf(action.tone.toUpperCase(), action.mode)
    })

    handle(IPC.sipCallStats, (_e, engineId: string, callId: string): NativeCallStats | null => {
        check(isEngineId(engineId) && isCallId(callId), 'chamada SIP')
        return calls.get(callKey(engineId, callId))?.stats() ?? null
    })

    handle(IPC.sipCallLevel, (_e, engineId: string, callId: string): number | null => {
        check(isEngineId(engineId) && isCallId(callId), 'chamada SIP')
        return calls.get(callKey(engineId, callId))?.receivedLevel() ?? null
    })

    handle(IPC.sipRecord, (_e, engineId: string, callId: string, on: boolean): string | null => {
        check(isEngineId(engineId) && isCallId(callId) && typeof on === 'boolean', 'gravação')
        const key = callKey(engineId, callId)
        const call = calls.get(key)
        if (!call) return null
        const current = recorders.get(key)
        if (!on) {
            stopRecording(key)
            return current?.path ?? null
        }
        if (current) return current.path
        // A pasta e o nome são daqui: a interface só liga e desliga.
        const dir = join(app.getPath('userData'), 'gravacoes')
        mkdirSync(dir, { recursive: true })
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        const safe = (text: string): string => text.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 40)
        const recorder = new WavRecorder(join(dir, `iris-${stamp}-${safe(call.remote)}-${recorders.size + 1}.wav`))
        recorders.set(key, recorder)
        call.tap = (side, pcm) => recorder.push(side, pcm)
        return recorder.path
    })

    handle(IPC.sipRequest, async (_e, engineId: string, spec: SipManualRequest): Promise<SipManualResponse> => {
        check(
            isEngineId(engineId) &&
                isPlainObject(spec) &&
                (MANUAL_METHODS as readonly string[]).includes(spec.method as string) &&
                isString(spec.uri, 300) &&
                /^sips?:[^\s<>"]+$/i.test(spec.uri) &&
                Array.isArray(spec.headers) &&
                spec.headers.length <= 20 &&
                spec.headers.every(isExtraHeader) &&
                (spec.body === undefined || (isString(spec.body, 20_000) && !spec.body.includes('\0'))) &&
                (spec.contentType === undefined ||
                    (isString(spec.contentType, 100) && /^[\w.+-]+\/[\w.+-]+$/.test(spec.contentType))),
            'pedido SIP'
        )
        const agent = agents.get(engineId)
        if (!agent?.connected) throw new Error('Registre a conta antes de mandar um pedido')
        const { response, ms } = await agent.sendRequest({
            method: spec.method,
            uri: spec.uri,
            headers: spec.headers.map((line): [string, string] => [
                line.slice(0, line.indexOf(':')).trim(),
                line.slice(line.indexOf(':') + 1).trim()
            ]),
            // O corpo do SIP usa CRLF; a tela manda as linhas como o usuário digitou.
            body: spec.body?.replace(/\r?\n/g, '\r\n'),
            contentType: spec.contentType
        })
        return {
            status: response.status,
            reason: response.reason,
            text: serializeMessage(response).replace(/\r\n/g, '\n'),
            ms
        }
    })

    // Mensagem de texto (RF-54): um MESSAGE para o ramal, no domínio da conta.
    handle(IPC.sipMessage, async (_e, engineId: string, to: string, text: string): Promise<void> => {
        check(
            isEngineId(engineId) &&
                isSipUser(to) &&
                isString(text, 4000) &&
                text.length > 0 &&
                !text.includes('\0') &&
                messageBytes(text) <= MESSAGE_MAX_BYTES,
            'mensagem de texto'
        )
        const agent = agents.get(engineId)
        if (!agent?.connected) throw new Error('Registre a conta antes de mandar mensagem')
        const { response } = await agent.sendRequest({
            method: 'MESSAGE',
            uri: `sip:${to}@${agent.domain}`,
            headers: [],
            body: text.replace(/\r?\n/g, '\r\n'),
            contentType: 'text/plain;charset=UTF-8'
        })
        if (response.status >= 300) throw new Error(`${response.status} ${response.reason}`)
    })

    handle(IPC.sipPcap, async (_e, engineId: string, withRtp: boolean): Promise<string | null> => {
        check(isEngineId(engineId) && typeof withRtp === 'boolean', 'captura')
        const agent = agents.get(engineId)
        if (!agent) throw new Error('Registre a conta para ter o que capturar')
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        return options.saveFile(`iris-${stamp}.pcap`, agent.capture.toPcap(withRtp))
    })

    // Teste de carga (RF-42): as chamadas nascem e morrem aqui, sem passar pela interface. Cada uma
    // toca um tom em laço, que é o que o eco do PBX devolve e o que as estatísticas medem.
    handle(IPC.sipLoadStart, (event, engineId: string, spec: LoadSpec): Promise<LoadReport> => {
        check(isEngineId(engineId) && isLoadSpec(spec), 'teste de carga')
        const agent = agents.get(engineId)
        if (!agent || agent.currentState !== 'registered') throw new Error('Registre a conta antes do teste de carga')
        if (loads.has(engineId)) throw new Error('Já há um teste de carga rodando nesta conta')
        const sender = event.sender
        const started = Date.now()
        const tone = toneSamples(440, 1000)
        const results: LoadCallResult[] = []
        const progress: LoadProgress = { started: 0, established: 0, finished: 0, total: spec.calls }
        const report = (): void => {
            if (!sender.isDestroyed()) sender.send(IPC.sipLoadProgress, engineId, { ...progress })
        }
        let stopped = false
        const hangups = new Set<() => void>()

        const one = (): Promise<void> =>
            new Promise<void>((done) => {
                const dialed = Date.now()
                const result: LoadCallResult = {
                    established: false,
                    packetsReceived: 0,
                    packetsLost: 0,
                    jitterMs: 0,
                    levelDb: -96
                }
                let timer: ReturnType<typeof setTimeout> | undefined
                const snapshot = (): void => {
                    const stats = call.stats()
                    result.packetsReceived = stats.packetsReceived
                    result.packetsLost = stats.packetsLost
                    result.jitterMs = stats.jitterMs
                    result.levelDb = call.receivedLevel(1000)
                }
                const call = agent.dial(spec.destination, {
                    progress: () => undefined,
                    established: () => {
                        result.established = true
                        result.setupMs = Date.now() - dialed
                        progress.established++
                        report()
                        const loop = (): void => {
                            if (!call.ended) void call.play(tone).then(loop, () => undefined)
                        }
                        loop()
                        timer = setTimeout(() => {
                            snapshot()
                            void call.hangup()
                        }, spec.seconds * 1000)
                    },
                    ended: (end) => {
                        clearTimeout(timer)
                        hangups.delete(hang)
                        if (!result.established) {
                            result.code = end.code
                            result.reason = end.reason
                        }
                        results.push(result)
                        progress.finished++
                        report()
                        done()
                    },
                    hold: () => undefined,
                    dtmf: () => undefined,
                    transfer: () => undefined,
                    audio: () => undefined
                })
                const hang = (): void => {
                    if (result.established) snapshot()
                    void call.hangup()
                }
                hangups.add(hang)
                progress.started++
                report()
            })

        return (async () => {
            loads.set(engineId, () => {
                stopped = true
                for (const hang of [...hangups]) hang()
            })
            try {
                const running: Promise<void>[] = []
                for (let i = 0; i < spec.calls && !stopped; i++) {
                    running.push(one())
                    if (spec.rampMs && i < spec.calls - 1) await new Promise((r) => setTimeout(r, spec.rampMs))
                }
                await Promise.all(running)
            } finally {
                loads.delete(engineId)
            }
            return buildLoadReport(spec, results, Date.now() - started, stopped, AUDIO_THRESHOLD_DB)
        })()
    })

    handle(IPC.sipLoadStop, (_e, engineId: string) => {
        check(isEngineId(engineId), 'id do motor SIP')
        loads.get(engineId)?.()
    })

    // 50 blocos por segundo por chamada, a 16 kHz: sem resposta e sem log, só confere o tamanho.
    on(IPC.sipAudio, (_e, engineId: unknown, callId: unknown, pcm: unknown) => {
        if (!isEngineId(engineId) || !isCallId(callId) || !(pcm instanceof Int16Array)) return
        if (pcm.length === 0 || pcm.length > 3840 || pcm.length % 2) return
        calls.get(callKey(engineId, callId))?.sendMic(pcm)
    })

    handle(IPC.sipHealth, async (_e, engineId: string): Promise<NativeSipHealth> => {
        check(isEngineId(engineId), 'id do motor SIP')
        const agent = agents.get(engineId)
        if (!agent) return { connected: false, registered: false, error: 'Conta não registrada' }
        const health: NativeSipHealth = { connected: agent.connected, registered: agent.currentState === 'registered' }
        if (!agent.connected) return { ...health, error: agent.error }
        try {
            health.latencyMs = await Promise.race([
                agent.ping(),
                new Promise<never>((_ok, fail) =>
                    setTimeout(() => fail(new Error('OPTIONS sem resposta em 5 s')), PING_TIMEOUT_MS)
                )
            ])
        } catch (error) {
            health.error = error instanceof Error ? error.message : String(error)
        }
        return health
    })

    // Ao sair, tenta desregistrar; se não der tempo, o registro vence sozinho no PBX.
    app.on('before-quit', () => {
        for (const [engineId, agent] of agents) void stop(engineId, agent)
    })
}

async function stop(engineId: string, agent: SipUserAgent): Promise<void> {
    if (agents.get(engineId) === agent) agents.delete(engineId)
    await agent.stop()
}
