// Modo SDR (pedido do usuário em 05/10/2026): uma fila de pessoas para ligar no dia, com a mesma
// abertura em todas as chamadas, detecção de caixa postal, resultado com um clique e o painel do dia.
// Aqui ficam as regras, sem tela nem rede, para os testes de unidade.

import { csvField, digits, plain, splitLine } from './contacts'

export type OutcomeId =
    | 'interessado'
    | 'reuniao'
    | 'sem_interesse'
    | 'ligar_depois'
    | 'nao_atendeu'
    | 'caixa_postal'
    | 'numero_errado'
    | 'nao_ligar'

/**
 * O que cada resultado faz com a pessoa na fila: `done` tira da fila; `retry` volta depois do
 * intervalo, até o limite de tentativas; `callback` volta na hora marcada. `success` conta como
 * conversão no painel. A ordem é a das teclas 1 a 8.
 */
export const OUTCOMES: { id: OutcomeId; next: 'done' | 'retry' | 'callback'; success?: boolean }[] = [
    { id: 'interessado', next: 'done', success: true },
    { id: 'reuniao', next: 'done', success: true },
    { id: 'sem_interesse', next: 'done' },
    { id: 'ligar_depois', next: 'callback' },
    { id: 'nao_atendeu', next: 'retry' },
    { id: 'caixa_postal', next: 'retry' },
    { id: 'numero_errado', next: 'done' },
    { id: 'nao_ligar', next: 'done' }
]
export const OUTCOME_IDS = OUTCOMES.map((o) => o.id)
export const isOutcome = (v: unknown): v is OutcomeId => OUTCOME_IDS.includes(v as OutcomeId)
export const isSuccess = (id: OutcomeId | undefined): boolean => OUTCOMES.some((o) => o.id === id && o.success)

export interface Lead {
    id: string
    name: string
    number: string
    company?: string
    /** Escolhe a abertura: a que tem o mesmo segmento, ou a padrão. */
    segment?: string
    /** As outras colunas da planilha, para as variáveis do roteiro ({cargo}, {cidade}…). */
    fields: Record<string, string>
    status: 'pending' | 'done'
    outcome?: OutcomeId
    note?: string
    attempts: number
    lastAt?: number
    /** Antes disso a pessoa não é chamada: nova tentativa ou retorno marcado. */
    nextAt?: number
}

export interface Opening {
    id: string
    /** Vazio é a abertura padrão. */
    segment: string
    /** Roteiro na tela, com variáveis: {nome}, {primeiro_nome}, {empresa}, {segmento}, {sdr} e as colunas da planilha. */
    script: string
    /** Gravação tocada ao atender (só em SIP puro e no simulado). */
    audio?: string
}

export type VoicemailAction = 'hangup' | 'message' | 'nothing'

export interface SdrSettings {
    accountId?: string
    openings: Opening[]
    /** Tocar a gravação da abertura quando a pessoa atende. */
    playOpening: boolean
    voicemail: { detect: boolean; action: VoicemailAction; audio?: string }
    /** Horário em que a fila liga: "09:00" a "18:00", nos dias da semana marcados (0 é domingo). */
    hours: { start: string; end: string; days: number[] }
    maxAttempts: number
    retryMinutes: number
    /** Segundos até ligar para a próxima depois do resultado; 0 espera a pessoa mandar. */
    advanceSeconds: number
    dailyGoal: number
    webhook?: string
    /** Grava as chamadas atendidas (SIP puro), para o resumo da IA. */
    record: boolean
}

/** Uma ligação feita pela fila, para o painel do dia e a exportação. */
export interface SdrAttempt {
    leadId: string
    at: number
    answered: boolean
    talkMs: number
    outcome?: OutcomeId
    voicemail?: boolean
}

export interface SdrData {
    schemaVersion: 1
    settings: SdrSettings
    leads: Lead[]
    attempts: SdrAttempt[]
}

export const LEADS_LIMIT = 5000
export const ATTEMPTS_LIMIT = 20_000

export const DEFAULT_SDR_SETTINGS: SdrSettings = {
    openings: [
        {
            id: 'padrao',
            segment: '',
            script: 'Oi, {primeiro_nome}, tudo bem? Aqui é {sdr}. Estou falando com você porque a {empresa}…'
        }
    ],
    playOpening: false,
    voicemail: { detect: true, action: 'hangup' },
    hours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
    maxAttempts: 3,
    retryMinutes: 60,
    advanceSeconds: 5,
    dailyGoal: 300,
    record: false
}

