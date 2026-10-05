import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { CallQuality, EngineCall, VideoStreams } from '@renderer/sip/engine'
import { ringbackTone, ringer } from '@renderer/sip/audio'
import { ringbackOf, type Ringback } from '@shared/ringback'
import { parseDtmfSequence, runDtmfSequence } from '@renderer/lib/dtmf'
import { useAccountsStore } from './accounts'
import { useLogStore } from './log'
import { useHistoryStore } from './history'
import { useContactsStore } from './contacts'
import { usePreferencesStore } from './preferences'
import { notify } from '@renderer/lib/notify'
import { useToastsStore } from './toasts'
import type { ShortcutAction } from '@shared/shortcuts'
import { DEFAULT_RINGTONE } from '@shared/ringtones'

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
    /** Último retorno da transferência, para quem precisa do código (cenários). */
    transferResult?: { code: number; reason: string; final: boolean }
    quality?: CallQuality | null
    /** O que quem ligou ouve antes do atendimento: o toque do app ou o áudio do PBX (RF-20). */
    ringback?: Ringback
    /** Volume do áudio que chega, em dBFS, para o medidor do cartão; null quando o motor não mede. */
    level?: number | null
    dtmfRunning: boolean
    dtmfReceived: string
    autoAnswerAt?: number
    /** Chamada de consulta da transferência assistida aberta a partir desta (RF-16). */
    consultId?: string
    /** Nesta chamada de consulta: a chamada original, que está em espera. */
    consultFor?: string
    /** A chamada tem vídeo: pedido por quem ligou, ou oferecido por quem liga para cá (RF-52). */
    video: boolean
    /** Esta ponta manda a câmera; `cameraOff` é a câmera pausada sem refazer a chamada. */
    sendsVideo: boolean
    cameraOff: boolean
    /** Sobe a cada mudança nas imagens, para a tela buscar os fluxos de novo. */
    videoRev: number
    /** O motor desta chamada grava em arquivo (RF-36). */
    canRecord: boolean
    /** Arquivo da gravação em andamento. */
    recording?: string
}

/** Tempo que um cartão de chamada encerrada fica visível. */
export const ENDED_VISIBLE_MS = 6000

/** Espera do PBX derrubar as pernas locais depois da assistida antes do app desligar por conta própria. */
export const ATTENDED_CLEANUP_MS = 4000

