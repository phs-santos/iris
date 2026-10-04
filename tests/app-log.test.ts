import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppLog, describeError } from '../src/main/app-log'

const dirs: string[] = []
const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'iris-log-'))
    dirs.push(dir)
    return dir
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('log interno em arquivo (RNF-14)', () => {
    it('grava uma linha com data, nível e texto', () => {
        const dir = tempDir()
        new AppLog(dir).write('error', 'Canal accounts:load falhou')
        expect(readFileSync(join(dir, 'iris.log'), 'utf8')).toMatch(
            /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ERROR Canal accounts:load falhou\n$/
        )
    })

    it('gira os arquivos ao passar do tamanho e guarda no máximo cinco', () => {
        const dir = tempDir()
        const log = new AppLog(dir, 200, 5)
        for (let i = 0; i < 60; i++) log.write('info', `linha ${String(i).padStart(3, '0')} ${'x'.repeat(40)}`)
        expect(readdirSync(dir).sort()).toEqual(['iris.1.log', 'iris.2.log', 'iris.3.log', 'iris.4.log', 'iris.log'])
        // O arquivo atual tem as linhas mais novas; o .1, as anteriores a ele.
        expect(readFileSync(join(dir, 'iris.log'), 'utf8')).toContain('linha 059')
        expect(readFileSync(join(dir, 'iris.1.log'), 'utf8')).not.toContain('linha 059')
        for (const name of readdirSync(dir)) expect(readFileSync(join(dir, name)).length).toBeLessThanOrEqual(200)
    })

    it('continua do tamanho que o arquivo já tinha ao abrir', () => {
        const dir = tempDir()
        new AppLog(dir, 150, 5).write('info', 'a'.repeat(80))
        new AppLog(dir, 150, 5).write('info', 'b'.repeat(80))
        expect(readFileSync(join(dir, 'iris.1.log'), 'utf8')).toContain('aaaa')
        expect(readFileSync(join(dir, 'iris.log'), 'utf8')).toContain('bbbb')
    })

    it('uma pasta que não dá para criar não derruba o app', () => {
        const dir = tempDir()
        new AppLog(join(dir, 'iris.txt', '\0')).write('info', 'sem lugar para gravar')
    })

    it('descreve erros com a pilha e valores soltos como texto', () => {
        expect(describeError(new Error('quebrou'))).toContain('Error: quebrou')
        expect(describeError('texto')).toBe('texto')
        expect(describeError({ code: 7 })).toBe('{"code":7}')
    })
})
