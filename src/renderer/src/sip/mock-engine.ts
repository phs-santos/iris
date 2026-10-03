// Motor simulado (RF-32): imita um PBX sem rede. Contas simuladas do mesmo domínio
// ligam umas para as outras; alguns números especiais simulam respostas do PBX.

import type { Account, DtmfMode } from '@shared/types'
import { Emitter } from '@renderer/lib/emitter'
import type {
  CallEnd,
  CallEvents,
  CallQuality,
  EngineCall,
  EngineEvents,
  HealthReport,
  LogLevel,
  LogKind,
  RegStatus,
  SipEngine
} from './engine'

/** Números especiais do PBX simulado, mostrados na ajuda do discador. */
export const MOCK_NUMBERS = [
  { number: '8000', description: 'URA: atende com early media e registra o DTMF recebido' },
  { number: '486', description: 'Ocupado (486 Busy Here)' },
  { number: '408', description: 'Ninguém atende (408 Request Timeout após 5 s)' },
  { number: 'outro', description: 'Ramal de outra conta simulada do mesmo domínio, ou 404 Not Found' }
]

export const MOCK_TIMING = {
  register: 250,
  trying: 80,
  ringing: 150,
  ivrAnswer: 1200,
  timeout: 5000,
  noAnswer: 30000
}

const registry = new Set<MockEngine>()

/** Remove todas as contas registradas no PBX simulado. Usado nos testes. */
export function resetMockNetwork(): void {
  registry.clear()
}

let nextId = 1

class MockCall implements EngineCall {
  readonly id = `m${nextId++}`
  private emitter = new Emitter<CallEvents>()
  peer?: MockCall
  state: 'ringing' | 'established' | 'ended' = 'ringing'
  private timers: ReturnType<typeof setTimeout>[] = []
  ivr = false

  constructor(
    private engine: MockEngine,
    readonly direction: 'in' | 'out',
    readonly remote: string,
    readonly remoteName?: string
  ) {}

  on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): () => void {
    return this.emitter.on(event, listener)
  }

  emit<K extends keyof CallEvents>(event: K, ...args: CallEvents[K]): void {
    this.emitter.emit(event, ...args)
  }

  later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms))
  }

  establish(): void {
    if (this.state !== 'ringing') return
    this.state = 'established'
    this.emit('established')
  }

  end(end: CallEnd): void {
    if (this.state === 'ended') return
    this.state = 'ended'
    this.timers.forEach(clearTimeout)
    this.emit('ended', end)
    this.emitter.clear()
  }

  async answer(): Promise<void> {
    if (this.direction !== 'in' || this.state !== 'ringing') return
    this.engine.sip('→ SIP/2.0 200 OK')
    this.establish()
    if (this.peer) {
      this.peer.engine.sip('← SIP/2.0 200 OK')
      this.peer.engine.log('info', `${this.peer.remote} atendeu`)
      this.peer.establish()
    }
  }

  async reject(): Promise<void> {
    if (this.state !== 'ringing') return
    this.engine.sip('→ SIP/2.0 486 Busy Here')
    this.end({ by: 'local', code: 486, reason: 'Busy Here' })
    this.peer?.engine.sip('← SIP/2.0 486 Busy Here')
    this.peer?.end({ by: 'remote', code: 486, reason: 'Busy Here' })
  }

  async hangup(): Promise<void> {
    if (this.state === 'ended') return
    if (this.state === 'ringing' && this.direction === 'out') {
      this.engine.sip('→ CANCEL')
      this.end({ by: 'local', code: 487, reason: 'Request Terminated' })
      this.peer?.end({ by: 'remote', code: 487, reason: 'Chamada cancelada por quem ligou' })
      return
    }
    if (this.state === 'ringing') return this.reject()
    this.engine.sip('→ BYE')
    this.end({ by: 'local' })
    this.peer?.engine.sip('← BYE')
    this.peer?.end({ by: 'remote' })
  }

  setMuted(muted: boolean): void {
    this.engine.log('info', muted ? 'Microfone mudo' : 'Microfone ativo')
  }

  async setHeld(held: boolean): Promise<void> {
    if (this.state !== 'established') return
    this.engine.sip(`→ re-INVITE (a=${held ? 'sendonly' : 'sendrecv'})`)
    this.emit(held ? 'hold' : 'unhold', 'local')
    this.peer?.emit(held ? 'hold' : 'unhold', 'remote')
  }

  async sendDtmf(tone: string, mode: DtmfMode): Promise<void> {
    if (this.state !== 'established') throw new Error('A chamada ainda não foi atendida')
    this.engine.sip(mode === 'rtp-event' ? `→ RTP telephone-event ${tone}` : `→ INFO (dtmf-relay Signal=${tone})`)
    if (this.ivr) this.engine.log('info', `URA recebeu o dígito ${tone}`)
    this.peer?.emit('dtmf', tone)
  }

  async transfer(target: string): Promise<void> {
    if (this.state !== 'established') throw new Error('Só chamadas em andamento podem ser transferidas')
    this.engine.sip(`→ REFER (Refer-To: sip:${target}@${this.engine.domain})`)
    this.emit('transfer', 100, 'Trying', false)
    this.later(150, () => this.emit('transfer', 180, 'Ringing', false))
    this.later(400, () => {
      this.emit('transfer', 200, 'OK', true)
      this.engine.log('info', `Transferido para ${target}`)
      this.end({ by: 'local', reason: `Transferida para ${target}` })
      this.peer?.end({ by: 'remote', reason: `Transferida para ${target}` })
    })
  }

  async quality(): Promise<CallQuality | null> {
    if (this.state !== 'established') return null
    const jitter = 4 + Math.round(Math.random() * 6)
    return { score: 93 - jitter, level: 'excellent', jitterMs: jitter, packetLossPercent: 0.1, rttMs: 38, codec: 'opus (simulado)' }
  }
}

