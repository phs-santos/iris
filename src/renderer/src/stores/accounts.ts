import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref } from 'vue'
import type { Account, AccountsExport } from '@shared/types'
import { createEngine, type HealthReport, type RegStatus, type SipEngine } from '@renderer/sip'
import { useLogStore } from './log'
import { useCallsStore } from './calls'
import { describeStatus, newAccount, normalizeImported, sampleAccounts } from '@renderer/lib/accounts'

interface Runtime {
    status: RegStatus
    engine?: SipEngine
    health?: HealthReport
}

export const useAccountsStore = defineStore('accounts', () => {
    const accounts = ref<Account[]>([])
    const runtime = reactive<Record<string, Runtime>>({})
    const selectedId = ref<string | null>(null)
    const encryptionAvailable = ref(true)
    const loaded = ref(false)

    const selected = computed(() => accounts.value.find((a) => a.id === selectedId.value) ?? null)
    const byId = (id: string | null): Account | undefined => accounts.value.find((a) => a.id === id)
    const nameOf = (id: string | null): string => (id ? (byId(id)?.name ?? '?') : 'app')

    /** Contas agrupadas por domínio do PBX, na ordem em que aparecem (RF-02). */
    const groups = computed(() => {
        const map = new Map<string, Account[]>()
        for (const account of accounts.value) {
            const key = account.domain || 'sem domínio'
            map.set(key, [...(map.get(key) ?? []), account])
        }
        return [...map.entries()].map(([domain, list]) => ({ domain, accounts: list }))
    })

    function statusOf(id: string): RegStatus {
        return runtime[id]?.status ?? { state: 'disconnected' }
    }

    async function load(): Promise<void> {
        encryptionAvailable.value = await window.iris.secrets.encryptionAvailable()
        let list = await window.iris.accounts.load()
        if (list.length === 0) {
            // Primeiro uso: contas simuladas para explorar o app sem PBX (UC-08).
            const samples = sampleAccounts()
            for (const { account, password } of samples) await window.iris.secrets.set(account.id, password)
            list = samples.map((s) => s.account)
            await window.iris.accounts.save(list)
        }
        accounts.value = list
        selectedId.value = list[0]?.id ?? null
        loaded.value = true
        for (const account of list) if (account.autoRegister) void register(account.id)
    }

    async function persist(): Promise<void> {
        await window.iris.accounts.save(JSON.parse(JSON.stringify(accounts.value)))
    }

    async function save(account: Account, password?: string | null): Promise<void> {
        const index = accounts.value.findIndex((a) => a.id === account.id)
        const wasRegistered = index >= 0 && statusOf(account.id).state !== 'disconnected'
        if (index >= 0) accounts.value[index] = account
        else accounts.value.push(account)
        if (password !== undefined) await window.iris.secrets.set(account.id, password)
        await persist()
        selectedId.value = account.id
        // A conexão usa os dados antigos até ser refeita.
        if (wasRegistered) {
            await unregister(account.id)
            await register(account.id)
        }
    }

    async function remove(id: string): Promise<void> {
        await unregister(id)
        accounts.value = accounts.value.filter((a) => a.id !== id)
        delete runtime[id]
        await window.iris.secrets.set(id, null)
        await persist()
        if (selectedId.value === id) selectedId.value = accounts.value[0]?.id ?? null
    }

    async function duplicate(id: string): Promise<Account | null> {
        const source = byId(id)
        if (!source) return null
        const copy: Account = {
            ...(JSON.parse(JSON.stringify(source)) as Account),
            id: crypto.randomUUID(),
            name: `${source.name} (cópia)`
        }
        const password = await window.iris.secrets.get(id)
        await save(copy, password)
        return copy
    }

    async function register(id: string): Promise<void> {
        const account = byId(id)
        if (!account) return
        const log = useLogStore()
        const calls = useCallsStore()
        await runtime[id]?.engine?.dispose()

        const password = (await window.iris.secrets.get(id)) ?? ''
        const engine = markRaw(createEngine(account, password))
        runtime[id] = { status: { state: 'connecting' }, engine }

        engine.on('status', (status) => {
            if (runtime[id]?.engine !== engine) return
            runtime[id].status = status
            log.add(id, status.state === 'error' ? 'error' : 'info', 'event', `Registro: ${describeStatus(status)}`)
        })
        engine.on('log', (entry) => log.add(id, entry.level, entry.kind, entry.text))
        engine.on('incoming', (call) => calls.addIncoming(id, call))

        log.add(
            id,
            'info',
            'event',
            `Registrando ${account.extension}@${account.domain} via ${account.simulated ? 'PBX simulado' : account.wssUrl}`
        )
        await engine.connect()
    }

    async function unregister(id: string): Promise<void> {
        const rt = runtime[id]
        if (!rt?.engine) return
        const engine = rt.engine
        rt.engine = undefined
        rt.status = { state: 'disconnected' }
        await engine.dispose()
        useLogStore().add(id, 'info', 'event', 'Desregistrada')
    }

    const registerAll = (): Promise<unknown> =>
        Promise.all(accounts.value.filter((a) => statusOf(a.id).state !== 'registered').map((a) => register(a.id)))
    const unregisterAll = (): Promise<unknown> => Promise.all(accounts.value.map((a) => unregister(a.id)))

    async function checkHealth(id: string): Promise<HealthReport | null> {
        const rt = runtime[id]
        if (!rt?.engine) return null
        rt.health = await rt.engine.health()
        return rt.health
    }

    function engineOf(id: string): SipEngine | undefined {
        return runtime[id]?.engine
    }

    async function exportJson(includePasswords: boolean): Promise<string> {
        const data: AccountsExport = {
            format: 'iris/accounts',
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            accounts: []
        }
        for (const account of accounts.value) {
            const copy: Account & { password?: string } = JSON.parse(JSON.stringify(account))
            if (includePasswords) copy.password = (await window.iris.secrets.get(account.id)) ?? undefined
            data.accounts.push(copy)
        }
        return JSON.stringify(data, null, 2)
    }

    /** Importa contas de um JSON exportado. Contas com o mesmo id são substituídas. */
    async function importJson(text: string): Promise<number> {
        const items = normalizeImported(JSON.parse(text))
        for (const { account, password } of items) {
            const index = accounts.value.findIndex((a) => a.id === account.id)
            if (index >= 0) accounts.value[index] = account
            else accounts.value.push(account)
            if (password !== undefined) await window.iris.secrets.set(account.id, password)
        }
        await persist()
        return items.length
    }

    return {
        accounts,
        runtime,
        selectedId,
        selected,
        groups,
        loaded,
        encryptionAvailable,
        byId,
        nameOf,
        statusOf,
        load,
        save,
        remove,
        duplicate,
        register,
        unregister,
        registerAll,
        unregisterAll,
        checkHealth,
        engineOf,
        exportJson,
        importJson,
        newAccount
    }
})
