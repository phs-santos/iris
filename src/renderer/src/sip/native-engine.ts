import type { Account, NativeSipEvent } from '@shared/types'
import type { SipTransportKind } from '@shared/sip-target'
import { Emitter } from '@renderer/lib/emitter'
import type { DialOptions, EngineCall, EngineEvents, HealthReport, SipEngine } from './engine'

let nextEngine = 1

/**
 * Motor próprio da Íris para SIP puro por UDP, TCP ou TLS (RF-39). Os sockets ficam no processo
 * principal; aqui só passam os comandos e voltam os eventos. Nesta entrega a conta registra e mede a
 * saúde; as chamadas chegam com a mídia RTP, na entrega seguinte.
 */
export class NativeSipEngine implements SipEngine {
    private emitter = new Emitter<EngineEvents>()
    private readonly id: string
    private off?: () => void

    constructor(
        private account: Account,
        private password: string
    ) {
        this.id = `${account.id}:${nextEngine++}`
    }

    on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void {
        return this.emitter.on(event, listener)
    }

    async connect(): Promise<void> {
        const { account } = this
        this.off?.()
        this.off = window.iris.sip.onEvent((event: NativeSipEvent) => {
            if (event.engineId !== this.id) return
            if (event.type === 'status') this.emitter.emit('status', event.status)
            // Sem "Mostrar SIP bruto no log", ficam só os eventos.
            else if (event.kind !== 'sip' || account.rawSipLog)
                this.emitter.emit('log', { level: event.level, kind: event.kind, text: event.text })
        })
        try {
            await window.iris.sip.start(
                this.id,
                {
                    user: account.extension.trim(),
                    domain: account.domain.trim(),
                    authUser: account.authUsername?.trim() || undefined,
                    displayName: account.displayName?.trim() || undefined,
                    transport: account.transport as SipTransportKind,
                    server: account.sipServer?.trim() || undefined
                },
                this.password
            )
        } catch (error) {
            this.emitter.emit('status', { state: 'error', reason: (error as Error).message, final: true })
        }
    }

    async disconnect(): Promise<void> {
        await window.iris.sip.stop(this.id)
        this.emitter.emit('status', { state: 'disconnected' })
    }

    async dial(_destination: string, _options?: DialOptions): Promise<EngineCall> {
        throw new Error('Contas por SIP puro ainda só registram; as chamadas chegam na próxima entrega')
    }

    async health(): Promise<HealthReport> {
        const h = await window.iris.sip.health(this.id)
        return {
            websocketConnected: h.connected,
            registered: h.registered,
            latencyMs: h.latencyMs,
            error: h.error,
            checkedAt: new Date()
        }
    }

    async dispose(): Promise<void> {
        this.off?.()
        this.off = undefined
        await window.iris.sip.stop(this.id).catch(() => undefined)
        this.emitter.clear()
    }
}