export class MockEngine implements SipEngine {
  private emitter = new Emitter<EngineEvents>()
  private status: RegStatus = { state: 'disconnected' }
  readonly domain: string
  readonly extension: string
  private calls = new Set<MockCall>()

  constructor(
    private account: Account,
    private password: string
  ) {
    this.domain = account.domain.toLowerCase()
    this.extension = account.extension
  }

  on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void {
    return this.emitter.on(event, listener)
  }

  log(level: LogLevel, text: string, kind: LogKind = 'event'): void {
    this.emitter.emit('log', { level, kind, text })
  }

  sip(line: string): void {
    if (this.account.rawSipLog) this.log('info', line, 'sip')
  }

  private setStatus(status: RegStatus): void {
    this.status = status
    this.emitter.emit('status', status)
  }

  get registered(): boolean {
    return this.status.state === 'registered'
  }

  connect(): Promise<void> {
    this.setStatus({ state: 'connecting' })
    this.sip(`→ REGISTER sip:${this.domain}`)
    return new Promise((resolve) =>
      setTimeout(() => {
        if (!this.password) {
          this.sip('← SIP/2.0 401 Unauthorized')
          this.setStatus({ state: 'error', code: 401, reason: 'Unauthorized' })
        } else if (/^(errada|wrong)$/i.test(this.password)) {
          this.sip('← SIP/2.0 403 Forbidden')
          this.setStatus({ state: 'error', code: 403, reason: 'Forbidden' })
        } else {
          this.sip('← SIP/2.0 200 OK')
          registry.add(this)
          this.setStatus({ state: 'registered' })
        }
        resolve()
      }, MOCK_TIMING.register)
    )
  }

  async disconnect(): Promise<void> {
    for (const call of this.calls) await call.hangup()
    registry.delete(this)
    if (this.status.state === 'registered') this.sip(`→ REGISTER sip:${this.domain} (Expires: 0)`)
    this.setStatus({ state: 'disconnected' })
  }

  private track(call: MockCall): MockCall {
    this.calls.add(call)
    call.on('ended', () => this.calls.delete(call))
    return call
  }

  async dial(destination: string): Promise<EngineCall> {
    if (!this.registered) throw new Error('A conta precisa estar registrada para ligar')
    const call = this.track(new MockCall(this, 'out', destination))
    this.sip(`→ INVITE sip:${destination}@${this.domain}`)
    call.later(MOCK_TIMING.trying, () => {
      this.sip('← SIP/2.0 100 Trying')
      call.emit('progress', 100, 'Trying', false)
      this.route(call, destination)
    })
    return call
  }

  private route(call: MockCall, destination: string): void {
    const fail = (code: number, reason: string): void => {
      this.sip(`← SIP/2.0 ${code} ${reason}`)
      call.end({ by: 'remote', code, reason })
    }
    const target = [...registry].find(
      (e) => e !== this && e.domain === this.domain && e.extension === destination && e.registered
    )

    if (target) {
      const incoming = target.receive(this.extension, this.account.displayName || this.account.name, call)
      call.peer = incoming
      call.later(MOCK_TIMING.ringing, () => {
        if (call.state !== 'ringing') return
        this.sip('← SIP/2.0 180 Ringing')
        call.emit('progress', 180, 'Ringing', false)
      })
      call.later(MOCK_TIMING.noAnswer, () => {
        if (call.state !== 'ringing') return
        fail(480, 'Temporarily Unavailable')
        incoming.end({ by: 'remote', code: 487, reason: 'Ninguém atendeu' })
      })
      return
    }
    if (destination === '486') return fail(486, 'Busy Here')
    if (destination === '408') {
      call.later(MOCK_TIMING.ringing, () => {
        this.sip('← SIP/2.0 180 Ringing')
        call.emit('progress', 180, 'Ringing', false)
      })
      call.later(MOCK_TIMING.timeout, () => fail(408, 'Request Timeout'))
      return
    }
    if (destination.startsWith('8')) {
      call.ivr = true
      call.later(MOCK_TIMING.ringing, () => {
        this.sip('← SIP/2.0 183 Session Progress (SDP)')
        call.emit('progress', 183, 'Session Progress', true)
      })
      call.later(MOCK_TIMING.ivrAnswer, () => {
        this.sip('← SIP/2.0 200 OK')
        this.log('info', 'URA atendeu: "Digite 1 para suporte, 2 para vendas"')
        call.establish()
      })
      return
    }
    fail(404, 'Not Found')
  }

  receive(from: string, fromName: string, peer: MockCall): MockCall {
    const call = this.track(new MockCall(this, 'in', from, fromName))
    call.peer = peer
    this.sip(`← INVITE de sip:${from}@${this.domain}`)
    this.sip('→ SIP/2.0 180 Ringing')
    this.emitter.emit('incoming', call)
    return call
  }

  async health(): Promise<HealthReport> {
    return {
      websocketConnected: this.status.state !== 'disconnected',
      registered: this.registered,
      latencyMs: this.registered ? 20 + Math.round(Math.random() * 30) : undefined,
      error: this.registered ? undefined : 'Conta não registrada',
      checkedAt: new Date()
    }
  }

  async dispose(): Promise<void> {
    await this.disconnect()
    this.emitter.clear()
  }
}
