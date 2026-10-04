// Liga o executor de cenários às stores do app: os passos usam as mesmas contas,
// chamadas e log que a interface, então tudo aparece nos cartões e no log.

import { useAccountsStore } from '@renderer/stores/accounts'
import { useCallsStore, type CallView } from '@renderer/stores/calls'
import { useLogStore } from '@renderer/stores/log'
import type { DriverCall, ScenarioDriver } from './runner'

function toDriver(c: CallView): DriverCall {
    return {
        id: c.id,
        accountId: c.accountId,
        direction: c.direction,
        state: c.state,
        held: c.held,
        heldByRemote: c.heldByRemote,
        progress: c.progress,
        endText: c.endText,
        dtmfReceived: c.dtmfReceived,
        transfer: c.transferResult,
        startedAt: c.startedAt
    }
}

export function storeDriver(): ScenarioDriver {
    const accounts = useAccountsStore()
    const calls = useCallsStore()
    const log = useLogStore()
    // Cartões encerrados somem da lista depois de alguns segundos; guarda o último estado visto.
    const lastSeen = new Map<string, DriverCall>()

    const find = (id: string): DriverCall | undefined => {
        const c = calls.calls.find((x) => x.id === id)
        if (c) lastSeen.set(id, toDriver(c))
        return lastSeen.get(id)
    }

    return {
        regStatus: (id) => accounts.statusOf(id),
        register: (id) => accounts.register(id),
        dial: (id, to) => calls.dial(id, to),
        call: find,
        calls: () => calls.calls.map(toDriver),
        answer: (id) => calls.answer(id),
        hangup: (id) => calls.hangup(id),
        sendDtmf: (id, digits) => calls.sendDtmf(id, digits),
        transfer: (id, to) => calls.transfer(id, to),
        playAudio: (id, pcm) => calls.playAudio(id, pcm),
        audioLevel: (id) => calls.audioLevel(id),
        loadWav: (path) => window.iris.audio.loadWav(path),
        logSince: (since, accountId) =>
            log.entries.filter((e) => e.ts >= since && (!accountId || e.accountId === accountId)).map((e) => e.text),
        accountName: (id) => accounts.nameOf(id),
        accountInfo: (id) => {
            const account = accounts.byId(id)
            return account && { name: account.name, extension: account.extension, domain: account.domain }
        }
    }
}
