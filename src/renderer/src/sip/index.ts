import type { Account, ReconnectSettings } from '@shared/types'
import { isSimulated } from '@shared/servers'
import type { SipEngine } from './engine'
import { EasySipEngine } from './easysip-engine'
import { MockEngine } from './mock-engine'
import { NativeSipEngine } from './native-engine'

export function createEngine(account: Account, password: string, reconnect?: ReconnectSettings): SipEngine {
    // O PBX simulado é um servidor fixo (RF-32).
    if (isSimulated(account)) return new MockEngine(account, password)
    // SIP puro por UDP, TCP ou TLS: motor próprio, com os sockets no processo principal (RF-39).
    if (isNativeAccount(account)) return new NativeSipEngine(account, password)
    return new EasySipEngine(account, password, reconnect)
}

/** Conta que fala SIP puro, sem WebRTC. */
export const isNativeAccount = (account: Account): boolean => !isSimulated(account) && account.transport !== 'ws'

export * from './engine'