export const emptySdr = (): SdrData => ({
    schemaVersion: 1,
    settings: JSON.parse(JSON.stringify(DEFAULT_SDR_SETTINGS)) as SdrSettings,
    leads: [],
    attempts: []
})

// ─── Planilha ────────────────────────────────────────────────────────────

const LEAD_COLUMNS: Record<string, 'name' | 'number' | 'company' | 'segment'> = {
    nome: 'name',
    name: 'name',
    numero: 'number',
    telefone: 'number',
    fone: 'number',
    celular: 'number',
    number: 'number',
    phone: 'number',
    empresa: 'company',
    company: 'company',
    segmento: 'segment',
    segment: 'segment'
}
export const LEADS_CSV_HEADER = 'nome;numero;empresa;segmento'

export class LeadsCsvError extends Error {}

/** Nome de coluna como variável do roteiro: "Cargo Atual" vira "cargo_atual". */
export const fieldKey = (name: string): string =>
    plain(name)
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')

/** Lê a planilha da fila. Linhas sem número são puladas; números repetidos também. */
export function parseLeadsCsv(
    csv: string,
    newId: () => string,
    existing: Lead[] = []
): { leads: Lead[]; skipped: number; repeated: number } {
    const lines = csv
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim())
    if (lines.length < 2) throw new LeadsCsvError('A planilha precisa da linha de colunas e de pelo menos uma pessoa')
    const separator = [';', '\t', ','].find((s) => lines[0]!.includes(s)) ?? ';'
    const names = splitLine(lines[0]!, separator)
    const columns = names.map((name) => LEAD_COLUMNS[plain(name).trim()])
    if (!columns.includes('number'))
        throw new LeadsCsvError(`A primeira linha precisa da coluna numero. Exemplo: ${LEADS_CSV_HEADER}`)
    const seen = new Set(existing.map((l) => digits(l.number)))
    const leads: Lead[] = []
    let skipped = 0
    let repeated = 0
    for (const line of lines.slice(1, LEADS_LIMIT + 1)) {
        const values = splitLine(line, separator)
        const lead: Lead = { id: newId(), name: '', number: '', fields: {}, status: 'pending', attempts: 0 }
        values.forEach((value, i) => {
            const column = columns[i]
            if (column) lead[column] = value.slice(0, column === 'number' ? 64 : 200) || undefined!
            else if (names[i] && value) lead.fields[fieldKey(names[i]!)] = value.slice(0, 500)
        })
        lead.name ||= ''
        lead.number = digits(lead.number ?? '')
        if (!lead.number) {
            skipped++
            continue
        }
        if (seen.has(lead.number)) {
            repeated++
            continue
        }
        seen.add(lead.number)
        leads.push(lead)
    }
    return { leads, skipped, repeated }
}

