// Ponte entre a interface e o motor SIP próprio (RF-39). Os sockets UDP, TCP e TLS só existem no
// processo principal; a interface fala com eles por estes canais fixos, com os argumentos conferidos
// (RNF-08). Cada motor da interface tem um id; os eventos voltam marcados com ele.

import { app, type WebContents } from 'electron'
import {
    IPC,
    type NativeCallAction,
    type NativeCallEvent,
    type NativeCallStats,
    type NativeSipConfig,
    type NativeSipEvent,
    type NativeSipEventBody,
    type NativeSipHealth
} from '@shared/types'
import { isSipTransportKind, parseSipServer } from '@shared/sip-target'
import { check, handle, isPlainObject, isString, on } from './ipc-guard'
import type { CallEvents, SipCall } from './sip/call'
import { createTransport } from './sip/transport'
import { SipUserAgent } from './sip/user-agent'

interface Options {
    /** Hosts cujo certificado inválido o usuário aceitou (RF-37). */
    isTrustedHost(host: string): boolean
    onCertificateError(host: string, error: string): void
}

const agents = new Map<string, SipUserAgent>()
/** Chamadas em andamento, por motor e id da chamada. */
const calls = new Map<string, SipCall>()
const callKey = (engineId: string, callId: string): string => `${engineId}|${callId}`
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
        (v.srtp === undefined || typeof v.srtp === 'boolean')
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
                userAgent: `Iris/${app.getVersion()}`
            },
            createTransport,
            {
                status: (status) => send(sender, engineId, { type: 'status', status }),
                log: (level, kind, text) => send(sender, engineId, { type: 'log', level, kind, text }),
                certificate: (host, error) => options.onCertificateError(host, error),
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
                calls.delete(callKey(engineId, callId))
                emit({ kind: 'ended', ...end })
            },
            hold: (held, by) => emit({ kind: 'hold', held, by }),
            transfer: (code, reason, final) => emit({ kind: 'transfer', code, reason, final }),
            dtmf: (tone) => emit({ kind: 'dtmf', tone }),
            audio: (pcm) => send(sender, engineId, { type: 'audio', callId, pcm })
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
                audio: (pcm) => callEvents(event.sender, engineId, callId).audio(pcm)
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

    // 50 blocos por segundo por chamada: sem resposta e sem log, só confere o tamanho.
    on(IPC.sipAudio, (_e, engineId: unknown, callId: unknown, pcm: unknown) => {
        if (!isEngineId(engineId) || !isCallId(callId) || !(pcm instanceof Int16Array) || pcm.length > 1920) return
        calls.get(callKey(engineId, callId))?.sendPcm(pcm)
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
