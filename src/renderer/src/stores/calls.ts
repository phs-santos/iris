import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { CallQuality, EngineCall } from '@renderer/sip/engine'
import { ringer } from '@renderer/sip/audio'
import { parseDtmfSequence, runDtmfSequence } from '@renderer/lib/dtmf'
import { useAccountsStore } from './accounts'
import { useLogStore } from './log'

export type CallState = 'dialing' | 'ringing' | 'early' | 'established' | 'ended'

export interface CallView {
  id: string
  accountId: string
  direction: 'in' | 'out'
  remote: string
  remoteName?: string
  state: CallState
  muted: boolean
  held: boolean
  heldByRemote: boolean
  startedAt: number
  establishedAt?: number
  endedAt?: number
  /** Último código SIP recebido, ex.: "180 Ringing". */
  progress?: string
  endText?: string
  failed: boolean
  transfer?: string
  quality?: CallQuality | null
  dtmfRunning: boolean
  dtmfReceived: string
  autoAnswerAt?: number
}

/** Tempo que um cartão de chamada encerrada fica visível. */
export const ENDED_VISIBLE_MS = 6000

export const useCallsStore = defineStore('calls', () => {
  const calls = ref<CallView[]>([])
  const selectedId = ref<string | null>(null)
  const engineCalls = new Map<string, EngineCall>()
  const dtmfAborts = new Map<string, AbortController>()

  const active = computed(() => calls.value.filter((c) => c.state !== 'ended'))
  const ringingIncoming = computed(() => calls.value.filter((c) => c.direction === 'in' && c.state === 'ringing'))

  // Toque central: soa enquanto houver chamada recebida esperando atendimento manual.
  watch(
    () => ringingIncoming.value.some((c) => !c.autoAnswerAt),
    (ring) => (ring ? ringer.start() : ringer.stop())
  )

  const view = (id: string): CallView | undefined => calls.value.find((c) => c.id === id)

  function track(accountId: string, call: EngineCall, state: CallState): CallView {
    const log = useLogStore()
    const label = (): string => `${call.direction === 'out' ? 'para' : 'de'} ${call.remote}`

    engineCalls.set(call.id, call)
    calls.value.unshift({
      id: call.id,
      accountId,
      direction: call.direction,
      remote: call.remote,
      remoteName: call.remoteName,
      state,
      muted: false,
      held: false,
      heldByRemote: false,
      startedAt: Date.now(),
      failed: false,
      dtmfRunning: false,
      dtmfReceived: ''
    })
    selectedId.value = call.id
    // Lê de novo do array: o Vue devolve o proxy reativo, não o objeto cru.
    const v = (): CallView | undefined => view(call.id)

    call.on('progress', (code, reason, early) => {
      const c = v()
      if (!c || c.state === 'established') return
      c.progress = `${code} ${reason}`.trim()
      if (code >= 180 && c.state === 'dialing') c.state = early ? 'early' : 'ringing'
      if (early) c.state = 'early'
      log.add(accountId, 'info', 'event', `Chamada ${label()}: ${c.progress}${early ? ' (early media)' : ''}`)
    })
    call.on('established', () => {
      const c = v()
      if (!c || c.state === 'established') return
      c.state = 'established'
      c.establishedAt = Date.now()
      c.autoAnswerAt = undefined
      log.add(accountId, 'info', 'event', `Chamada ${label()} em andamento`)
    })
    call.on('ended', (end) => {
      const c = v()
      engineCalls.delete(call.id)
      dtmfAborts.get(call.id)?.abort()
      if (!c) return
      const wasEstablished = c.state === 'established'
      c.state = 'ended'
      c.endedAt = Date.now()
      c.failed = !wasEstablished && end.by !== 'local' && Boolean(end.code && end.code >= 400)
      const code = [end.code, end.reason].filter(Boolean).join(' ')
      const who = end.by === 'local' ? 'Encerrada por você' : end.by === 'remote' ? 'Encerrada pelo outro lado' : 'Falhou'
      c.endText = code ? `${who} · ${code}` : who
      log.add(accountId, c.failed ? 'warn' : 'info', 'event', `Chamada ${label()}: ${c.endText}`)
      setTimeout(() => {
        calls.value = calls.value.filter((x) => x.id !== call.id)
        if (selectedId.value === call.id) selectedId.value = active.value[0]?.id ?? null
      }, ENDED_VISIBLE_MS)
    })
    call.on('hold', (by) => {
      const c = v()
      if (!c) return
      if (by === 'remote') c.heldByRemote = true
      else c.held = true
      log.add(accountId, 'info', 'event', by === 'remote' ? `${call.remote} colocou você em espera` : 'Chamada em espera')
    })
    call.on('unhold', (by) => {
      const c = v()
      if (!c) return
      if (by === 'remote') c.heldByRemote = false
      else c.held = false
      log.add(accountId, 'info', 'event', by === 'remote' ? `${call.remote} retomou a chamada` : 'Chamada retomada')
    })
    call.on('dtmf', (tone) => {
      const c = v()
      if (c) c.dtmfReceived = (c.dtmfReceived + tone).slice(-24)
      log.add(accountId, 'info', 'event', `DTMF recebido: ${tone}`)
    })
    call.on('transfer', (code, reason, final) => {
      const c = v()
      if (c) c.transfer = `${code} ${reason}`.trim()
      log.add(accountId, final && code >= 300 ? 'warn' : 'info', 'event', `Transferência: ${code} ${reason}${final ? ' (final)' : ''}`)
    })

    return v()!
  }

  async function dial(accountId: string, destination: string, headers?: string[]): Promise<void> {
    const accounts = useAccountsStore()
    const log = useLogStore()
    const engine = accounts.engineOf(accountId)
    const dest = destination.trim()
    if (!dest) return
    if (!engine || accounts.statusOf(accountId).state !== 'registered') {
      log.add(accountId, 'warn', 'event', 'Registre a conta antes de ligar')
      throw new Error('Registre a conta antes de ligar')
    }
    log.add(accountId, 'info', 'event', `Ligando para ${dest}`)
    try {
      const call = await engine.dial(dest, { headers })
      track(accountId, call, 'dialing')
    } catch (error) {
      log.add(accountId, 'error', 'event', `Não foi possível ligar para ${dest}: ${(error as Error).message}`)
      throw error
    }
  }

  function addIncoming(accountId: string, call: EngineCall): void {
    const accounts = useAccountsStore()
    const log = useLogStore()
    const account = accounts.byId(accountId)
    const c = track(accountId, call, 'ringing')
    const who = call.remoteName ? `${call.remoteName} (${call.remote})` : call.remote
    log.add(accountId, 'info', 'event', `Chamada recebida de ${who}`)

    if (account?.autoAnswer.enabled) {
      const delay = Math.max(0, Math.min(10_000, account.autoAnswer.delayMs))
      c.autoAnswerAt = Date.now() + delay
      setTimeout(() => {
        if (view(call.id)?.state === 'ringing') void answer(call.id)
      }, delay)
    } else {
      window.argos.notify(`${account?.name ?? 'Conta'} está tocando`, `Chamada de ${who}`)
    }
  }

  async function run(id: string, action: (call: EngineCall) => Promise<void> | void, what: string): Promise<void> {
    const call = engineCalls.get(id)
    const c = view(id)
    if (!call || !c) return
    try {
      await action(call)
    } catch (error) {
      useLogStore().add(c.accountId, 'error', 'event', `${what} falhou: ${(error as Error).message}`)
    }
  }

  const answer = (id: string): Promise<void> => run(id, (call) => call.answer(), 'Atender')
  const reject = (id: string): Promise<void> => run(id, (call) => call.reject(), 'Recusar')
  const hangup = (id: string): Promise<void> => run(id, (call) => call.hangup(), 'Desligar')

  function toggleMute(id: string): void {
    const c = view(id)
    const call = engineCalls.get(id)
    if (!c || !call) return
    c.muted = !c.muted
    call.setMuted(c.muted)
  }

  const toggleHold = (id: string): Promise<void> =>
    run(id, (call) => call.setHeld(!view(id)?.held), 'Espera')

  /** Envia uma sequência como "1,w2,4321#". Lança erro de sintaxe antes de enviar qualquer dígito. */
  async function sendDtmf(id: string, sequence: string): Promise<void> {
    const c = view(id)
    const call = engineCalls.get(id)
    if (!c || !call) return
    const steps = parseDtmfSequence(sequence)
    const mode = useAccountsStore().byId(c.accountId)?.dtmfMode ?? 'auto'
    const log = useLogStore()
    dtmfAborts.get(id)?.abort()
    const controller = new AbortController()
    dtmfAborts.set(id, controller)
    c.dtmfRunning = true
    try {
      await runDtmfSequence(
        steps,
        async (tone) => {
          await call.sendDtmf(tone, mode)
          log.add(c.accountId, 'info', 'event', `DTMF enviado: ${tone} (${mode})`)
        },
        controller.signal
      )
    } catch (error) {
      if ((error as Error).name !== 'AbortError') log.add(c.accountId, 'error', 'event', `DTMF falhou: ${(error as Error).message}`)
    } finally {
      const current = view(id)
      if (current) current.dtmfRunning = false
      dtmfAborts.delete(id)
    }
  }

  function stopDtmf(id: string): void {
    dtmfAborts.get(id)?.abort()
  }

  const transfer = (id: string, target: string): Promise<void> =>
    run(id, (call) => call.transfer(target.trim()), 'Transferência')

  // Qualidade das chamadas em andamento, a cada 2 s (RF-26).
  setInterval(async () => {
    for (const c of calls.value) {
      if (c.state !== 'established') continue
      const q = await engineCalls.get(c.id)?.quality()
      const current = view(c.id)
      if (current && q !== undefined) current.quality = q
    }
  }, 2000)

  return {
    calls,
    active,
    selectedId,
    ringingIncoming,
    dial,
    addIncoming,
    answer,
    reject,
    hangup,
    toggleMute,
    toggleHold,
    sendDtmf,
    stopDtmf,
    transfer
  }
})
