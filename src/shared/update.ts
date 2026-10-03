// Regras da atualização automática (RF-35), sem depender do Electron para poderem ser testadas.
// Procurar é automático; baixar e instalar só acontecem quando o usuário pede.

import type { UpdateChannel, UpdateStatus } from './types'

/** O que o controlador usa do `autoUpdater` do electron-updater. */
export interface UpdateSource {
    autoDownload: boolean
    autoInstallOnAppQuit: boolean
    allowPrerelease: boolean
    // any: cada evento do electron-updater tem argumentos próprios.
    on(event: any, listener: (...args: any[]) => void): unknown
    checkForUpdates(): Promise<unknown>
    downloadUpdate(): Promise<unknown>
    quitAndInstall(): void
}

/** Os erros do electron-updater trazem a pilha e, às vezes, a página de erro inteira do servidor. */
function shortMessage(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error)
    return (text.split('\n')[0] ?? '').slice(0, 300) || 'Erro desconhecido'
}

export class UpdateController {
    private status: UpdateStatus = { state: 'idle' }

    constructor(
        private source: UpdateSource,
        private emit: (status: UpdateStatus) => void,
        channel: UpdateChannel
    ) {
        // Nada é baixado sem o usuário saber; depois de baixada, a versão entra ao reiniciar.
        source.autoDownload = false
        source.autoInstallOnAppQuit = true
        source.allowPrerelease = channel === 'beta'

        source.on('checking-for-update', () => this.set({ state: 'checking' }))
        source.on('update-not-available', () => this.set({ state: 'up-to-date' }))
        source.on('update-available', (info: { version: string }) =>
            this.set({ state: 'available', version: info.version })
        )
        source.on('download-progress', (progress: { percent: number }) => {
            if (this.status.state !== 'downloading') return
            this.set({ ...this.status, percent: Math.round(progress.percent) })
        })
        source.on('update-downloaded', (info: { version: string }) =>
            this.set({ state: 'ready', version: info.version })
        )
        source.on('error', (error: Error) => this.fail(error))
    }

    current(): UpdateStatus {
        return this.status
    }

    private set(status: UpdateStatus): void {
        this.status = status
        this.emit(status)
    }

    /** Repositório ainda sem nenhum release não é erro: não há nada mais novo que a versão instalada. */
    private fail(error: unknown): void {
        if ((error as { code?: string } | null)?.code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS')
            return this.set({ state: 'up-to-date' })
        this.set({ state: 'error', message: shortMessage(error) })
    }

    private get busy(): boolean {
        return ['checking', 'downloading', 'ready'].includes(this.status.state)
    }

    /** Trocar de canal descarta o que foi achado no canal anterior, menos um download já feito. */
    setChannel(channel: UpdateChannel): void {
        this.source.allowPrerelease = channel === 'beta'
        if (!this.busy) this.set({ state: 'idle' })
    }

    async check(): Promise<void> {
        if (this.busy) return
        try {
            await this.source.checkForUpdates()
        } catch (error) {
            this.fail(error)
        }
    }

    async download(): Promise<void> {
        if (this.status.state !== 'available') return
        this.set({ state: 'downloading', version: this.status.version, percent: 0 })
        try {
            await this.source.downloadUpdate()
        } catch (error) {
            this.fail(error)
        }
    }

    /** Devolve false quando ainda não há versão baixada. */
    install(): boolean {
        if (this.status.state !== 'ready') return false
        this.source.quitAndInstall()
        return true
    }
}
