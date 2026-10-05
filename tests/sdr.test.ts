import { describe, expect, it } from 'vitest'
import {
    AnswerDetector,
    applyOutcome,
    BeepWaiter,
    dayStats,
    DEFAULT_SDR_SETTINGS,
    emptySdr,
    fillScript,
    isSdrData,
    isSdrWebhookPayload,
    leadsToCsv,
    nextLead,
    openingFor,
    parseLeadsCsv,
    parseLeadsText,
    withinHours,
    type Lead
} from '../src/shared/sdr'
import { isModeSettings, modeOn, secretTap } from '../src/shared/modes'

let n = 0
const id = (): string => `l${++n}`
const lead = (over: Partial<Lead> = {}): Lead => ({
    id: id(),
    name: 'Ana Souza',
    number: '1002',
    fields: {},
    status: 'pending',
    attempts: 0,
    ...over
})

describe('modo SDR: planilha', () => {
    it('lê nome, número, empresa, segmento e as outras colunas como variáveis', () => {
        const { leads, skipped, repeated } = parseLeadsCsv(
            'Nome;Telefone;Empresa;Segmento;Cargo Atual\nAna Souza;(11) 3000-0001;Acme;varejo;Gerente\n;sem número;;\nBeto;11 3000-0001;;;\nCaio;1003;;;',
            id
        )
        expect(leads.map((l) => [l.name, l.number, l.company, l.segment, l.fields.cargo_atual])).toEqual([
            ['Ana Souza', '1130000001', 'Acme', 'varejo', 'Gerente'],
            ['Caio', '1003', undefined, undefined, undefined]
        ])
        expect(skipped).toBe(1)
        expect(repeated).toBe(1)
    })

    it('não repete quem já está na fila e exige a coluna de número', () => {
        const first = parseLeadsCsv('nome,numero\nAna,1002', id).leads
        expect(parseLeadsCsv('nome,numero\nAna,1002\nBia,1003', id, first).leads.map((l) => l.name)).toEqual(['Bia'])
        expect(() => parseLeadsCsv('nome;empresa\nAna;Acme', id)).toThrow('coluna numero')
    })

    it('exporta com o resultado e as colunas extras', () => {
        const csv = leadsToCsv(
            [lead({ outcome: 'reuniao', status: 'done', attempts: 2, note: 'quinta; 10h', fields: { cargo: 'CEO' } })],
            (o) => o.toUpperCase()
        )
        expect(csv.split('\r\n')[0]).toContain(';observacao;cargo')
        expect(csv).toContain('Ana Souza;1002;;;concluida;REUNIAO;2;')
        expect(csv).toContain('"quinta; 10h";CEO')
    })
})

describe('modo SDR: lista colada no painel', () => {
    it('aceita só o número, nome e número em qualquer ordem, e nome; número; empresa', () => {
        const { leads, skipped, repeated } = parseLeadsText(
            '1002\nAna Lima 11 3000-0001\n(11) 3000-0002 Beto\nCaio; +55 11 3000-0003; Acme\n\nsó nome\n1002\n12',
            id
        )
        expect(leads.map((l) => [l.name, l.number, l.company])).toEqual([
            ['', '1002', undefined],
            ['Ana Lima', '1130000001', undefined],
            ['Beto', '1130000002', undefined],
            ['Caio', '+551130000003', 'Acme'],
            ['', '12', undefined]
        ])
        expect(skipped).toBe(1)
        expect(repeated).toBe(1)
    })

    it('aceita ramais e códigos do PBX', () => {
        const { leads } = parseLeadsText('2425\nVini 2426\n*97\n12\n8000#', id)
        expect(leads.map((l) => [l.name, l.number])).toEqual([
            ['', '2425'],
            ['Vini', '2426'],
            ['', '*97'],
            ['', '12'],
            ['', '8000#']
        ])
    })
})

describe('modo SDR: roteiro', () => {
    const openings = [
        { id: 'a', segment: '', script: 'padrão' },
        { id: 'b', segment: 'Varejo', script: 'varejo' }
    ]

    it('escolhe a abertura do segmento, sem diferenciar acento e maiúscula, ou a padrão', () => {
        expect(openingFor(openings, { segment: 'varejo' })?.id).toBe('b')
        expect(openingFor(openings, { segment: 'indústria' })?.id).toBe('a')
        expect(openingFor(openings, {})?.id).toBe('a')
    })

    it('troca as variáveis e deixa à vista a que não tem valor', () => {
        const text = fillScript(
            'Oi {primeiro_nome}, da {empresa}? Sou {sdr}. Vi que você é {Cargo}. {cidade}',
            lead({ company: 'Acme', fields: { cargo: 'gerente' } }),
            'Paulo'
        )
        expect(text).toBe('Oi Ana, da Acme? Sou Paulo. Vi que você é gerente. {cidade}')
    })
})

