import type { ArgosApi } from '@shared/types'

declare global {
  interface Window {
    argos: ArgosApi
  }
}

export {}
