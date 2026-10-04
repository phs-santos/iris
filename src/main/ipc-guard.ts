// Proteções do IPC (RNF-08): só a própria interface do app fala com o processo principal, e os
// argumentos são conferidos antes de chegar ao disco.

import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appLog, describeError } from './app-log'

/** Endereço da interface: o servidor do Vite em desenvolvimento, o index.html empacotado no resto. */
export function rendererUrl(): string {
    const dev = process.env['ELECTRON_RENDERER_URL']
    // Num app empacotado a variável é ignorada: senão qualquer um apontaria a janela para um site.
    if (dev && !app.isPackaged) return dev
    return pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url
    if (!url) return false
    const expected = new URL(rendererUrl())
    const actual = new URL(url)
    if (expected.protocol === 'file:') return actual.protocol === 'file:' && actual.pathname === expected.pathname
    return actual.origin === expected.origin
}

export class IpcValidationError extends Error {}

/** Lança se o valor não passar na verificação; a mensagem chega à interface como erro da chamada. */
export function check(ok: boolean, what: string): void {
    if (!ok) throw new IpcValidationError(`Argumento inválido: ${what}`)
}

export const isString = (v: unknown, max = 10_000): v is string => typeof v === 'string' && v.length <= max
export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** ipcMain.handle que recusa remetentes de fora da interface. */
export function handle<A extends unknown[], R>(
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
): void {
    ipcMain.handle(channel, async (event, ...args) => {
        if (!isTrusted(event)) throw new Error(`Canal ${channel} recusado: remetente desconhecido`)
        try {
            return await fn(event, ...(args as A))
        } catch (error) {
            // Só o canal e o erro vão para o log interno (RNF-14); os argumentos podem ter senha.
            appLog('error', `Canal ${channel} falhou: ${describeError(error)}`)
            throw error
        }
    })
}

/** ipcMain.on com a mesma verificação de remetente. */
export function on<A extends unknown[]>(channel: string, fn: (event: IpcMainEvent, ...args: A) => void): void {
    ipcMain.on(channel, (event, ...args) => {
        if (isTrusted(event)) fn(event, ...(args as A))
    })
}
