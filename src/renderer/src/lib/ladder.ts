// Diagrama de escada: transforma as linhas do SIP bruto em diálogos (agrupados por Call-ID) e em
// setas entre a conta e o PBX. É só leitura do log; nada aqui fala com a rede.

import { stripCredentials } from '@shared/ai'

export interface LadderSource {
    id: number
    ts: number
    accountId: string | null
    text: string
}

export type Severity = 'request' | 'provisional' | 'ok' | 'auth' | 'error'

export interface LadderMessage {
    /** Id da linha do log de onde veio. */
    entryId: number
    ts: number
    accountId: string
    /** `out`: a conta mandou para o PBX; `in`: o PBX mandou para a conta. */
    dir: 'out' | 'in'
    /** Método (INVITE) ou código e frase (486 Busy Here). */
    label: string
    method?: string
    status?: number
    cseq: { seq: number; method: string }
    callId: string
    severity: Severity
    /** Mesma mensagem já vista antes, no mesmo sentido: o outro lado não recebeu ou não respondeu a tempo. */
    retransmission: boolean
    /** Usuário do outro lado: o destino do pedido que sai, ou o From do que chega. */
    peer?: string
    /** Texto da mensagem, como veio no log (já sem credenciais, RNF-10). */
    raw: string
}

export interface Dialog {
    /** Conta + Call-ID: a mesma chamada vista por duas contas aparece como dois diálogos. */
    key: string
    accountId: string
    callId: string
    /** Método que abriu o diálogo (INVITE, REGISTER, OPTIONS…). */
    method: string
    direction: 'out' | 'in'
    /** Número do outro lado, quando o pedido que abriu o diálogo diz. */
    peer?: string
    start: number
    end: number
    /** Resposta final ao pedido que abriu o diálogo, ou null se não houve. */
    final: { status: number; reason: string } | null
    messages: LadderMessage[]
}

const REQUEST_LINE = /^([A-Z][A-Z-]*) (\S+) SIP\/2\.0\s*$/
const STATUS_LINE = /^SIP\/2\.0 (\d{3})(?: (.*))?$/

/** Direção pelo texto que o SIP.js (ou o motor simulado) põe antes da mensagem. */
function directionOf(text: string): 'out' | 'in' | null {
    const head = text.trimStart()
    if (head.startsWith('→') || /^Sending WebSocket message/i.test(head)) return 'out'
    if (head.startsWith('←') || /^Received WebSocket (?:text )?message/i.test(head)) return 'in'
    return null
}

function headerValue(lines: string[], names: string[]): string | undefined {
    for (const line of lines) {
        const colon = line.indexOf(':')
        if (colon <= 0) continue
        if (names.includes(line.slice(0, colon).trim().toLowerCase())) return line.slice(colon + 1).trim()
    }
    return undefined
}

function severityOf(status: number | undefined): Severity {
    if (status === undefined) return 'request'
    if (status < 200) return 'provisional'
    if (status === 401 || status === 407) return 'auth'
    if (status >= 400) return 'error'
    return 'ok'
}

/** Lê uma linha do SIP bruto. Devolve null para o que não é mensagem SIP com Call-ID e CSeq. */
export function parseSipEntry(entry: LadderSource): LadderMessage | null {
    if (!entry.accountId) return null
    const dir = directionOf(entry.text)
    if (!dir) return null
    const lines = entry.text.split(/\r?\n/)
    const startIndex = lines.findIndex((line) => {
        const clean = line.replace(/^\s*[→←]\s*/, '')
        return REQUEST_LINE.test(clean) || STATUS_LINE.test(clean)
    })
    if (startIndex < 0) return null
    const start = lines[startIndex]!.replace(/^\s*[→←]\s*/, '').trim()
    const end = lines.findIndex((line, i) => i > startIndex && line.trim() === '')
    const headers = lines.slice(startIndex + 1, end < 0 ? undefined : end)

    const callId = headerValue(headers, ['call-id', 'i'])
    const cseqText = headerValue(headers, ['cseq'])
    if (!callId || !cseqText) return null
    const [seq, cseqMethod] = cseqText.split(/\s+/)
    const cseq = { seq: Number(seq), method: (cseqMethod ?? '').toUpperCase() }

    const request = REQUEST_LINE.exec(start)
    const response = STATUS_LINE.exec(start)
    const status = response ? Number(response[1]) : undefined
    const label = request ? request[1]! : `${status} ${response?.[2] ?? ''}`.trim()
    const body = [start, ...lines.slice(startIndex + 1)].join('\n').trimEnd()
    const userOf = (uri: string | undefined): string | undefined => /sips?:([^@;>]+)@/i.exec(uri ?? '')?.[1]
    const peer = request
        ? dir === 'out'
            ? userOf(request[2])
            : userOf(headerValue(headers, ['from', 'f']))
        : undefined
    return {
        entryId: entry.id,
        ts: entry.ts,
        accountId: entry.accountId,
        dir,
        label,
        method: request?.[1],
        status,
        cseq,
        callId,
        severity: severityOf(status),
        retransmission: false,
        peer,
        raw: body
    }
}