export const useCallsStore = defineStore('calls', () => {
    const calls = ref<CallView[]>([])
    const selectedId = ref<string | null>(null)
    const engineCalls = new Map<string, EngineCall>()
    const dtmfAborts = new Map<string, AbortController>()

    const active = computed(() => calls.value.filter((c) => c.state !== 'ended'))
    const ringingIncoming = computed(() => calls.value.filter((c) => c.direction === 'in' && c.state === 'ringing'))

    // Toque central: soa enquanto houver chamada recebida esperando atendimento manual.
    // O som é o da conta da chamada que toca há mais tempo (RF-55).
    watch(
        () => {
            const first = ringingIncoming.value.filter((c) => !c.autoAnswerAt).at(-1)
            return first ? (useAccountsStore().byId(first.accountId)?.ringtone ?? DEFAULT_RINGTONE) : null
        },
        (tone) => (tone ? ringer.start(tone) : ringer.stop())
    )

    // Toque de quem liga (RF-20): toca enquanto alguma chamada feita espera sem áudio do PBX.
    watch(
        () => calls.value.some((c) => c.ringback === 'local'),
        (ring) => (ring ? ringbackTone.start() : ringbackTone.stop())
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
            // Sem nome vindo do PBX, vale o da agenda (RF-50).
            remoteName: call.remoteName ?? useContactsStore().nameOf(call.remote),
            state,
            muted: false,
            held: false,
            heldByRemote: false,
            startedAt: Date.now(),
            failed: false,
            dtmfRunning: false,
            dtmfReceived: '',
            video: call.video,
            sendsVideo: call.direction === 'out' && call.video,
            cameraOff: false,
            videoRev: 0,
            canRecord: typeof call.setRecording === 'function'
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
            c.ringback = ringbackOf(c, call)
            log.add(accountId, 'info', 'event', `Chamada ${label()}: ${c.progress}${early ? ' (early media)' : ''}`)
        })
        call.on('established', () => {
            const c = v()
            if (!c || c.state === 'established') return
            c.state = 'established'
            c.ringback = undefined
            c.establishedAt = Date.now()
            c.autoAnswerAt = undefined
            window.iris.closeNotification?.(call.id)
            log.add(accountId, 'info', 'event', `Chamada ${label()} em andamento`)
            if (call.direction === 'in') void playAnswerAudio(accountId, call.id)
        })
        call.on('ended', (end) => {
            const c = v()
            engineCalls.delete(call.id)
            dtmfAborts.get(call.id)?.abort()
            if (!c) return
            // Desfaz o vínculo da transferência assistida se uma das pontas cair antes de concluir.
            const original = c.consultFor ? view(c.consultFor) : undefined
            if (original?.consultId === c.id) original.consultId = undefined
            const consult = c.consultId ? view(c.consultId) : undefined
            if (consult?.consultFor === c.id) consult.consultFor = undefined
            window.iris.closeNotification?.(call.id)
            // Quem ligou desistiu antes de alguém atender: chamada perdida.
            if (c.direction === 'in' && !c.establishedAt && end.by === 'remote' && !c.autoAnswerAt) {
                const name = c.remoteName ? `${c.remoteName} (${c.remote})` : c.remote
                notify('missed', `Chamada perdida em ${useAccountsStore().nameOf(accountId)}`, `De ${name}`)
            }
            if (c.recording) log.add(accountId, 'info', 'event', `Gravação salva em ${c.recording}`)
            c.recording = undefined
            const wasEstablished = c.state === 'established'
            c.state = 'ended'
            c.ringback = undefined
            c.endedAt = Date.now()
            c.failed = !wasEstablished && end.by !== 'local' && Boolean(end.code && end.code >= 400)
            const code = [end.code, end.reason].filter(Boolean).join(' ')
            const who =
                end.by === 'local' ? 'Encerrada por você' : end.by === 'remote' ? 'Encerrada pelo outro lado' : 'Falhou'
            c.endText = code ? `${who} · ${code}` : who
            log.add(accountId, c.failed ? 'warn' : 'info', 'event', `Chamada ${label()}: ${c.endText}`)
            useHistoryStore().add({
                id: `${c.startedAt}-${call.id}`,
                startedAt: c.startedAt,
                accountId,
                accountName: useAccountsStore().nameOf(accountId),
                direction: c.direction,
                remote: c.remote,
                remoteName: c.remoteName,
                durationMs: c.establishedAt ? c.endedAt - c.establishedAt : 0,
                answered: Boolean(c.establishedAt),
                failed: c.failed,
                result: c.endText
            })
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
            log.add(
                accountId,
                'info',
                'event',
                by === 'remote' ? `${call.remote} colocou você em espera` : 'Chamada em espera'
            )
        })
        call.on('unhold', (by) => {
            const c = v()
            if (!c) return
            if (by === 'remote') c.heldByRemote = false
            else c.held = false
            log.add(
                accountId,
                'info',
                'event',
                by === 'remote' ? `${call.remote} retomou a chamada` : 'Chamada retomada'
            )
        })
        call.on('video', () => {
            const c = v()
            if (c) c.videoRev++
        })
        call.on('dtmf', (tone) => {
            const c = v()
            if (c) c.dtmfReceived = (c.dtmfReceived + tone).slice(-24)
            log.add(accountId, 'info', 'event', `DTMF recebido: ${tone}`)
        })
        call.on('transfer', (code, reason, final) => {
            const c = v()
            if (c) {
                c.transfer = `${code} ${reason}`.trim()
                c.transferResult = { code, reason, final }
            }
            // Concluída a assistida, o PBX costuma derrubar as duas pernas; se não derrubar, o app desliga.
            if (c?.consultId && final && code >= 200 && code < 300) {
                const consultId = c.consultId
                setTimeout(() => {
                    for (const id of [call.id, consultId]) if (engineCalls.has(id)) void hangup(id)
                }, ATTENDED_CLEANUP_MS)
            }
            log.add(
                accountId,
                final && code >= 300 ? 'warn' : 'info',
                'event',
                `Transferência: ${code} ${reason}${final ? ' (final)' : ''}`
            )
        })

        return v()!
    }

    /** Liga e devolve o id da chamada criada. */
    async function dial(
        accountId: string,
        destination: string,
        headers?: string[],
        video = false
    ): Promise<string | undefined> {
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
            if (video && !engine.video) throw new Error('Esta conta não faz chamada de vídeo: use uma conta WebRTC')
            const call = await engine.dial(dest, { headers, video })
            return track(accountId, call, 'dialing').id
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
        const name = c.remoteName
        const who = name ? `${name} (${call.remote})` : call.remote
        log.add(accountId, 'info', 'event', `Chamada recebida de ${who}`)

        if (account?.autoAnswer.enabled) {
            const delay = Math.max(0, Math.min(10_000, account.autoAnswer.delayMs))
            c.autoAnswerAt = Date.now() + delay
            setTimeout(() => {
                if (view(call.id)?.state === 'ringing') void answer(call.id)
            }, delay)
        } else {
            notify('incoming', `${account?.name ?? 'Conta'} está tocando`, `Chamada de ${who}`, c.id)
            if (usePreferencesStore().notifications.focusOnRing) window.iris.focusWindow()
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

    /** Com `video`, atende mandando a câmera; sem, só recebe a imagem de quem ligou (RF-52). */
    async function answer(id: string, video = false): Promise<void> {
        const c = view(id)
        if (c) c.sendsVideo = video && c.video
        await run(id, (call) => call.answer({ video }), 'Atender')
    }

    const videoStreams = (id: string): VideoStreams =>
        engineCalls.get(id)?.videoStreams?.() ?? { remote: null, local: null }

    function toggleCamera(id: string): void {
        const c = view(id)
        const call = engineCalls.get(id)
        if (!c || !call?.setCamera || !c.sendsVideo) return
        c.cameraOff = !c.cameraOff
        call.setCamera(!c.cameraOff)
    }
    const reject = (id: string): Promise<void> => run(id, (call) => call.reject(), 'Recusar')
    const hangup = (id: string): Promise<void> => run(id, (call) => call.hangup(), 'Desligar')

    function toggleMute(id: string): void {
        const c = view(id)
        const call = engineCalls.get(id)
        if (!c || !call) return
        c.muted = !c.muted
        call.setMuted(c.muted)
    }

    const toggleHold = (id: string): Promise<void> => run(id, (call) => call.setHeld(!view(id)?.held), 'Espera')

    /** Liga ou desliga a gravação da chamada em WAV (RF-36). */
    async function toggleRecording(id: string): Promise<void> {
        const c = view(id)
        const call = engineCalls.get(id)
        if (!c || !call?.setRecording) return
        const log = useLogStore()
        try {
            const path = await call.setRecording(!c.recording)
            const current = view(id)
            if (!current) return
            if (current.recording) {
                log.add(c.accountId, 'info', 'event', `Gravação salva em ${current.recording}`)
                useToastsStore().show(`Gravação salva em ${current.recording}`)
                current.recording = undefined
            } else if (path) {
                current.recording = path
                log.add(c.accountId, 'info', 'event', `Gravando a chamada em ${path}`)
            }
        } catch (error) {
            log.add(c.accountId, 'error', 'event', `Gravação falhou: ${(error as Error).message}`)
        }
    }

    /** Volume do áudio recebido, para os cenários (RF-41). */
    const audioLevel = (id: string): Promise<number | null> =>
        engineCalls.get(id)?.audioLevel() ?? Promise.resolve(null)

    /** Áudio de atendimento (RF-57): o WAV da conta toca para quem ligou, logo depois de atender. */
    async function playAnswerAudio(accountId: string, id: string): Promise<void> {
        const path = useAccountsStore().byId(accountId)?.answerAudio
        const call = engineCalls.get(id)
        if (!path || !call || !window.iris.audio) return
        const log = useLogStore()
        if (!call.playAudio) {
            log.add(accountId, 'warn', 'event', 'Áudio de atendimento não tocado: só funciona em SIP puro')
            return
        }
        try {
            const pcm = await window.iris.audio.loadWav(path)
            const name = path.split(/[\\/]/).pop()
            log.add(accountId, 'info', 'event', `Áudio de atendimento: tocando ${name} para quem ligou`)
            await call.playAudio(pcm)
        } catch (error) {
            const message = (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
            log.add(accountId, 'warn', 'event', `Áudio de atendimento não tocado: ${message}`)
        }
    }

    /** Toca um áudio na chamada, no lugar do microfone (RF-41). Lança erro se o motor não consegue. */
    async function playAudio(id: string, pcm: Int16Array): Promise<void> {
        const call = engineCalls.get(id)
        if (!call) throw new Error('A chamada não existe mais')
        if (!call.playAudio)
            throw new Error('Esta conta não toca áudio na chamada: use uma conta de SIP puro ou simulada')
        await call.playAudio(pcm)
    }

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
            if ((error as Error).name !== 'AbortError')
                log.add(c.accountId, 'error', 'event', `DTMF falhou: ${(error as Error).message}`)
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

    /** Transferência assistida, passo 1: põe a chamada em espera e liga para o destino pela mesma conta. */
    async function startConsult(id: string, target: string): Promise<void> {
        const c = view(id)
        if (!c || c.state !== 'established' || c.consultId) return
        const log = useLogStore()
        if (!c.held) await run(id, (call) => call.setHeld(true), 'Espera')
        log.add(c.accountId, 'info', 'event', `Consulta para transferência: ligando para ${target.trim()}`)
        const consultId = await dial(c.accountId, target).catch(() => undefined)
        const original = view(id)
        const consult = consultId ? view(consultId) : undefined
        if (!original || !consult) return
        original.consultId = consult.id
        consult.consultFor = original.id
    }

    /** Passo 2: liga o outro lado da chamada original com quem atendeu a consulta. */
    async function completeTransfer(consultId: string): Promise<void> {
        const consult = view(consultId)
        const originalId = consult?.consultFor
        const consultCall = engineCalls.get(consultId)
        if (!consult || !originalId || !consultCall) return
        const original = view(originalId)
        if (original)
            useLogStore().add(
                consult.accountId,
                'info',
                'event',
                `Transferência assistida: ${original.remote} → ${consult.remote}`
            )
        await run(originalId, (call) => call.attendedTransfer(consultCall), 'Transferência assistida')
    }

    /** Desiste da consulta: desliga quem foi consultado e retoma a chamada original. */
    async function cancelConsult(consultId: string): Promise<void> {
        const originalId = view(consultId)?.consultFor
        await hangup(consultId)
        if (originalId && view(originalId)?.held) await toggleHold(originalId)
        if (originalId) selectedId.value = originalId
    }

    /** Aplica o microfone escolhido nas chamadas em andamento (RF-19). */
    async function setInputDevice(deviceId: string): Promise<void> {
        for (const c of calls.value) {
            if (c.state === 'established')
                await run(c.id, (call) => call.setInputDevice(deviceId), 'Troca de microfone')
        }
    }

    /**
     * Atalho global ou botão do fone (RF-34): vale para a chamada que a pessoa esperaria, sem olhar a
     * tela. Atender pega a que está tocando há mais tempo; desligar encerra a escolhida (ou recusa a
     * que toca, se não há outra); mudo vale para a chamada em andamento.
     */
    function shortcut(action: ShortcutAction): void {
        const ringing = ringingIncoming.value.at(-1)
        const live = active.value.filter((c) => c.direction === 'out' || c.state !== 'ringing')
        const current = live.find((c) => c.id === selectedId.value) ?? live[0]
        if (action === 'answer' && ringing) void answer(ringing.id)
        else if (action === 'hangup' && current) void hangup(current.id)
        else if (action === 'hangup' && ringing) void reject(ringing.id)
        else if (action === 'mute') {
            const talking = live.find((c) => c.id === selectedId.value && c.state === 'established')
            const target = talking ?? live.find((c) => c.state === 'established')
            if (target) toggleMute(target.id)
        }
    }

    // Volume do que chega, para o medidor do cartão: rápido o bastante para acompanhar a fala.
    setInterval(async () => {
        for (const c of calls.value) {
            // Também antes do atendimento, quando o que toca é o áudio do PBX (RF-20).
            if (c.state !== 'established' && c.ringback !== 'pbx') continue
            const level = await engineCalls
                .get(c.id)
                ?.audioLevel()
                .catch(() => null)
            const current = view(c.id)
            if (current && level !== undefined) current.level = level
        }
    }, 250)

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
        videoStreams,
        toggleCamera,
        reject,
        hangup,
        toggleMute,
        shortcut,
        toggleHold,
        toggleRecording,
        audioLevel,
        playAudio,
        sendDtmf,
        stopDtmf,
        transfer,
        startConsult,
        completeTransfer,
        cancelConsult,
        setInputDevice
    }
})
