import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
    applyServer,
    updateFromServer,
    canDeleteServer,
    serversWithSimulated,
    SIMULATED_SERVER_ID,
    type DeleteServerCheck,
    type SipServer
} from '@shared/servers'
import { useAccountsStore } from './accounts'

/** Servidores cadastrados (RF-51), guardados em servers.json. */
export const useServersStore = defineStore('servers', () => {
    const servers = ref<SipServer[]>([])

    async function load(): Promise<void> {
        servers.value = await window.iris.servers.load()
    }

    /** Os gravados mais o simulado fixo, que fica sempre em primeiro. */
    const all = computed(() => serversWithSimulated(servers.value))

    function persist(): Promise<void> {
        return window.iris.servers.save(JSON.parse(JSON.stringify(servers.value)))
    }

    const byId = (id: string | undefined): SipServer | undefined => all.value.find((s) => s.id === id)

    /** Contas ligadas a um servidor. */
    const usersOf = (id: string): string[] =>
        useAccountsStore()
            .accounts.filter((a) => a.serverId === id)
            .map((a) => a.id)

    /**
     * Salva o servidor e copia os dados novos para as contas ligadas a ele, menos o que cada conta mudou por conta própria. As que estavam no ar
     * registram de novo, com o endereço novo. Devolve quantas contas mudaram.
     */
    async function save(server: SipServer): Promise<number> {
        if (server.id === SIMULATED_SERVER_ID) return 0
        const index = servers.value.findIndex((s) => s.id === server.id)
        const before = index >= 0 ? servers.value[index] : undefined
        if (index >= 0) servers.value[index] = server
        else servers.value.push(server)
        await persist()
        const accounts = useAccountsStore()
        const linked = accounts.accounts.filter((a) => a.serverId === server.id)
        // O que a conta mudou no Avançado fica; o resto acompanha o servidor.
        for (const account of linked)
            await accounts.save(
                before ? updateFromServer(account, before, server) : applyServer(account, server),
                undefined,
                false
            )
        return linked.length
    }

    /** Apaga o servidor, se ninguém usa e se não for o simulado. Devolve o motivo da recusa, se houve. */
    async function remove(id: string): Promise<DeleteServerCheck> {
        const server = byId(id)
        if (!server) return { ok: true }
        const result = canDeleteServer(server, useAccountsStore().accounts)
        if (!result.ok) return result
        servers.value = servers.value.filter((s) => s.id !== id)
        await persist()
        return result
    }

    return { servers, all, load, byId, usersOf, save, remove }
})