/** Agrupa as mensagens em diálogos, do mais antigo para o mais novo. */
export function buildDialogs(entries: LadderSource[]): Dialog[] {
    const dialogs = new Map<string, Dialog>()
    const seen = new Map<string, Set<string>>()
    for (const entry of entries) {
        const message = parseSipEntry(entry)
        if (!message) continue
        const key = `${message.accountId}|${message.callId}`
        let dialog = dialogs.get(key)
        if (!dialog) {
            dialog = {
                key,
                accountId: message.accountId,
                callId: message.callId,
                method: message.method ?? message.cseq.method,
                direction: message.dir,
                peer: message.peer,
                start: message.ts,
                end: message.ts,
                final: null,
                messages: []
            }
            dialogs.set(key, dialog)
            seen.set(key, new Set())
        }
        // Mesma linha inicial, mesmo CSeq e mesmo sentido: é a mesma mensagem enviada de novo.
        const fingerprint = `${message.dir}|${message.label}|${message.cseq.seq}|${message.cseq.method}`
        const known = seen.get(key)!
        message.retransmission = known.has(fingerprint)
        known.add(fingerprint)

        dialog.messages.push(message)
        dialog.end = message.ts
        // A resposta final que conta é a do pedido que abriu o diálogo (o 401 do desafio fica para trás).
        if (message.status !== undefined && message.status >= 200 && message.cseq.method === dialog.method)
            dialog.final = { status: message.status, reason: message.label.slice(4) }
    }
    return [...dialogs.values()].sort((a, b) => a.start - b.start)
}

/** Resumo de uma linha, como "INVITE → 486 Busy Here". */
export function describeDialog(dialog: Dialog): string {
    const result = dialog.final ? `${dialog.final.status} ${dialog.final.reason}`.trim() : 'sem resposta final'
    return `${dialog.method} → ${result}`
}

/** Com quem foi, como "para 8000" ou "de 1001". */
export function dialogPeer(dialog: Dialog): string {
    if (!dialog.peer || dialog.method === 'REGISTER') return ''
    return `${dialog.direction === 'out' ? 'para' : 'de'} ${dialog.peer}`
}

export function dialogFailed(dialog: Dialog): boolean {
    if (!dialog.final) return false
    // Desligar antes de atender (487) é um fim normal da chamada, não uma falha.
    return dialog.final.status >= 400 && dialog.final.status !== 487
}

// ─── Desenho ─────────────────────────────────────────────────────────────────

export interface LadderColumn {
    x: number
    label: string
    sublabel: string
    /** Conta da coluna, ou null para o PBX. */
    accountId: string | null
}

export interface LadderRow {
    message: LadderMessage
    y: number
    x1: number
    x2: number
    /** Milissegundos desde a primeira mensagem do desenho. */
    offsetMs: number
}

export interface LadderLayout {
    width: number
    height: number
    top: number
    columns: LadderColumn[]
    rows: LadderRow[]
}

export const LADDER = { columnGap: 240, margin: 120, top: 56, rowHeight: 34, bottom: 24 }

/**
 * Posições das colunas e das setas. O PBX fica no meio; cada conta, de um lado, na ordem em que
 * apareceu. Com duas contas da mesma chamada, a escada mostra as duas pernas: A → PBX → B.
 */
export function layoutLadder(
    dialogs: Dialog[],
    describeAccount: (accountId: string) => { label: string; sublabel: string },
    pbxLabel: string
): LadderLayout {
    const accountIds = [...new Set(dialogs.map((d) => d.accountId))]
    const pbxIndex = Math.ceil(accountIds.length / 2)
    const order: (string | null)[] = [...accountIds]
    order.splice(pbxIndex, 0, null)
    const columns: LadderColumn[] = order.map((accountId, i) => ({
        x: LADDER.margin + i * LADDER.columnGap,
        accountId,
        ...(accountId ? describeAccount(accountId) : { label: 'PBX', sublabel: pbxLabel })
    }))
    const pbx = columns.find((c) => c.accountId === null)!
    const messages = dialogs.flatMap((d) => d.messages).sort((a, b) => a.ts - b.ts || a.entryId - b.entryId)
    const first = messages[0]?.ts ?? 0
    const rows = messages.map((message, i) => {
        const account = columns.find((c) => c.accountId === message.accountId)!
        const [x1, x2] = message.dir === 'out' ? [account.x, pbx.x] : [pbx.x, account.x]
        return { message, x1, x2, y: LADDER.top + (i + 1) * LADDER.rowHeight, offsetMs: message.ts - first }
    })
    return {
        width: LADDER.margin * 2 + (columns.length - 1) * LADDER.columnGap,
        height: LADDER.top + (rows.length + 1) * LADDER.rowHeight + LADDER.bottom,
        top: LADDER.top,
        columns,
        rows
    }
}

