import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { LogKind, LogLevel } from '@renderer/sip/engine'

export interface LogEntry {
  id: number
  ts: number
  accountId: string | null
  level: LogLevel
  kind: LogKind
  text: string
}

export interface LogFilter {
  accountId: string | null
  kind: LogKind | 'all'
  minLevel: LogLevel
  text: string
}

/** Limite total de linhas em memória; as mais antigas saem primeiro (RF-21). */
export const LOG_LIMIT = 50_000

const levelRank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function matches(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.accountId && entry.accountId !== filter.accountId) return false
  if (filter.kind !== 'all' && entry.kind !== filter.kind) return false
  if (levelRank[entry.level] < levelRank[filter.minLevel]) return false
  if (filter.text && !entry.text.toLowerCase().includes(filter.text.toLowerCase())) return false
  return true
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export function formatEntry(entry: LogEntry, accountName: (id: string | null) => string): string {
  return `${formatTime(entry.ts)} [${accountName(entry.accountId)}] ${entry.level.toUpperCase()} ${entry.text}`
}

let nextId = 1

export const useLogStore = defineStore('log', () => {
  // shallowRef: milhares de linhas sem custo de reatividade profunda.
  const entries = shallowRef<LogEntry[]>([])
  let scheduled = false

  function add(accountId: string | null, level: LogLevel, kind: LogKind, text: string): void {
    const list = entries.value
    list.push({ id: nextId++, ts: Date.now(), accountId, level, kind, text })
    if (list.length > LOG_LIMIT) list.splice(0, list.length - LOG_LIMIT)
    // Agrupa várias linhas num único redesenho.
    if (!scheduled) {
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        triggerRef(entries)
      })
    }
  }

  function clear(accountId: string | null = null): void {
    entries.value = accountId ? entries.value.filter((e) => e.accountId !== accountId) : []
  }

  function filtered(filter: LogFilter): LogEntry[] {
    return entries.value.filter((e) => matches(e, filter))
  }

  return { entries, add, clear, filtered }
})
