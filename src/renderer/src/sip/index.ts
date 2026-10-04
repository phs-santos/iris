import type { Account, ReconnectSettings } from '@shared/types'
import type { SipEngine } from './engine'
import { EasySipEngine } from './easysip-engine'
import { MockEngine } from './mock-engine'
import { NativeSipEngine } from './native-engine'

export function createEngine(account: Account, password: string, reconnect?: ReconnectSettings): SipEngine {
    if (account.simulated) return new MockEngine(account, password)
    // SIP puro por UDP, TCP ou TLS: motor próprio, com os sockets no processo principal (RF-39).
    if (isNativeAccount(account)) return new NativeSipEngine(account, password)
    return new EasySipEngine(account, password, reconnect)
}

/** Conta que fala SIP puro, sem WebRTC. */
export const isNativeAccount = (account: Account): boolean =>
    !account.simulated && Boolean(account.transport) && account.transport !== 'ws'

export * from './engine'