export function formatOffset(ms: number): string {
    return ms < 1000 ? `+${ms} ms` : `+${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1).replace('.', ',')} s`
}

export const SEVERITY_COLORS: Record<Severity, string> = {
    request: '#9fb6ff',
    provisional: '#8597a9',
    ok: '#3fcf86',
    auth: '#f0b13e',
    error: '#f0675e'
}

// ─── Exportação ──────────────────────────────────────────────────────────────

const escapeHtml = (text: string): string =>
    text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** SVG do diagrama, como texto, para o arquivo exportado. */
export function ladderSvg(layout: LadderLayout): string {
    const parts: string[] = []
    for (const c of layout.columns) {
        parts.push(
            `<text x="${c.x}" y="20" class="col">${escapeHtml(c.label)}</text>`,
            `<text x="${c.x}" y="36" class="sub">${escapeHtml(c.sublabel)}</text>`,
            `<line x1="${c.x}" y1="${layout.top}" x2="${c.x}" y2="${layout.height - LADDER.bottom}" class="life"/>`
        )
    }
    for (const [i, row] of layout.rows.entries()) {
        const color = SEVERITY_COLORS[row.message.severity]
        const dir = row.x2 > row.x1 ? 1 : -1
        const tip = row.x2 - dir * 2
        const dash = row.message.retransmission ? ' stroke-dasharray="5 4"' : ''
        const label = `${row.message.label}${row.message.retransmission ? ' (de novo)' : ''}`
        parts.push(
            `<a href="#m${i + 1}"><g>`,
            `<text x="8" y="${row.y + 4}" class="time">${formatOffset(row.offsetMs)}</text>`,
            `<line x1="${row.x1}" y1="${row.y}" x2="${tip}" y2="${row.y}" stroke="${color}" stroke-width="1.6"${dash}/>`,
            `<path d="M${row.x2} ${row.y} l${-dir * 8} -4 v8 z" fill="${color}"/>`,
            `<text x="${(row.x1 + row.x2) / 2}" y="${row.y - 6}" fill="${color}" class="msg">${escapeHtml(label)}</text>`,
            `</g></a>`
        )
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">${parts.join('')}</svg>`
}

/** Página HTML independente, para anexar num chamado: o diagrama e cada mensagem por extenso. */
export function ladderHtml(layout: LadderLayout, title: string, summary: string[]): string {
    const messages = layout.rows
        .map(
            (row, i) =>
                `<details id="m${i + 1}"><summary>${i + 1}. ${formatOffset(row.offsetMs)} · ${escapeHtml(
                    layout.columns.find((c) => c.accountId === row.message.accountId)?.label ?? ''
                )} ${row.message.dir === 'out' ? '→' : '←'} ${escapeHtml(row.message.label)}${
                    row.message.retransmission ? ' (de novo)' : ''
                }</summary><pre>${escapeHtml(stripCredentials(row.message.raw))}</pre></details>`
        )
        .join('\n')
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: system-ui, sans-serif; background: #0b1117; color: #dbe4ee; margin: 24px; }
h1 { font-size: 18px; }
ul { color: #8597a9; }
.ladder { overflow-x: auto; background: #111a23; border: 1px solid #263442; border-radius: 8px; padding: 8px; }
svg text { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
svg .col { fill: #dbe4ee; font-weight: 600; text-anchor: middle; font-family: system-ui, sans-serif; font-size: 13px; }
svg .sub { fill: #8597a9; text-anchor: middle; }
svg .life { stroke: #263442; stroke-width: 2; }
svg .time { fill: #7f8f9f; }
svg .msg { text-anchor: middle; }
details { margin: 4px 0; }
summary { cursor: pointer; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
pre { background: #111a23; border: 1px solid #263442; padding: 8px; overflow-x: auto; font-size: 12px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<ul>${summary.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
<div class="ladder">${ladderSvg(layout)}</div>
<h2>Mensagens</h2>
${messages}
<p style="color:#7f8f9f">Gerado pela Íris. Senhas, Authorization e nonce não vão no arquivo.</p>
</body>
</html>
`
}
