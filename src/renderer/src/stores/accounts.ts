import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref } from 'vue'
import type { Account, AccountsExport } from '@shared/types'
import { createEngine, type HealthReport, type RegStatus, type SipEngine } from '@renderer/sip'
import { useLogStore } from './log'
import { useCallsStore } from './calls'
import { describeStatus, newAccount, normalizeImported, parseAccountsCsv, sampleAccounts } from '@renderer/lib/accounts'
import { reconnectDelay, shouldReconnect } from '@shared/reconnect'
import { usePreferencesStore } from './preferences'
import { parseBlfList, type MwiInfo, type PresenceState } from '@shared/presence'

interface Runtime {
    status: RegStatus
    engine?: SipEngine
    health?: HealthReport
    /** Estado dos ramais acompanhados (BLF) e aviso de correio de voz (RF-27). */
    presence?: Record<string, PresenceState>
    mwi?: MwiInfo
    /** Há uma nova tentativa de registro agendada (RNF-06); `max` 0 é sem limite. */
    retry?: { attempt: number; max: number }
}

export const useAccountsStore = defineStore('accounts', () => {
    const accounts = ref<Account[]>([])
    const runtime = reactive<Record<string, Runtime>>({})
    const selectedId = ref<string | null>(null)
    /** Trazendo as senhas do formato antigo; o macOS pode estar mostrando o pedido das Chaves. */
    const migratingSecrets = ref(false)
    /** Aviso sobre o arquivo de senhas (RNF-07); null quando está tudo certo. */
    const secretsProblem = ref<string | null>(null)
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

    // ─── Novas tentativas (RNF-06) ─────────────────────────────────────────
    // Um registro que falha por algo passageiro (rede, PBX reiniciando, fila de WebSockets cheia na
    // abertura) é refeito com espera crescente, até o limite das Configurações.
    const retries = new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> }>()

    function clearRetry(id: string): void {
        clearTimeout(retries.get(id)?.timer)
        retries.delete(id)
        if (runtime[id]) runtime[id].retry = undefined
    }

    function scheduleRetry(id: string, status: RegStatus): void {
        if (status.final || !shouldReconnect(status.code)) return clearRetry(id)
        const log = useLogStore()
        const settings = usePreferencesStore().reconnect
        const attempt = (retries.get(id)?.attempt ?? 0) + 1
        const delay = reconnectDelay(attempt, settings)
        if (delay === null) {
            clearRetry(id)
            log.add(
                id,
                'error',
                'event',
                `Sem registro depois de ${settings.maxAttempts} tentativas. Clique em Registrar para tentar de novo.`
            )
            return
        }
        clearTimeout(retries.get(id)?.timer)
        retries.set(id, { attempt, timer: setTimeout(() => void register(id, true), delay) })
        if (runtime[id]) runtime[id].retry = { attempt, max: settings.maxAttempts }
        const of = settings.maxAttempts ? ` de ${settings.maxAttempts}` : ''
        log.add(id, 'info', 'event', `Nova tentativa de registro em ${Math.round(delay / 1000)} s (${attempt}${of})`)
    }

    /** A rede voltou: não espera o resto do tempo para tentar. */
    function retryNow(): void {
        for (const id of [...retries.keys()]) void register(id, true)
    }
    // Nos testes de unidade não há janela de verdade.
    globalThis.addEventListener?.('online', retryNow)

    async function load(): Promise<void> {
        // As senhas do formato antigo vêm antes de registrar, para as contas já acharem a senha.
        if ((await window.iris.secrets.status()).legacy) {
            migratingSecrets.value = true
            await window.iris.secrets.migrate().finally(() => (migratingSecrets.value = false))
        }
        let list = await window.iris.accounts.load()
        // Depois de ler as contas: um accounts.json estragado também vira aviso (RNF-19).
        await refreshProblems()
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

    /** Relê os avisos sobre os arquivos de dados (senhas, contas, cenários e preferências). */
    async function refreshProblems(): Promise<void> {
        secretsProblem.value = (await window.iris.secrets.status()).problem
    }

    async function persist(): Promise<void> {
        await window.iris.accounts.save(JSON.parse(JSON.stringify(accounts.value)))
    }

    /** `select` falso não troca a conta escolhida: usado ao atualizar várias contas de uma vez. */
    async function save(account: Account, password?: string | null, select = true): Promise<void> {
        const index = accounts.value.findIndex((a) => a.id === account.id)
        const wasRegistered = index >= 0 && statusOf(account.id).state !== 'disconnected'
        if (index >= 0) accounts.value[index] = account
        else accounts.value.push(account)
        if (password !== undefined) await window.iris.secrets.set(account.id, password)
        await persist()
        if (select) selectedId.value = account.id
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

    /** `retrying` é a nova tentativa automática: mantém a contagem. Um pedido do usuário zera. */
    async function register(id: string, retrying = false): Promise<void> {
        const account = byId(id)
        if (!account) return clearRetry(id)
        const log = useLogStore()
        const calls = useCallsStore()
        const pending = retries.get(id)
        clearTimeout(pending?.timer)
        if (!retrying) retries.delete(id)
        await runtime[id]?.engine?.dispose()

        const password = (await window.iris.secrets.get(id)) ?? ''
        const reconnect = usePreferencesStore().reconnect
        const engine = markRaw(createEngine(account, password, reconnect))
        runtime[id] = {
            status: { state: 'connecting' },
            engine,
            retry: retrying && pending ? { attempt: pending.attempt, max: reconnect.maxAttempts } : undefined
        }

        engine.on('status', (status) => {
            if (runtime[id]?.engine !== engine) return
            runtime[id].status = status
            log.add(id, status.state === 'error' ? 'error' : 'info', 'event', `Registro: ${describeStatus(status)}`)
            if (status.state === 'registered') clearRetry(id)
            else if (status.state === 'error') scheduleRetry(id, status)
        })
        engine.on('log', (entry) => log.add(id, entry.level, entry.kind, entry.text))
        engine.on('incoming', (call) => calls.addIncoming(id, call))
        engine.on('presence', (extension, state) => {
            if (runtime[id]?.engine !== engine) return
            runtime[id].presence = { ...runtime[id].presence, [extension]: state }
        })
        engine.on('mwi', (info) => {
            if (runtime[id]?.engine !== engine) return
            const before = runtime[id].mwi?.newMessages ?? 0
            runtime[id].mwi = info
            if (info.newMessages !== before)
                log.add(
                    id,
                    'info',
                    'event',
                    `Correio de voz: ${info.newMessages} nova(s), ${info.oldMessages} antiga(s)`
                )
        })

        log.add(
            id,
            'info',
            'event',
            `Registrando ${account.extension}@${account.domain} via ${account.simulated ? 'PBX simulado' : account.wssUrl}`
        )
        await engine.connect()
    }

    async function unregister(id: string): Promise<void> {
        clearRetry(id)
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

    /** Cria contas a partir de uma planilha em CSV (RF-48). Nada é criado se alguma linha estiver errada. */
    async function importCsv(text: string): Promise<number> {
        const items = parseAccountsCsv(text)
        for (const { account, password } of items) {
            accounts.value.push(account)
            await window.iris.secrets.set(account.id, password)
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
        migratingSecrets,
        secretsProblem,
        byId,
        nameOf,
        statusOf,
        retryOf: (id: string) => runtime[id]?.retry,
        /** Ramais acompanhados pela conta, na ordem em que foram escritos, com o estado que o PBX informou. */
        presenceOf: (account: Account): Array<{ extension: string; state: PresenceState }> =>
            runtime[account.id]?.engine
                ? parseBlfList(account.blf).map((extension) => ({
                      extension,
                      state: runtime[account.id]?.presence?.[extension] ?? 'unknown'
                  }))
                : [],
        mwiOf: (id: string) => runtime[id]?.mwi,
        refreshProblems,
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
        importCsv,
        newAccount
    }
})
