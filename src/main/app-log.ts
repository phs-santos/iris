// Log interno do app em arquivo rotativo (RNF-14), para investigar falhas do próprio app: erros não
// tratados, canais de IPC que falharam, processos que caíram. Não é o log SIP das contas, que fica
// só na tela. Senhas nunca passam por aqui (RNF-10).

import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const LOG_FILES = 5
export const LOG_FILE_BYTES = 10 * 1024 * 1024
const MAX_LINE = 8000

export type AppLogLevel = 'info' | 'warn' | 'error'

/** Texto de um erro qualquer, com a pilha quando houver. */
export function describeError(error: unknown): string {
    if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
    return typeof error === 'string' ? error : JSON.stringify(error)
}

export class AppLog {
    private size = 0

    /** `iris.log` é o atual; `iris.1.log` a `iris.4.log` são os anteriores, do mais novo ao mais velho. */
    constructor(
        private dir: string,
        private maxBytes = LOG_FILE_BYTES,
        private files = LOG_FILES
    ) {
        try {
            mkdirSync(dir, { recursive: true })
            this.size = existsSync(this.path(0)) ? statSync(this.path(0)).size : 0
        } catch {
            // Pasta sem permissão: o app segue sem log em arquivo.
        }
    }

    path(index: number): string {
        return join(this.dir, index === 0 ? 'iris.log' : `iris.${index}.log`)
    }

    write(level: AppLogLevel, text: string): void {
        const line = `${new Date().toISOString()} ${level.toUpperCase()} ${text.slice(0, MAX_LINE)}\n`
        const bytes = Buffer.byteLength(line)
        try {
            if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate()
            // Síncrono: a linha de um erro fatal precisa chegar ao disco antes de o processo cair.
            appendFileSync(this.path(0), line)
            this.size += bytes
        } catch {
            // Disco cheio ou arquivo travado: perder a linha é melhor que derrubar o app.
        }
    }

    private rotate(): void {
        rmSync(this.path(this.files - 1), { force: true })
        for (let i = this.files - 2; i >= 0; i--) {
            if (existsSync(this.path(i))) renameSync(this.path(i), this.path(i + 1))
        }
        this.size = 0
    }
}

let current: AppLog | null = null

export function startAppLog(dir: string): AppLog {
    current = new AppLog(dir)
    return current
}

/** Antes de `startAppLog` (ou nos testes), a linha vai só para o terminal. */
export function appLog(level: AppLogLevel, text: string): void {
    if (current) current.write(level, text)
    if (level === 'error') console.error(text)
}
