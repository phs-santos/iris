import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { t } from '@renderer/i18n'
import {
    AnswerDetector,
    applyOutcome,
    BeepWaiter,
    dayStats,
    emptySdr,
    fillScript,
    leadsToCsv,
    nextLead,
    OUTCOMES,
    openingFor,
    parseLeadsCsv,
    parseLeadsText,
    withinHours,
    type Lead,
    type OutcomeId,
    type SdrData,
    type SdrSettings
} from '@shared/sdr'
import { SILENCE_DB } from '@shared/audio'
import { isWebhookUrl } from '@shared/monitor'
import { useAccountsStore } from './accounts'
import { describeStatus } from '@renderer/lib/accounts'
import { useCallsStore } from './calls'
import { useLogStore } from './log'
import { usePreferencesStore } from './preferences'
import { useToastsStore } from './toasts'

export type SdrPhase =
    | 'dialing'
    | 'ringing'
    /** Atendeu: ouvindo se é gente ou caixa postal. */
    | 'detecting'
    | 'opening'
    | 'talking'
    /** Caixa postal: esperando o bipe para deixar o recado. */
    | 'beep'
    | 'leaving'
    /** A chamada acabou: falta o resultado. */
    | 'wrapup'

export interface SdrCurrent {
    leadId: string
    callId?: string
    accountId: string
    phase: SdrPhase
    answeredAt?: number
    endedAt?: number
    voicemail: boolean
    /** Resultado que a própria fila decidiu (ocupado, caixa postal…); a tela só confirma. */
    suggested?: OutcomeId
    recording?: string
    summary?: string
    summaryError?: string
    summarizing?: boolean
}

const STEP_MS = 250