describe('modo SDR: fila', () => {
    const now = new Date(2026, 9, 5, 10, 0).getTime()

    it('liga só no horário e nos dias marcados', () => {
        const hours = DEFAULT_SDR_SETTINGS.hours
        expect(withinHours(hours, new Date(2026, 9, 5, 10, 0))).toBe(true) // segunda, 10h
        expect(withinHours(hours, new Date(2026, 9, 5, 8, 59))).toBe(false)
        expect(withinHours(hours, new Date(2026, 9, 5, 18, 0))).toBe(false)
        expect(withinHours(hours, new Date(2026, 9, 4, 10, 0))).toBe(false) // domingo
    })

    it('retorno vencido vem antes de quem nunca foi chamado; futuro espera', () => {
        const fresh = lead({ name: 'nova' })
        const due = lead({ name: 'retorno', attempts: 1, nextAt: now - 1000 })
        const later = lead({ name: 'depois', attempts: 1, nextAt: now + 60_000 })
        const done = lead({ name: 'feita', status: 'done' })
        expect(nextLead([fresh, later, due, done], now).lead?.name).toBe('retorno')
        expect(nextLead([fresh, later, done], now).lead?.name).toBe('nova')
        expect(nextLead([later, done], now)).toEqual({ waiting: now + 60_000 })
        expect(nextLead([fresh], now, new Set([fresh.id]))).toEqual({ waiting: undefined })
    })

    it('o resultado tira da fila, marca nova tentativa ou retorno', () => {
        const settings = { maxAttempts: 3, retryMinutes: 60 }
        expect(applyOutcome(lead({ attempts: 1 }), 'reuniao', settings, now)).toMatchObject({ status: 'done' })
        expect(applyOutcome(lead({ attempts: 1 }), 'nao_atendeu', settings, now)).toMatchObject({
            status: 'pending',
            nextAt: now + 3_600_000
        })
        expect(applyOutcome(lead({ attempts: 3 }), 'caixa_postal', settings, now).status).toBe('done')
        expect(
            applyOutcome(lead({ attempts: 1 }), 'ligar_depois', settings, now, {
                callbackAt: now + 5000,
                note: ' amanhã '
            })
        ).toMatchObject({ status: 'pending', nextAt: now + 5000, note: 'amanhã' })
        // "Ligar depois" sem hora válida não deixa a pessoa presa na fila.
        expect(applyOutcome(lead({ attempts: 1 }), 'ligar_depois', settings, now).status).toBe('done')
    })

    it('o painel conta só as ligações de hoje', () => {
        const yesterday = now - 24 * 3_600_000
        const stats = dayStats(
            [
                { leadId: 'a', at: now - 1000, answered: true, talkMs: 45_000, outcome: 'reuniao' },
                { leadId: 'b', at: now - 2000, answered: true, talkMs: 10_000, outcome: 'sem_interesse' },
                { leadId: 'c', at: now - 3000, answered: true, talkMs: 8000, voicemail: true, outcome: 'caixa_postal' },
                { leadId: 'd', at: now - 4000, answered: false, talkMs: 0, outcome: 'nao_atendeu' },
                { leadId: 'e', at: yesterday, answered: true, talkMs: 99_000, outcome: 'interessado' }
            ],
            now
        )
        expect(stats).toEqual({
            dialed: 4,
            answered: 2,
            conversations: 1,
            successes: 1,
            voicemails: 1,
            talkMs: 63_000
        })
    })
})

