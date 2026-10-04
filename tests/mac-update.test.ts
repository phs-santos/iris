import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkExtractedApp, macZipUrl, pickMacZip, SWAP_SCRIPT } from '@shared/mac-update'

const files = [
    { url: 'Iris-1.4.0-x64.zip', sha512: 'a' },
    { url: 'Iris-1.4.0-arm64.zip', sha512: 'b' },
    { url: 'Iris-1.4.0-arm64.dmg', sha512: 'c' }
]

describe('atualização do macOS sem assinatura', () => {
    it('escolhe o .zip da arquitetura do Mac', () => {
        expect(pickMacZip(files, 'arm64')?.url).toBe('Iris-1.4.0-arm64.zip')
        expect(pickMacZip(files, 'x64')?.url).toBe('Iris-1.4.0-x64.zip')
        expect(pickMacZip([files[2]], 'arm64')).toBeNull()
    })

    it('só baixa do release do próprio repositório', () => {
        expect(macZipUrl('1.4.0', files[1])).toBe(
            'https://github.com/phs-santos/iris/releases/download/v1.4.0/Iris-1.4.0-arm64.zip'
        )
        expect(() => macZipUrl('1.4.0', { url: 'https://outro.site/Iris.zip', sha512: '' })).toThrow()
        expect(() => macZipUrl('1.4.0', { url: '../Iris.zip', sha512: '' })).toThrow()
        expect(() => macZipUrl('1.4.0/../x', files[1])).toThrow()
    })

    it('recusa um app que não é a Íris ou de outra versão', () => {
        expect(() => checkExtractedApp({ bundleId: 'dev.iris.softphone', version: '1.4.0' }, '1.4.0')).not.toThrow()
        expect(() => checkExtractedApp({ bundleId: 'com.outro.app', version: '1.4.0' }, '1.4.0')).toThrow(
            /não é a Íris/
        )
        expect(() => checkExtractedApp({ bundleId: 'dev.iris.softphone', version: '1.3.0' }, '1.4.0')).toThrow(
            /1\.3\.0/
        )
    })

    it.runIf(process.platform !== 'win32')('o script troca o app e, se falhar, devolve o antigo', () => {
        const dir = mkdtempSync(join(tmpdir(), 'iris-troca-'))
        const script = join(dir, 'trocar.sh')
        // "open" não existe no Linux do CI: um falso no PATH anota o que seria aberto.
        mkdirSync(join(dir, 'bin'))
        writeFileSync(join(dir, 'bin', 'open'), `#!/bin/bash\necho "$1" > "${dir}/aberto"\n`, { mode: 0o755 })
        writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 })
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` }

        mkdirSync(join(dir, 'Iris.app'))
        writeFileSync(join(dir, 'Iris.app', 'versao'), '1.3.0')
        mkdirSync(join(dir, 'novo', 'Iris.app'), { recursive: true })
        writeFileSync(join(dir, 'novo', 'Iris.app', 'versao'), '1.4.0')
        // pid 999999 não existe: o script não espera.
        execFileSync('/bin/bash', [script, '999999', join(dir, 'Iris.app'), join(dir, 'novo', 'Iris.app')], { env })
        expect(readFileSync(join(dir, 'Iris.app', 'versao'), 'utf8')).toBe('1.4.0')
        expect(existsSync(join(dir, 'Iris.app.antigo'))).toBe(false)
        expect(readFileSync(join(dir, 'aberto'), 'utf8').trim()).toBe(join(dir, 'Iris.app'))

        // App novo sumiu: o antigo continua no lugar.
        execFileSync('/bin/bash', [script, '999999', join(dir, 'Iris.app'), join(dir, 'nao-existe')], { env })
        expect(readFileSync(join(dir, 'Iris.app', 'versao'), 'utf8')).toBe('1.4.0')
    })
})