/** Modo SDR: conduz a fila de ligações, a abertura, a caixa postal e o resultado de cada chamada. */
export const useSdrStore = defineStore('sdr', () => {
    const data = ref<SdrData>(emptySdr())
    const running = ref(false)
    const current = ref<SdrCurrent | null>(null)
    /** Segundos até a próxima ligação; null sem contagem. */
    const countdown = ref<number | null>(null)
    /** Por que a fila não está ligando (fora do horário, fila vazia…). */
    const notice = ref('')
    const now = ref(Date.now())
    const skipped = new Set<string>()
    let timer: ReturnType<typeof setInterval> | undefined
    let wait: ReturnType<typeof setTimeout> | undefined
    let probe: ReturnType<typeof setInterval> | undefined
    let stopWatch: (() => void) | undefined

    setInterval(() => (now.value = Date.now()), 1000)

    const settings = computed(() => data.value.settings)
    const stats = computed(() => dayStats(data.value.attempts, now.value))
    const lead = computed(() => data.value.leads.find((l) => l.id === current.value?.leadId))
    const pending = computed(() => data.value.leads.filter((l) => l.status === 'pending'))
    const sdrName = computed(() => {
        const prefs = usePreferencesStore()
        const account = useAccountsStore().byId(current.value?.accountId ?? settings.value.accountId ?? null)
        return prefs.profile.name || account?.displayName || account?.name || ''
    })
    const opening = computed(() => (lead.value ? openingFor(settings.value.openings, lead.value) : undefined))
    const script = computed(() =>
        lead.value && opening.value ? fillScript(opening.value.script, lead.value, sdrName.value) : ''
    )

    /** Só grava depois de ler o arquivo: antes disso a fila em memória é a vazia, e apagaria a salva. */
    let loaded = false

    async function load(): Promise<void> {
        data.value = await window.iris.sdr.load()
        loaded = true
    }

    function persist(): void {
        if (!loaded) return
        void window.iris.sdr
            ?.save(JSON.parse(JSON.stringify(data.value)))
            .catch((error: Error) =>
                useLogStore().add(null, 'error', 'event', `Fila do SDR não foi gravada: ${error.message}`)
            )
    }

    function setSettings(patch: Partial<SdrSettings>): void {
        data.value = { ...data.value, settings: { ...data.value.settings, ...patch } }
        persist()
    }

    function importCsv(text: string): { added: number; skipped: number; repeated: number } {
        const result = parseLeadsCsv(text, () => crypto.randomUUID(), data.value.leads)
        data.value = { ...data.value, leads: [...data.value.leads, ...result.leads] }
        persist()
        return { added: result.leads.length, skipped: result.skipped, repeated: result.repeated }
    }

    /** Lista colada no painel: uma pessoa por linha. */
    function addText(text: string): { added: number; skipped: number; repeated: number } {
        const result = parseLeadsText(text, () => crypto.randomUUID(), data.value.leads)
        data.value = { ...data.value, leads: [...data.value.leads, ...result.leads] }
        persist()
        return { added: result.leads.length, skipped: result.skipped, repeated: result.repeated }
    }

    function removeLead(id: string): void {
        data.value = { ...data.value, leads: data.value.leads.filter((l) => l.id !== id) }
        persist()
    }

    /** Esvazia a fila; com `doneOnly`, tira só quem já tem resultado final. */
    function clearLeads(doneOnly: boolean): void {
        const keep = (l: Lead): boolean => doneOnly && l.status === 'pending'
        data.value = { ...data.value, leads: data.value.leads.filter(keep) }
        persist()
    }

    async function exportCsv(): Promise<string | null> {
        const csv = leadsToCsv(data.value.leads, (o) => t(`sdr.resultado_${o}`))
        return window.iris.files.saveText(`fila-sdr-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    }

    function updateLead(id: string, change: (lead: Lead) => Lead): void {
        data.value = { ...data.value, leads: data.value.leads.map((l) => (l.id === id ? change(l) : l)) }
    }

    const accountId = (): string | undefined => {
        const accounts = useAccountsStore()
        return settings.value.accountId && accounts.byId(settings.value.accountId)
            ? settings.value.accountId
            : (accounts.selected?.id ?? undefined)
    }

    function clearTimers(): void {
        clearInterval(timer)
        clearTimeout(wait)
        timer = undefined
        wait = undefined
        countdown.value = null
    }

    function start(): void {
        running.value = true
        notice.value = ''
        void next()
    }

    function pause(): void {
        running.value = false
        clearTimers()
        notice.value = ''
    }

    /** Liga para a próxima da fila, se der: no horário, com a conta registrada e alguém esperando. */
    async function next(specific?: string): Promise<void> {
        clearTimers()
        if (current.value) return
        const from = accountId()
        if (!from) {
            notice.value = t('sdr.aviso_registre')
            running.value = false
            return
        }
        if (!(await ensureRegistered(from))) {
            running.value = false
            return
        }
        // O horário vale para a fila andando sozinha; o clique em Ligar numa pessoa é escolha de quem usa.
        if (!specific && !withinHours(settings.value.hours, new Date())) {
            notice.value = t('sdr.aviso_fora_do_horario', {
                start: settings.value.hours.start,
                end: settings.value.hours.end
            })
            if (running.value) wait = setTimeout(() => void next(), 30_000)
            return
        }
        const found = specific
            ? { lead: data.value.leads.find((l) => l.id === specific) }
            : nextLead(data.value.leads, Date.now(), skipped)
        if (!found.lead) {
            notice.value = found.waiting
                ? t('sdr.aviso_proxima_as', { hora: new Date(found.waiting).toLocaleTimeString().slice(0, 5) })
                : t('sdr.aviso_fila_vazia')
            if (running.value && found.waiting)
                wait = setTimeout(() => void next(), Math.max(1000, found.waiting - Date.now()))
            return
        }
        notice.value = ''
        await dial(found.lead, from)
    }

    /**
     * A conta da fila precisa estar no ar. Desconectada, a fila registra sozinha e espera até 10 s;
     * se não der, a tela diz o motivo (senha, PBX fora…).
     */
    async function ensureRegistered(id: string): Promise<boolean> {
        const accounts = useAccountsStore()
        if (accounts.statusOf(id).state === 'registered') return true
        notice.value = t('sdr.registrando', { name: accounts.nameOf(id) })
        const state = accounts.statusOf(id).state
        if (state === 'disconnected' || state === 'error') void accounts.register(id)
        for (let i = 0; i < 40; i++) {
            await new Promise((done) => setTimeout(done, 250))
            const status = accounts.statusOf(id)
            if (status.state === 'registered') {
                notice.value = ''
                return true
            }
            // Recusa definitiva (senha, ramal): não adianta esperar os 10 s.
            if (status.state === 'error' && status.code && i > 3) break
        }
        notice.value = t('sdr.aviso_nao_registrou', {
            name: accounts.nameOf(id),
            motivo: describeStatus(accounts.statusOf(id))
        })
        return false
    }

    async function dial(target: Lead, from: string): Promise<void> {
        const calls = useCallsStore()
        updateLead(target.id, (l) => ({ ...l, attempts: l.attempts + 1, lastAt: Date.now() }))
        persist()
        current.value = { leadId: target.id, accountId: from, phase: 'dialing', voicemail: false }
        let callId: string | undefined
        try {
            callId = await calls.dial(from, target.number)
        } catch (error) {
            useLogStore().add(
                from,
                'warn',
                'event',
                `SDR: não ligou para ${target.number}: ${(error as Error).message}`
            )
        }
        if (!callId) {
            current.value = { ...current.value, phase: 'wrapup', suggested: 'nao_atendeu', endedAt: Date.now() }
            return finish('nao_atendeu')
        }
        current.value = { ...current.value, callId }
        follow(callId)
    }

    /** Acompanha a chamada: atendeu, quem atendeu, quando acabou. */
    function follow(callId: string): void {
        const calls = useCallsStore()
        stopWatch?.()
        stopWatch = watch(
            () => calls.calls.find((c) => c.id === callId)?.state,
            (state) => {
                const c = current.value
                if (!c || c.callId !== callId) return
                if ((state === 'ringing' || state === 'early') && c.phase === 'dialing') c.phase = 'ringing'
                else if (state === 'established' && !c.answeredAt) answered(callId)
                else if (state === 'ended' || state === undefined) ended(callId)
            },
            { immediate: true }
        )
    }

    function answered(callId: string): void {
        const c = current.value!
        c.answeredAt = Date.now()
        const calls = useCallsStore()
        if (settings.value.record && calls.calls.find((x) => x.id === callId)?.canRecord)
            void calls.toggleRecording(callId)
        if (!settings.value.voicemail.detect) {
            wait = setTimeout(() => void greet(callId), 600)
            return
        }
        c.phase = 'detecting'
        const detector = new AnswerDetector()
        probe = setInterval(() => {
            const view = calls.calls.find((x) => x.id === callId)
            if (view?.recording && current.value) current.value.recording = view.recording
            const kind = detector.push(STEP_MS, view?.level ?? SILENCE_DB)
            if (!kind) return
            clearInterval(probe)
            const who = kind === 'machine' ? 'caixa postal' : kind === 'human' ? 'pessoa' : 'pessoa calada'
            useLogStore().add(c.accountId, 'info', 'event', `SDR: atendeu ${who} (${detector.summary})`)
            if (kind === 'machine') void voicemail(callId)
            else void greet(callId)
        }, STEP_MS)
    }

    /** Gente do outro lado: toca a abertura gravada, se houver, e segue para a conversa. */
    async function greet(callId: string): Promise<void> {
        const c = current.value
        if (!c || c.callId !== callId) return
        const calls = useCallsStore()
        const audio = opening.value?.audio
        if (!settings.value.playOpening || !audio || !calls.canPlay(callId)) {
            const why = !settings.value.playOpening
                ? '"tocar ao atender" desligado'
                : !audio
                  ? 'sem gravação'
                  : 'a conta não toca áudio (WebRTC)'
            useLogStore().add(c.accountId, 'info', 'event', `SDR: abertura não tocada: ${why}`)
            c.phase = 'talking'
            return
        }
        useLogStore().add(c.accountId, 'info', 'event', `SDR: tocando a abertura ${audio.split(/[\\/]/).pop()}`)
        c.phase = 'opening'
        try {
            await calls.playAudio(callId, await window.iris.audio.loadWav(audio))
        } catch (error) {
            useLogStore().add(c.accountId, 'warn', 'event', `SDR: a abertura não tocou: ${(error as Error).message}`)
        }
        if (current.value?.callId === callId && current.value.phase === 'opening') current.value.phase = 'talking'
    }

    /** Para a abertura no meio: o SDR assume a conversa. */
    async function interrupt(): Promise<void> {
        const c = current.value
        if (!c?.callId || c.phase !== 'opening') return
        c.phase = 'talking'
        await useCallsStore().stopAudio(c.callId)
    }

    /** Caixa postal: desliga, deixa o recado depois do bipe, ou deixa o SDR decidir. */
    async function voicemail(callId: string): Promise<void> {
        const c = current.value
        if (!c || c.callId !== callId) return
        const calls = useCallsStore()
        c.voicemail = true
        c.suggested = 'caixa_postal'
        useLogStore().add(c.accountId, 'info', 'event', 'SDR: caixa postal detectada')
        const { action, audio } = settings.value.voicemail
        if (action === 'nothing') {
            c.phase = 'talking'
            return
        }
        if (action === 'hangup' || !audio || !calls.canPlay(callId)) {
            await calls.hangup(callId)
            return
        }
        c.phase = 'beep'
        const waiter = new BeepWaiter()
        probe = setInterval(async () => {
            const view = calls.calls.find((x) => x.id === callId)
            if (!waiter.push(STEP_MS, view?.level ?? SILENCE_DB)) return
            clearInterval(probe)
            if (current.value?.callId !== callId) return
            current.value.phase = 'leaving'
            try {
                await calls.playAudio(callId, await window.iris.audio.loadWav(audio))
                useLogStore().add(c.accountId, 'info', 'event', 'SDR: recado deixado na caixa postal')
            } catch (error) {
                useLogStore().add(c.accountId, 'warn', 'event', `SDR: o recado não tocou: ${(error as Error).message}`)
            }
            await calls.hangup(callId)
        }, STEP_MS)
    }

    function ended(callId: string): void {
        const c = current.value
        if (!c || c.callId !== callId || c.phase === 'wrapup') return
        clearInterval(probe)
        clearTimeout(wait)
        stopWatch?.()
        const view = useCallsStore().calls.find((x) => x.id === callId)
        if (view?.recording) c.recording = view.recording
        c.endedAt = Date.now()
        c.phase = 'wrapup'
        if (!c.answeredAt) {
            // Não atendeu: a fila decide sozinha. Número que não existe sai da fila.
            const code = view?.endCode
            const outcome: OutcomeId = code === 404 || code === 484 || code === 604 ? 'numero_errado' : 'nao_atendeu'
            c.suggested = outcome
            return finish(outcome)
        }
        if (c.voicemail && settings.value.voicemail.action !== 'nothing') return finish('caixa_postal')
    }

    function hangup(): void {
        const id = current.value?.callId
        if (id) void useCallsStore().hangup(id)
    }

    /** Fecha a chamada atual com o resultado e, com a fila andando, conta até a próxima. */
    function finish(outcome: OutcomeId, options: { note?: string; callbackAt?: number } = {}): void {
        const c = current.value
        const target = lead.value
        if (!c || !target) return
        const talkMs = c.answeredAt ? (c.endedAt ?? Date.now()) - c.answeredAt : 0
        const done = applyOutcome(target, outcome, settings.value, Date.now(), options)
        updateLead(target.id, () => done)
        data.value.attempts = [
            ...data.value.attempts.slice(-19_999),
            {
                leadId: target.id,
                at: Date.now(),
                answered: Boolean(c.answeredAt),
                talkMs,
                outcome,
                voicemail: c.voicemail || undefined
            }
        ]
        persist()
        useLogStore().add(
            c.accountId,
            'info',
            'event',
            `SDR: ${target.name || target.number} → ${t(`sdr.resultado_${outcome}`)}`
        )
        const hook = settings.value.webhook
        if (hook && isWebhookUrl(hook))
            void window.iris.sdr
                .webhook(hook, {
                    event: 'sdr.result',
                    lead: {
                        name: target.name,
                        number: target.number,
                        company: target.company,
                        segment: target.segment,
                        fields: target.fields
                    },
                    outcome,
                    note: done.note,
                    attempts: done.attempts,
                    talkSeconds: Math.round(talkMs / 1000),
                    callbackAt: options.callbackAt ? new Date(options.callbackAt).toISOString() : undefined,
                    summary: c.summary,
                    at: new Date().toISOString()
                })
                .catch((error: Error) =>
                    useToastsStore().show(t('sdr.webhook_falhou', { message: error.message }), 'bad')
                )
        current.value = null
        if (running.value) scheduleNext()
    }

    function scheduleNext(): void {
        const seconds = settings.value.advanceSeconds
        if (!seconds) return
        countdown.value = seconds
        timer = setInterval(() => {
            if (countdown.value === null) return
            countdown.value--
            if (countdown.value <= 0) void next()
        }, 1000)
    }

    /** Pula a pessoa nesta sessão, sem resultado: ela continua na fila para outro dia. */
    function skip(id: string): void {
        skipped.add(id)
    }

    /** Resumo da conversa pela IA, a partir da gravação (modo SDR com gravação ligada). */
    async function summarize(): Promise<void> {
        const c = current.value
        if (!c?.recording) return
        const status = await window.iris.ai.status()
        const model = status.model
        if (!status.hasKey || !model) {
            c.summaryError = t('sdr.resumo_sem_chave')
            return
        }
        c.summarizing = true
        c.summaryError = undefined
        const result = await window.iris.ai
            .summarize(model, c.recording)
            .catch((error: Error) => ({ ok: false as const, error: error.message }))
        if (current.value !== c) return
        c.summarizing = false
        if (result.ok) c.summary = result.text
        else c.summaryError = result.error
    }

    return {
        data,
        running,
        current,
        countdown,
        notice,
        settings,
        stats,
        lead,
        pending,
        opening,
        script,
        load,
        setSettings,
        importCsv,
        addText,
        removeLead,
        clearLeads,
        exportCsv,
        start,
        pause,
        next,
        interrupt,
        hangup,
        finish,
        skip,
        summarize,
        outcomes: OUTCOMES
    }
})
