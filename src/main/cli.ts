// Modo linha de comando (RF-31): o mesmo app, com uma janela que nunca aparece. A interface roda
// os cenários com os mesmos motores SIP e manda as linhas de resultado para cá, que as escreve no
// terminal e sai com o código certo.

import { app, BrowserWindow } from 'electron'
import { mkdtempSync, promises as fs, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CLI_USAGE, EXIT_OK, EXIT_USAGE, parseCliArgs, type CliConfig, type CliOptions } from '@shared/cli'
import { IPC } from '@shared/types'
import { handle, on, rendererUrl } from './ipc-guard'

const parsed = parseCliArgs(process.argv.slice(1))
export const cliOptions: CliOptions | null = parsed && 'options' in parsed ? parsed.options : null

let tempDir: string | undefined
/** A janela invisível tem este tempo para pedir a configuração; senão o processo sai com erro. */
const STARTUP_TIMEOUT_MS = 30_000
let startupTimer: ReturnType<typeof setTimeout> | undefined
let window: BrowserWindow | null = null

/** Caminho como o usuário digitou: relativo à pasta de onde chamou (o npm muda o cwd para o projeto). */
const userPath = (path: string): string => resolve(process.env['INIT_CWD'] ?? process.cwd(), path)

function fail(message: string): never {
    process.stderr.write(`iris: ${message}\n`)
    cleanup()
    process.exit(EXIT_USAGE)
}

function cleanup(): void {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
}

/**
 * Roda antes do app ficar pronto. Devolve true no modo linha de comando. Os dados do Chromium vão
 * para uma pasta temporária, então dá para rodar com o app aberto; com --contas, a pasta de dados
 * inteira é temporária e nada dos seus dados é lido ou alterado.
 */
export function prepareCli(): boolean {
    if (!parsed) return false
    if ('error' in parsed) fail(`${parsed.error}\n\n${CLI_USAGE}`)
    const options = parsed.options
    if (options.help) {
        process.stdout.write(`${CLI_USAGE}\n`)
        process.exit(EXIT_OK)
    }
    tempDir = mkdtempSync(join(tmpdir(), 'iris-cli-'))
    app.setPath('sessionData', join(tempDir, 'sessao'))
    if (options.accountsFile) app.setPath('userData', join(tempDir, 'dados'))
    if (options.fakeMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream')
    app.on('quit', cleanup)
    return true
}

async function readText(path: string, what: string): Promise<string> {
    try {
        return await fs.readFile(userPath(path), 'utf8')
    } catch (error) {
        fail(`não consegui ler o arquivo de ${what} ${path}: ${(error as Error).message}`)
    }
}

export function registerCliIpc(): void {
    const options = cliOptions!
    handle(IPC.cliConfig, async (): Promise<CliConfig> => {
        clearTimeout(startupTimer)
        return {
            scenarios: options.scenarios,
            all: options.all,
            runs: options.runs,
            origins: options.origins,
            report: options.report,
            accountsText: options.accountsFile ? await readText(options.accountsFile, 'contas') : undefined,
            scenariosText: options.scenariosFile ? await readText(options.scenariosFile, 'cenários') : undefined
        }
    })
    on(IPC.cliPrint, (_e, line: string, error: boolean) => (error ? process.stderr : process.stdout).write(`${line}\n`))
    // O caminho do relatório vem da linha de comando, nunca da interface.
    handle(IPC.cliReport, async (_e, content: string) => {
        if (!options.report) return null
        const path = userPath(options.report)
        await fs.writeFile(path, content, 'utf8')
        return path
    })
    on(IPC.cliFinish, (_e, code: number) => {
        cleanup()
        app.exit(Number.isInteger(code) ? code : EXIT_USAGE)
    })
}

export function createCliWindow(preload: string): void {
    app.dock?.hide()
    // Num CI, travar na abertura é pior que falhar: sai com erro se a interface não começar.
    startupTimer = setTimeout(() => fail('a interface não começou em 30 s'), STARTUP_TIMEOUT_MS)
    window = new BrowserWindow({
        show: false,
        webPreferences: {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false
        }
    })
    window.webContents.on('render-process-gone', (_e, details) => fail(`a interface parou (${details.reason})`))
    window.webContents.on('did-fail-load', (_e, code, description) =>
        fail(`não carregou a interface: ${description} (${code})`)
    )
    void window.loadURL(rendererUrl())
}
