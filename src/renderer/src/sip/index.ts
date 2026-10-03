import type { Account } from '@shared/types'
import type { SipEngine } from './engine'
import { EasySipEngine } from './easysip-engine'
import { MockEngine } from './mock-engine'

export function createEngine(account: Account, password: string): SipEngine {
  return account.simulated ? new MockEngine(account, password) : new EasySipEngine(account, password)
}

export * from './engine'
