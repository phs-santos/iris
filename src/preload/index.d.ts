import type { IrisApi } from '@shared/types'

declare global {
    interface Window {
        iris: IrisApi
    }
}

export {}