// Número, ramal (2425) ou código do PBX (*97, 8000#): começa com +, *, # ou dígito.
const PHONE = /[+*#]?\(?\d[\d\s().*#-]*/

/**
 * Lista colada direto no painel, uma pessoa por linha: só o número, "nome número", "número nome" ou
 * "nome; número; empresa". O número é o primeiro trecho com dígitos; o resto vira nome e empresa.
 */
export function parseLeadsText(
    text: string,
    newId: () => string,
    existing: Lead[] = []
): { leads: Lead[]; skipped: number; repeated: number } {
    const seen = new Set(existing.map((l) => digits(l.number)))
    const leads: Lead[] = []
    let skipped = 0
    let repeated = 0
    for (const raw of text.split(/\r?\n/).slice(0, LEADS_LIMIT)) {
        const line = raw.trim()
        if (!line) continue
        const parts = line.split(/[;\t,]/).map((p) => p.trim())
        let number = ''
        let rest: string[] = []
        if (parts.length > 1) {
            const at = parts.findIndex((p) => PHONE.test(p) && digits(p).length >= 2 && !/[a-zA-Zà-ÿ]/.test(p))
            if (at >= 0) number = digits(parts[at]!)
            rest = parts.filter((_, i) => i !== at).filter(Boolean)
        } else {
            const match = PHONE.exec(line)
            if (match) {
                number = digits(match[0])
                rest = [line.replace(match[0], ' ').replace(/\s+/g, ' ').trim()].filter(Boolean)
            }
        }
        if (!number || number.length < 2) {
            skipped++
            continue
        }
        if (seen.has(number)) {
            repeated++
            continue
        }
        seen.add(number)
        leads.push({
            id: newId(),
            name: (rest[0] ?? '').slice(0, 200),
            number: number.slice(0, 64),
            company: rest[1]?.slice(0, 200) || undefined,
            fields: {},
            status: 'pending',
            attempts: 0
        })
    }
    return { leads, skipped, repeated }
}

/** A fila com o que aconteceu, para o CRM. */
export function leadsToCsv(leads: Lead[], outcomeName: (id: OutcomeId) => string): string {
    const extras = [...new Set(leads.flatMap((l) => Object.keys(l.fields)))]
    const header = [
        'nome',
        'numero',
        'empresa',
        'segmento',
        'situacao',
        'resultado',
        'tentativas',
        'ultima_ligacao',
        'proxima_ligacao',
        'observacao',
        ...extras
    ]
    const when = (t?: number): string => (t ? new Date(t).toISOString() : '')
    const rows = leads.map((l) =>
        [
            l.name,
            l.number,
            l.company,
            l.segment,
            l.status === 'done' ? 'concluida' : 'na_fila',
            l.outcome ? outcomeName(l.outcome) : '',
            String(l.attempts),
            when(l.lastAt),
            l.status === 'pending' ? when(l.nextAt) : '',
            l.note,
            ...extras.map((k) => l.fields[k])
        ]
            .map(csvField)
            .join(';')
    )
    return `${[header.join(';'), ...rows].join('\r\n')}\r\n`
}

// ─── Roteiro ─────────────────────────────────────────────────────────────

/** A abertura do segmento da pessoa; sem uma específica, a padrão (segmento vazio), ou a primeira. */
export function openingFor(openings: Opening[], lead: Pick<Lead, 'segment'>): Opening | undefined {
    const segment = plain(lead.segment ?? '').trim()
    return (
        (segment && openings.find((o) => plain(o.segment).trim() === segment)) ||
        openings.find((o) => !o.segment.trim()) ||
        openings[0]
    )
}

/** Troca as variáveis do roteiro. Variável sem valor fica como está, para quem escreveu ver o que faltou. */
export function fillScript(script: string, lead: Lead, sdr: string): string {
    const values: Record<string, string | undefined> = {
        ...lead.fields,
        nome: lead.name,
        primeiro_nome: lead.name.trim().split(/\s+/)[0],
        empresa: lead.company,
        segmento: lead.segment,
        numero: lead.number,
        sdr
    }
    return script.replace(/\{([\w]+)\}/g, (whole, name: string) => values[fieldKey(name)] || whole)
}

// ─── Fila ────────────────────────────────────────────────────────────────

const minutesOf = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
}
export const isHhMm = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

/** A fila só liga dentro do horário e nos dias marcados (as regras de cada lugar sobre ligações de venda). */
export function withinHours(hours: SdrSettings['hours'], date: Date): boolean {
    if (!hours.days.includes(date.getDay())) return false
    const now = date.getHours() * 60 + date.getMinutes()
    return now >= minutesOf(hours.start) && now < minutesOf(hours.end)
}

/**
 * A próxima pessoa: primeiro quem tem retorno ou nova tentativa vencida (a mais antiga primeiro),
 * depois quem nunca foi chamado, na ordem da planilha. `waiting` é a próxima hora marcada, para a
 * tela dizer quando a fila volta a ter alguém.
 */
export function nextLead(leads: Lead[], now: number, skip: Set<string> = new Set()): { lead?: Lead; waiting?: number } {
    const pending = leads.filter((l) => l.status === 'pending' && !skip.has(l.id))
    const due = pending.filter((l) => l.nextAt !== undefined && l.nextAt <= now).sort((a, b) => a.nextAt! - b.nextAt!)
    if (due[0]) return { lead: due[0] }
    const fresh = pending.find((l) => l.nextAt === undefined && l.attempts === 0)
    if (fresh) return { lead: fresh }
    const later = pending.filter((l) => l.nextAt !== undefined).map((l) => l.nextAt!)
    return { waiting: later.length ? Math.min(...later) : undefined }
}

