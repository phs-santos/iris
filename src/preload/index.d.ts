import type { BenchApi } from '@shared/types'

declare global {
  interface Window {
    bench: BenchApi
  }
}

export {}
