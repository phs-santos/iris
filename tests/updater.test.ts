import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import type { UpdateStatus } from '@shared/types'
import { UpdateController, type UpdateSource } from '@shared/update'

/** Fonte de atualização falsa: os testes disparam os eventos que o electron-updater dispararia. */
class FakeSource extends EventEmitter implements UpdateSource {
    autoDownload = true
    autoInstallOnAppQuit = false
    allowPrerelease = false
    checks = 0
    downloads = 0
    installs = 0
    available: string | null = null
    failWith: string | null = null

    async checkForUpdates(): Promise<void> {
        this.checks++
        this.emit('checking-for-update')
        if (this.failWith) throw new Error(this.failWith)
        if (this.available) this.emit('update-available', { version: this.available })
        else this.emit('update-not-available', { version: '1.0.0' })
    }
    async downloadUpdate(): Promise<void> {
        this.downloads++
        if (this.failWith) throw new Error(this.failWith)
        this.emit('download-progress', { percent: 49.6 })
        this.emit('update-downloaded', { version: this.available })
    }
    quitAndInstall(): void {
        this.installs++
    }
}

function setup(channel: 'stable' | 'beta' = 'stable') {
    const source = new FakeSource()
    const seen: UpdateStatus[] = []
    const controller = new UpdateController(source, (s) => seen.push(s), channel)
    return { source, seen, controller }
}

describe('atualização automática (RF-35)', () => {
    it('não baixa sozinha e instala ao reiniciar depois de baixada', () => {
        const { source } = setup()
        expect(source.autoDownload).toBe(false)
        expect(source.autoInstallOnAppQuit).toBe(true)
    })

    it('o canal beta aceita versões de teste; o estável, não', () => {
        expect(setup('stable').source.allowPrerelease).toBe(false)
        const beta = setup('beta')
        expect(beta.source.allowPrerelease).toBe(true)
        beta.controller.setChannel('stable')
        expect(beta.source.allowPrerelease).toBe(false)
    })

    it('sem versão nova, fica em dia e não baixa nada', async () => {
        const { source, seen, controller } = setup()
        await controller.check()
        expect(seen.map((s) => s.state)).toEqual(['checking', 'up-to-date'])
        await controller.download()
        expect(source.downloads).toBe(0)
    })

    it('achar versão nova só avisa; o download espera o usuário pedir', async () => {
        const { source, seen, controller } = setup()
        source.available = '1.1.0'
        await controller.check()
        expect(controller.current()).toEqual({ state: 'available', version: '1.1.0' })
        expect(source.downloads).toBe(0)

        await controller.download()
        expect(seen.slice(2)).toEqual([
            { state: 'downloading', version: '1.1.0', percent: 0 },
            { state: 'downloading', version: '1.1.0', percent: 50 },
            { state: 'ready', version: '1.1.0' }
        ])
    })

    it('só instala com a versão já baixada', async () => {
        const { source, controller } = setup()
        source.available = '1.1.0'
        expect(controller.install()).toBe(false)
        await controller.check()
        expect(controller.install()).toBe(false)
        await controller.download()
        expect(controller.install()).toBe(true)
        expect(source.installs).toBe(1)
    })

    it('com a versão baixada, não procura de novo nem perde o estado ao trocar de canal', async () => {
        const { source, controller } = setup()
        source.available = '1.1.0'
        await controller.check()
        await controller.download()
        await controller.check()
        controller.setChannel('beta')
        expect(source.checks).toBe(1)
        expect(controller.current().state).toBe('ready')
    })

    it('trocar de canal descarta a versão achada no canal anterior', async () => {
        const { source, controller } = setup('beta')
        source.available = '1.1.0-beta.1'
        await controller.check()
        controller.setChannel('stable')
        expect(controller.current()).toEqual({ state: 'idle' })
    })

    it('mostra só a primeira linha do erro e deixa tentar de novo', async () => {
        const { source, controller } = setup()
        source.failWith = 'HttpError: 404\n<html>página inteira</html>'
        await controller.check()
        expect(controller.current()).toEqual({ state: 'error', message: 'HttpError: 404' })
        source.failWith = null
        await controller.check()
        expect(controller.current().state).toBe('up-to-date')
    })

    it('falha no download vira erro, sem ficar preso em "baixando"', async () => {
        const { source, controller } = setup()
        source.available = '1.1.0'
        await controller.check()
        source.failWith = 'sha512 checksum mismatch'
        await controller.download()
        expect(controller.current()).toEqual({ state: 'error', message: 'sha512 checksum mismatch' })
    })
})