/** O que o resultado faz com a pessoa: sai da fila, volta depois do intervalo ou na hora marcada. */
export function applyOutcome(
    lead: Lead,
    outcome: OutcomeId,
    settings: Pick<SdrSettings, 'maxAttempts' | 'retryMinutes'>,
    now: number,
    options: { note?: string; callbackAt?: number } = {}
): Lead {
    const rule = OUTCOMES.find((o) => o.id === outcome)!
    const next: Lead = { ...lead, outcome, note: options.note?.trim() || lead.note, lastAt: now }
    if (rule.next === 'callback' && options.callbackAt && options.callbackAt > now)
        return { ...next, status: 'pending', nextAt: options.callbackAt }
    if (rule.next === 'retry' && next.attempts < settings.maxAttempts)
        return { ...next, status: 'pending', nextAt: now + settings.retryMinutes * 60_000 }
    return { ...next, status: 'done', nextAt: undefined }
}

export interface DayStats {
    dialed: number
    answered: number
    /** Atendidas com 30 s ou mais de conversa. */
    conversations: number
    successes: number
    voicemails: number
    talkMs: number
}

const CONVERSATION_MS = 30_000

export function dayStats(attempts: SdrAttempt[], now: number): DayStats {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const today = attempts.filter((a) => a.at >= start.getTime() && a.at <= now)
    return {
        dialed: today.length,
        answered: today.filter((a) => a.answered && !a.voicemail).length,
        conversations: today.filter((a) => a.answered && !a.voicemail && a.talkMs >= CONVERSATION_MS).length,
        successes: today.filter((a) => isSuccess(a.outcome)).length,
        voicemails: today.filter((a) => a.voicemail).length,
        talkMs: today.reduce((sum, a) => sum + (a.answered ? a.talkMs : 0), 0)
    }
}

// ─── Quem atendeu: gente ou caixa postal ─────────────────────────────────

export type AnswerKind = 'human' | 'machine' | 'silent'

/**
 * Decide, pelo volume do que chega logo depois do atendimento, se do outro lado há uma pessoa ou uma
 * caixa postal. Uma pessoa diz "Alô?" (fala curta) e para, esperando resposta; a caixa postal fala
 * sem parar por vários segundos. Silêncio no começo é tratado como pessoa que não falou nada.
 * Recebe uma medida a cada ~250 ms; devolve a decisão uma vez, ou undefined enquanto não sabe.
 */
export class AnswerDetector {
    private speechMs = 0
    private silenceMs = 0
    private heard = false
    private elapsed = 0
    private decided = false

    constructor(
        private readonly options = {
            /** Volume que conta como voz, em dBFS. */
            speechDb: -45,
            /** Fala sem pausa por mais que isso é caixa postal. */
            machineMs: 3500,
            /** Pausa depois de falar que encerra o "Alô?". */
            pauseMs: 600,
            /** Sem ouvir nada por este tempo: alguém atendeu e ficou quieto. */
            silentMs: 2500
        }
    ) {}

    push(stepMs: number, db: number): AnswerKind | undefined {
        if (this.decided) return undefined
        this.elapsed += stepMs
        if (db > this.options.speechDb) {
            this.heard = true
            this.speechMs += stepMs
            this.silenceMs = 0
            if (this.speechMs >= this.options.machineMs) return this.decide('machine')
        } else {
            this.silenceMs += stepMs
            if (this.heard && this.silenceMs >= this.options.pauseMs) return this.decide('human')
            if (!this.heard && this.elapsed >= this.options.silentMs) return this.decide('silent')
        }
        return undefined
    }

    private decide(kind: AnswerKind): AnswerKind {
        this.decided = true
        return kind
    }
}

/**
 * Depois da saudação da caixa postal vem o bipe e o silêncio: é a hora de deixar o recado. Conta o
 * silêncio seguido; com 1 s dele, devolve true uma vez.
 */
export class BeepWaiter {
    private silenceMs = 0
    private done = false
    push(stepMs: number, db: number): boolean {
        if (this.done) return false
        this.silenceMs = db > -45 ? 0 : this.silenceMs + stepMs
        if (this.silenceMs >= 1000) this.done = true
        return this.done
    }
}

// ─── Arquivo ─────────────────────────────────────────────────────────────

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const optText = (v: unknown, max: number): boolean => v === undefined || isText(v, max)
const isInt = (v: unknown, min: number, max: number): boolean =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isTime = (v: unknown): boolean => v === undefined || (typeof v === 'number' && Number.isFinite(v))

