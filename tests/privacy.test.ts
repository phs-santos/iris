import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAccountsStore } from '@renderer/stores/accounts'
import { newAccount } from '@renderer/lib/accounts'

// RNF-10: exportar contas não leva senha, a não ser que o usuário peça.
describe('exportação de contas sem senhas', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        ;(globalThis as Record<string, unknown>).window = {
            iris: { secrets: { get: async () => 'segredo-forte-123' } }
        }
    })

    it('omite as senhas por padrão e só inclui quando pedido', async () => {
        const store = useAccountsStore()
        store.accounts = [newAccount({ id: 'a', name: 'A', extension: '1001', domain: 'd' })]
        const plain = await store.exportJson(false)
        expect(plain).not.toContain('segredo-forte-123')
        expect(plain).not.toMatch(/"password"/)
        expect(await store.exportJson(true)).toContain('"password": "segredo-forte-123"')
    })
})
