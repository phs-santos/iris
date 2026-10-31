import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { dropRemovedKeys } from '../src/main/storage'
import type { Settings } from '@shared/types'

const withKeys = (modes: object, notifications: object): Settings =>
    ({
        schemaVersion: 1,
        trustedHosts: [],
        modes: { enabled: modes },
        notifications: { enabled: notifications }
    }) as unknown as Settings

describe('preferências antigas (RNF-19)', () => {
    it('tira modos e avisos de recursos removidos e mantém o resto', () => {
        const out = dropRemovedKeys(
            withKeys(
                { log: true, video: true, sdr: true, messages: true, scenarios: true },
                { incoming: false, message: true, monitor: true, voicemail: true }
            )
        ) as unknown as { modes: { enabled: object }; notifications: { enabled: object } }
        expect(out.modes.enabled).toEqual({ log: true })
        expect(out.notifications.enabled).toEqual({ incoming: false })
    })

    it('tira a ajuda da IA e a câmera, que saíram', () => {
        const old = {
            schemaVersion: 1,
            trustedHosts: [],
            ai: { model: 'x', mask: true },
            videoInputId: 'cam',
            audioInputId: 'mic'
        } as unknown as Settings
        expect(dropRemovedKeys(old)).toEqual({ schemaVersion: 1, trustedHosts: [], audioInputId: 'mic' })
    })

    it('aceita preferências sem modos nem avisos', () => {
        const base = { schemaVersion: 1, trustedHosts: [] } as unknown as Settings
        expect(dropRemovedKeys(base)).toEqual(base)
    })
})
