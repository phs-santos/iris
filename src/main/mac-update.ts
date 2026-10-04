// Atualização do macOS sem assinatura: baixa, confere e troca o app (regras em @shared/mac-update).
// A procura continua com o electron-updater; só o download e a instalação são daqui.

import { app, net } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { promisify } from 'node:util'
import type { UpdateSource } from '@shared/update'
import { checkExtractedApp, macZipUrl, pickMacZip, SWAP_SCRIPT, type ReleaseFile } from '@shared/mac-update'

const run = promisify(execFile)

interface FoundUpdate {
    version: string
    files: ReleaseFile[]
}

export class MacSelfUpdater extends EventEmitter implements UpdateSource {
    autoDownload = false
    autoInstallOnAppQuit = false
    private found: FoundUpdate | null = null
    private staged: string | null = null

    constructor(private inner: UpdateSource) {
        super()
        // O Squirrel.Mac nunca baixa nem instala nada: ele recusaria o app sem assinatura.
        inner.autoDownload = false
        inner.autoInstallOnAppQuit = false
        for (const event of ['checking-for-update', 'update-not-available', 'error'])
            inner.on(event, (...args: unknown[]) => this.emit(event, ...args))
        inner.on('update-available', (info: FoundUpdate) => {
            this.found = info
            this.emit('update-available', info)
        })
    }

    get allowPrerelease(): boolean {
        return this.inner.allowPrerelease
    }
    set allowPrerelease(value: boolean) {
        this.inner.allowPrerelease = value
    }

    /** /Applications/Iris.app, a partir de …/Iris.app/Contents/MacOS/Iris. */
    private get bundle(): string {
        return resolve(process.execPath, '../../..')
    }

    checkForUpdates(): Promise<unknown> {
        return this.inner.checkForUpdates()
    }

    async downloadUpdate(): Promise<void> {
        const found = this.found
        if (!found) throw new Error('Procure a atualização antes de baixar')
        const file = pickMacZip(found.files, process.arch)
        if (!file) throw new Error(`O release ${found.version} não tem o .zip para ${process.arch}`)

        // Sem permissão na pasta do app, a troca falharia só no fim: melhor avisar antes de baixar.
        await fs.access(dirname(this.bundle), fs.constants.W_OK).catch(() => {
            throw new Error(
                `Sem permissão para trocar o app em ${dirname(this.bundle)}. Atualize pelo comando do Terminal.`
            )
        })

        const dir = await fs.mkdtemp(join(app.getPath('temp'), 'iris-atualizacao-'))
        const zip = join(dir, file.url)
        const response = await net.fetch(macZipUrl(found.version, file))
        if (!response.ok || !response.body) throw new Error(`Download falhou: HTTP ${response.status}`)
        const total = Number(response.headers.get('content-length')) || file.size || 0
        const hash = createHash('sha512')
        const out = createWriteStream(zip)
        let received = 0
        const reader = response.body.getReader()
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            hash.update(value)
            if (!out.write(value)) await new Promise<void>((ok) => out.once('drain', () => ok()))
            received += value.length
            if (total) this.emit('download-progress', { percent: (received / total) * 100 })
        }
        await new Promise<void>((ok, fail) => out.end((error?: Error | null) => (error ? fail(error) : ok())))

        if (hash.digest('base64') !== file.sha512) {
            await fs.rm(dir, { recursive: true, force: true })
            throw new Error('O arquivo baixado não confere com o release (SHA-512 diferente). Nada foi instalado.')
        }

        await run('/usr/bin/ditto', ['-x', '-k', zip, join(dir, 'app')])
        const staged = join(dir, 'app', 'Iris.app')
        const plist = join(staged, 'Contents', 'Info.plist')
        const read = async (key: string): Promise<string> =>
            (await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])).stdout.trim()
        checkExtractedApp(
            { bundleId: await read('CFBundleIdentifier'), version: await read('CFBundleShortVersionString') },
            found.version
        )
        await fs.rm(zip, { force: true })
        this.staged = staged
        this.emit('update-downloaded', { version: found.version })
    }

    quitAndInstall(): void {
        if (!this.staged) return
        const script = join(dirname(dirname(this.staged)), 'trocar.sh')
        void fs.writeFile(script, SWAP_SCRIPT, { mode: 0o700 }).then(() => {
            spawn('/bin/bash', [script, String(process.pid), this.bundle, this.staged!], {
                detached: true,
                stdio: 'ignore'
            }).unref()
            app.quit()
        })
    }
}
