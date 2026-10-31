import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { dropRemovedKeys } from '../src/main/storage'
import { DEFAULT_ACCENT } from '@shared/appearance'
import type { Settings } from '@shared/types'

const base = { schemaVersion: 1, trustedHosts: [] }
const old = (extra: object): Settings => ({ ...base, ...extra }) as unknown as Settings
const appearanceOf = (s: Settings): unknown => s.appearance

describe('preferências antigas (RNF-19)', () => {
    it('tira os avisos de recursos removidos e mantém o resto', () => {
        const out = dropRemovedKeys(
            old({ notifications: { enabled: { incoming: false, message: true, monitor: true, voicemail: true } } })
        )
        expect(out.notifications).toEqual({ enabled: { incoming: false } })
    })

    it('tira a ajuda da IA e a câmera, que saíram', () => {
        const out = dropRemovedKeys(old({ ai: { model: 'x', mask: true }, videoInputId: 'cam', audioInputId: 'mic' }))
        expect(out).toEqual({ ...base, audioInputId: 'mic' })
    })

    it('tira perfil, modos, links, atalhos globais e tecla de mídia', () => {
        const out = dropRemovedKeys(
            old({
                profile: { name: 'Ana', tourDone: true },
                modes: { enabled: { log: true }, unlocked: true },
                links: { autoDial: true },
                shortcuts: { mute: 'Control+Alt+M' },
                mediaKey: true,
                ringVolume: 80
            })
        )
        expect(out).toEqual({ ...base, ringVolume: 80 })
    })

    it('aceita preferências sem nenhum campo antigo', () => {
        expect(dropRemovedKeys(old({}))).toEqual(old({}))
    })

    it('a aparência antiga vira só tema e cor, guardando o tema válido e a cor própria', () => {
        const out = dropRemovedKeys(
            old({
                appearance: {
                    theme: 'dark',
                    accent: '#A0B1C2',
                    size: 'large',
                    compact: true,
                    language: 'en',
                    palette: 'rosa'
                }
            })
        )
        expect(appearanceOf(out)).toEqual({ theme: 'dark', accent: '#A0B1C2' })
    })

    it('sem tema vale o claro; sem cor, a cor padrão', () => {
        expect(appearanceOf(dropRemovedKeys(old({ appearance: { size: 'small' } })))).toEqual({
            theme: 'light',
            accent: DEFAULT_ACCENT
        })
        expect(appearanceOf(dropRemovedKeys(old({ appearance: { theme: 'system' } })))).toEqual({
            theme: 'system',
            accent: DEFAULT_ACCENT
        })
    })

    it('tema ou cor inválidos caem nos padrões', () => {
        expect(appearanceOf(dropRemovedKeys(old({ appearance: { theme: 'roxo', accent: 'red' } })))).toEqual({
            theme: 'light',
            accent: DEFAULT_ACCENT
        })
        expect(appearanceOf(dropRemovedKeys(old({ appearance: 'azul' })))).toEqual({
            theme: 'light',
            accent: DEFAULT_ACCENT
        })
    })
})
