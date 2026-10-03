// Interface própria do motor SIP (RNF-16). A interface do app só conhece estes tipos;
// o easy-sipjs e o simulador são duas implementações intercambiáveis.

import type { DtmfMode } from '@shared/types'

export type RegState = 'disconnected' | 'connecting' | 'connected' | 'registered' | 'error'

export interface RegStatus {
  state: RegState
  code?: number
  reason?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogKind = 'event' | 'sip'

export interface EngineLog {
  level: LogLevel
  kind: LogKind
  text: string
}

export interface CallEnd {
  code?: number
  reason?: string
  /** Quem encerrou: o próprio app, o outro lado ou o sistema (falha). */
  by: 'local' | 'remote' | 'system'
}

export interface CallQuality {
  score: number
  level: 'excellent' | 'good' | 'warning' | 'bad'
  jitterMs: number
  packetLossPercent: number
  rttMs: number
  codec: string
}

export interface HealthReport {
  websocketConnected: boolean
  registered: boolean
  latencyMs?: number
  error?: string
  checkedAt: Date
}

export type CallEvents = {
  progress: [code: number, reason: string, earlyMedia: boolean]
  established: []
  ended: [end: CallEnd]
  hold: [by: 'local' | 'remote']
  unhold: [by: 'local' | 'remote']
  dtmf: [tone: string]
  transfer: [code: number, reason: string, final: boolean]
}

export interface EngineCall {
  readonly id: string
  readonly direction: 'in' | 'out'
  readonly remote: string
  readonly remoteName?: string
  on<K extends keyof CallEvents>(event: K, listener: (...args: CallEvents[K]) => void): () => void
  answer(): Promise<void>
  reject(): Promise<void>
  hangup(): Promise<void>
  setMuted(muted: boolean): void
  setHeld(held: boolean): Promise<void>
  sendDtmf(tone: string, mode: DtmfMode): Promise<void>
  transfer(target: string): Promise<void>
  quality(): Promise<CallQuality | null>
}

export type EngineEvents = {
  status: [status: RegStatus]
  log: [entry: EngineLog]
  incoming: [call: EngineCall]
}

export interface DialOptions {
  headers?: string[]
}

export interface SipEngine {
  on<K extends keyof EngineEvents>(event: K, listener: (...args: EngineEvents[K]) => void): () => void
  connect(): Promise<void>
  disconnect(): Promise<void>
  dial(destination: string, options?: DialOptions): Promise<EngineCall>
  health(): Promise<HealthReport>
  dispose(): Promise<void>
}

/** Tenta extrair código e frase SIP de erros com formatos diferentes (SIP.js, JsSIP, Error). */
export function describeSipError(error: unknown): { code?: number; reason?: string } {
  if (!error || typeof error !== 'object') return { reason: error ? String(error) : undefined }
  const e = error as Record<string, any>
  const message = e.message && typeof e.message === 'object' ? e.message : undefined
  const code = message?.statusCode ?? e.statusCode ?? e.status_code ?? e.response?.status_code
  const reason =
    message?.reasonPhrase ?? e.reasonPhrase ?? e.reason_phrase ?? e.cause ?? (typeof e.message === 'string' ? e.message : undefined)
  return { code: typeof code === 'number' ? code : undefined, reason: reason ? String(reason) : undefined }
}
