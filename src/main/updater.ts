// Atualização automática (RF-35) pelo GitHub Releases, com canais estável e beta.
// Só roda no app instalado e com janela: em desenvolvimento e na linha de comando (RF-31) o
// electron-updater nem é carregado. A verificação de assinatura dele fica como vem de fábrica.

import { app } from 'electron'
import { IPC, type UpdateChannel, type UpdateInfo, type UpdateStatus } from '@shared/types'
import { check, handle } from './ipc-guard'
import { loadSettings, saveSettings } from './storage'
import { UpdateController } from '@shared/update'

/** Espera o app abrir e registrar as contas antes de procurar versão nova. */
const FIRST_CHECK_DELAY_MS = 15_000

export const isUpdateChannel = (v: unknown): v is UpdateChannel => v === 'stable' || v === 'beta'

function unsupportedReason(): string | null {
    if (!app.isPackaged) return 'A atualização automática funciona só no app instalado.'
    if (process.platform === 'linux' && !process.env['APPIMAGE'])
        return 'No Linux, a atualização automática funciona só no AppImage.'
    return null
}

export async function setupUpdater(options: {
    send: (status: UpdateStatus) => void
    beforeInstall: () => void
}): Promise<void> {
    // Quem instalou uma versão de teste (1.0.0-beta.1) continua recebendo as de teste, até escolher o estável.
    const prerelease = app.getVersion().includes('-')
    let channel: UpdateChannel = (await loadSettings()).updateChannel ?? (prerelease ? 'beta' : 'stable')
    let controller: UpdateController | null = null
    let reason = unsupportedReason()

    if (!reason) {
        try {
            // O pacote é CommonJS: o `autoUpdater` é um getter que só aparece no export padrão.
            const { autoUpdater } = (await import('electron-updater')).default
            controller = new UpdateController(autoUpdater, options.send, channel)
            setTimeout(() => void controller?.check(), FIRST_CHECK_DELAY_MS)
        } catch (error) {
            reason = `O atualizador não iniciou: ${error instanceof Error ? error.message : String(error)}`
        }
    }

    handle(IPC.updateInfo, (): UpdateInfo => ({
        currentVersion: app.getVersion(),
        channel,
        status: controller?.current() ?? { state: 'unsupported', reason: reason ?? '' }
    }))
    handle(IPC.updateSetChannel, async (_e, next: UpdateChannel) => {
        check(isUpdateChannel(next), 'canal de atualização')
        channel = next
        await saveSettings({ ...(await loadSettings()), updateChannel: next })
        controller?.setChannel(next)
    })
    handle(IPC.updateCheck, () => controller?.check())
    handle(IPC.updateDownload, () => controller?.download())
    handle(IPC.updateInstall, () => {
        if (controller?.current().state !== 'ready') return
        options.beforeInstall()
        controller.install()
    })
}
