import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@renderer': resolve('src/renderer/src'),
            '@shared': resolve('src/shared')
        }
    },
    test: {
        include: ['tests/**/*.test.ts'],
        // Cobertura da camada de domínio (RNF-15): as regras que não dependem de tela nem do Electron.
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'html'],
            include: [
                'src/shared/**/*.ts',
                'src/main/sip/**/*.ts',
                'src/main/app-log.ts',
                'src/renderer/src/lib/**/*.ts',
                'src/renderer/src/scenarios/**/*.ts',
                'src/renderer/src/sip/mock-engine.ts'
            ],
            exclude: ['src/shared/types.ts'],
            thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 }
        }
    }
})