export function isLead(v: unknown): v is Lead {
    if (!v || typeof v !== 'object') return false
    const l = v as Record<string, unknown>
    const fields = l.fields as Record<string, unknown> | undefined
    return (
        isText(l.id, 200) &&
        isText(l.name, 200) &&
        isText(l.number, 64) &&
        optText(l.company, 200) &&
        optText(l.segment, 200) &&
        !!fields &&
        typeof fields === 'object' &&
        Object.keys(fields).length <= 50 &&
        Object.values(fields).every((f) => isText(f, 500)) &&
        (l.status === 'pending' || l.status === 'done') &&
        (l.outcome === undefined || isOutcome(l.outcome)) &&
        optText(l.note, 2000) &&
        isInt(l.attempts, 0, 1000) &&
        isTime(l.lastAt) &&
        isTime(l.nextAt)
    )
}

const isAttempt = (v: unknown): v is SdrAttempt => {
    if (!v || typeof v !== 'object') return false
    const a = v as Record<string, unknown>
    return (
        isText(a.leadId, 200) &&
        typeof a.at === 'number' &&
        typeof a.answered === 'boolean' &&
        typeof a.talkMs === 'number' &&
        (a.outcome === undefined || isOutcome(a.outcome)) &&
        (a.voicemail === undefined || typeof a.voicemail === 'boolean')
    )
}

export function isSdrSettings(v: unknown): v is SdrSettings {
    if (!v || typeof v !== 'object') return false
    const s = v as Record<string, unknown>
    const vm = s.voicemail as Record<string, unknown> | undefined
    const hours = s.hours as Record<string, unknown> | undefined
    return (
        optText(s.accountId, 200) &&
        Array.isArray(s.openings) &&
        s.openings.length <= 50 &&
        s.openings.every(
            (o: Record<string, unknown>) =>
                !!o && isText(o.id, 100) && isText(o.segment, 200) && isText(o.script, 5000) && optText(o.audio, 2000)
        ) &&
        typeof s.playOpening === 'boolean' &&
        !!vm &&
        typeof vm.detect === 'boolean' &&
        ['hangup', 'message', 'nothing'].includes(vm.action as string) &&
        optText(vm.audio, 2000) &&
        !!hours &&
        isHhMm(hours.start) &&
        isHhMm(hours.end) &&
        Array.isArray(hours.days) &&
        hours.days.every((d) => isInt(d, 0, 6)) &&
        isInt(s.maxAttempts, 1, 20) &&
        isInt(s.retryMinutes, 1, 7 * 24 * 60) &&
        isInt(s.advanceSeconds, 0, 120) &&
        isInt(s.dailyGoal, 0, 10_000) &&
        optText(s.webhook, 2000) &&
        typeof s.record === 'boolean'
    )
}

export function isSdrData(v: unknown): v is SdrData {
    if (!v || typeof v !== 'object') return false
    const d = v as Record<string, unknown>
    return (
        d.schemaVersion === 1 &&
        isSdrSettings(d.settings) &&
        Array.isArray(d.leads) &&
        d.leads.length <= LEADS_LIMIT &&
        d.leads.every(isLead) &&
        Array.isArray(d.attempts) &&
        d.attempts.length <= ATTEMPTS_LIMIT &&
        d.attempts.every(isAttempt)
    )
}

/** O que vai para o webhook a cada resultado, para o CRM. */
export interface SdrWebhookPayload {
    event: 'sdr.result'
    lead: { name: string; number: string; company?: string; segment?: string; fields: Record<string, string> }
    outcome: OutcomeId
    note?: string
    attempts: number
    talkSeconds: number
    callbackAt?: string
    summary?: string
    at: string
}

export function isSdrWebhookPayload(v: unknown): v is SdrWebhookPayload {
    if (!v || typeof v !== 'object') return false
    const p = v as Record<string, unknown>
    const lead = p.lead as Record<string, unknown> | undefined
    return (
        p.event === 'sdr.result' &&
        !!lead &&
        isText(lead.name, 200) &&
        isText(lead.number, 64) &&
        isOutcome(p.outcome) &&
        optText(p.note, 2000) &&
        optText(p.summary, 5000) &&
        typeof p.attempts === 'number' &&
        typeof p.talkSeconds === 'number' &&
        isText(p.at, 40) &&
        JSON.stringify(p).length < 20_000
    )
}
