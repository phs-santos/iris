// Ponte entre a interface e o motor SIP próprio (RF-39). Os sockets UDP, TCP e TLS só existem no
// processo principal; a interface fala com eles por estes canais fixos, com os argumentos conferidos
// (RNF-08). Cada motor da interface tem um id; os eventos voltam marcados com ele.

import { app, type WebContents } from 'electron'
import {
    IPC,
    type NativeSipConfig,
    type NativeSipEvent,
    type NativeSipEventBody,
    type NativeSipHealth
} from '@shared/types'
import { isSipTransportKind, parseSipServer } from '@shared/sip-target'
import { check, handle, isPlainObject, isString } from './ipc-guard'
import { createTransport } from './sip/transport'
import { SipUserAgent } from './sip/user-agent'

interface Options {
    /** Hosts cujo certificado inválido o usuário aceitou (RF-37). */
    isTrustedHost(host: string): boolean
    onCertificateError(host: string, error: string): void
}

const agents = new Map<string, SipUserAgent>()
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
        isOptionalText(v.displayName, 120)
    )
}

const isEngineId = (v: unknown): v is string => isString(v, 100) && /^[\w:-]+$/.test(v)

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
                userAgent: `Iris/${app.getVersion()}`
            },
            createTransport,
            {
                status: (status) => send(sender, engineId, { type: 'status', status }),
                log: (level, kind, text) => send(sender, engineId, { type: 'log', level, kind, text }),
                certificate: (host, error) => options.onCertificateError(host, error)
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
