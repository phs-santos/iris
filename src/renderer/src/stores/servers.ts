import { defineStore } from 'pinia'
import { ref } from 'vue'
import { applyServer, type SipServer } from '@shared/servers'
import { useAccountsStore } from './accounts'

/** Servidores cadastrados (RF-51), guardados em servers.json. */
export const useServersStore = defineStore('servers', () => {
    const servers = ref<SipServer[]>([])

    async function load(): Promise<void> {
        servers.value = await window.iris.servers.load()
    }

    function persist(): Promise<void> {
        return window.iris.servers.save(JSON.parse(JSON.stringify(servers.value)))
    }

    const byId = (id: string | undefined): SipServer | undefined => servers.value.find((s) => s.id === id)

    /** Contas ligadas a um servidor. */
    const usersOf = (id: string): string[] =>
        useAccountsStore()
            .accounts.filter((a) => a.serverId === id)
            .map((a) => a.id)

    /**
     * Salva o servidor e copia os dados novos para todas as contas ligadas a ele. As que estavam no ar
     * registram de novo, com o endereço novo. Devolve quantas contas mudaram.
     */
    async function save(server: SipServer): Promise<number> {
        const index = servers.value.findIndex((s) => s.id === server.id)
        if (index >= 0) servers.value[index] = server
        else servers.value.push(server)
        await persist()
        const accounts = useAccountsStore()
        const linked = accounts.accounts.filter((a) => a.serverId === server.id)
        for (const account of linked) await accounts.save(applyServer(account, server), undefined, false)
        return linked.length
    }

    /** Apaga o servidor. As contas ligadas mantêm os dados que tinham, só perdem o vínculo. */
    async function remove(id: string): Promise<void> {
        const accounts = useAccountsStore()
        for (const account of accounts.accounts.filter((a) => a.serverId === id)) {
            const { serverId: _unused, ...rest } = account
            await accounts.save(rest, undefined, false)
        }
        servers.value = servers.value.filter((s) => s.id !== id)
        await persist()
    }

    return { servers, load, byId, usersOf, save, remove }
})