describe('modo SDR: gente ou caixa postal', () => {
    const run = (levels: number[]): string | undefined => {
        const detector = new AnswerDetector()
        for (const db of levels) {
            const kind = detector.push(250, db)
            if (kind) return kind
        }
        return undefined
    }
    const voice = (ms: number): number[] => Array(ms / 250).fill(-20)
    const quiet = (ms: number): number[] => Array(ms / 250).fill(-90)

    it('"Alô?" e pausa é gente', () => expect(run([...quiet(500), ...voice(750), ...quiet(1000)])).toBe('human'))
    it('fala longa sem pausa é caixa postal', () => expect(run(voice(5000))).toBe('machine'))
    it('ninguém fala nada: atendeu em silêncio', () => expect(run(quiet(3000))).toBe('silent'))
    it('linha com ruído de fundo: "Alô?" e pausa continua sendo gente', () => {
        // Fundo a -38 dBFS (mais alto que o antigo limite fixo de -45) e voz a -18.
        const noisy = (ms: number): number[] => Array.from({ length: ms / 250 }, (_, i) => -38 + (i % 2))
        const hello = Array(4).fill(-18)
        expect(run([...noisy(500), ...hello, ...noisy(1000)])).toBe('human')
    })

    it('saudação longa com quedas curtas entre as palavras é caixa postal', () => {
        const greeting = Array.from({ length: 24 }, (_, i) => (i % 5 === 4 ? -60 : -20))
        expect(run([-60, ...greeting])).toBe('machine')
    })

    it('fala, pausa curta e mais fala: duas frases de gente não somam como caixa postal', () => {
        const detector = new AnswerDetector()
        const levels = [-60, ...voice(1500), ...quiet(500), ...voice(2750)]
        expect(levels.map((db) => detector.push(250, db)).find(Boolean)).toBeUndefined()
        expect(detector.summary).toMatch(/^fala 2\.8 s, pausa 0\.0 s, ruído -90 dBFS$/)
    })

    it('decide uma vez só', () => {
        const detector = new AnswerDetector()
        voice(4000).forEach((db) => detector.push(250, db))
        expect(detector.push(250, -20)).toBeUndefined()
    })

    it('o recado sai depois do bipe, com 1 s de silêncio', () => {
        const waiter = new BeepWaiter()
        expect([...voice(1000), ...quiet(750)].some((db) => waiter.push(250, db))).toBe(false)
        expect(waiter.push(250, -90)).toBe(true)
        expect(waiter.push(250, -90)).toBe(false)
    })
})

describe('modo SDR: arquivo e webhook', () => {
    it('confere o arquivo antes de gravar', () => {
        const data = emptySdr()
        data.leads.push(lead())
        data.attempts.push({ leadId: 'x', at: 1, answered: false, talkMs: 0 })
        expect(isSdrData(data)).toBe(true)
        expect(isSdrData({ ...data, schemaVersion: 2 })).toBe(false)
        expect(isSdrData({ ...data, leads: [{ ...lead(), status: 'talvez' }] })).toBe(false)
        expect(
            isSdrData({ ...data, settings: { ...data.settings, hours: { start: '9h', end: '18:00', days: [] } } })
        ).toBe(false)
        expect(isSdrData({ ...data, settings: { ...data.settings, maxAttempts: 0 } })).toBe(false)
    })

    it('webhook só com o formato esperado', () => {
        const payload = {
            event: 'sdr.result',
            lead: { name: 'Ana', number: '1002', fields: {} },
            outcome: 'reuniao',
            attempts: 1,
            talkSeconds: 40,
            at: new Date(0).toISOString()
        }
        expect(isSdrWebhookPayload(payload)).toBe(true)
        expect(isSdrWebhookPayload({ ...payload, outcome: 'venda' })).toBe(false)
        expect(isSdrWebhookPayload({ ...payload, event: 'outro' })).toBe(false)
    })
})

describe('modos', () => {
    it('tudo desligado por padrão, até ligar', () => {
        expect(modeOn(undefined, 'log')).toBe(false)
        expect(modeOn({ enabled: { log: true } }, 'log')).toBe(true)
        expect(isModeSettings({ enabled: { sdr: true }, unlocked: true })).toBe(true)
        expect(isModeSettings({ enabled: { voar: true } })).toBe(false)
        expect(isModeSettings({ outro: 1 })).toBe(false)
    })

    it('cinco cliques rápidos no logo abrem a área secreta', () => {
        let taps: number[] = []
        let open = false
        for (const t of [0, 300, 600, 900]) ({ taps, open } = secretTap(taps, t))
        expect(open).toBe(false)
        expect(secretTap(taps, 1200).open).toBe(true)
        // Cliques espaçados não contam.
        taps = []
        for (const t of [0, 3000, 6000, 9000, 12000]) ({ taps, open } = secretTap(taps, t))
        expect(open).toBe(false)
    })
})
