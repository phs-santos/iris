import { describe, expect, it } from 'vitest'
import { isNotificationSettings, isNotifyRequest, notificationOn } from '@shared/notifications'

describe('notificações', () => {
    it('tudo avisa por padrão, até o usuário desligar', () => {
        expect(notificationOn(undefined, 'incoming')).toBe(true)
        expect(notificationOn({}, 'missed')).toBe(true)
        expect(notificationOn({ enabled: { missed: false } }, 'missed')).toBe(false)
        expect(notificationOn({ enabled: { missed: false } }, 'incoming')).toBe(true)
    })

    it('confere as preferências e o pedido que vêm da interface', () => {
        expect(isNotificationSettings(undefined)).toBe(true)
        expect(isNotificationSettings({ enabled: { incoming: false }, focusOnRing: true })).toBe(true)
        expect(isNotificationSettings({ enabled: { outro: false } })).toBe(false)
        expect(isNotificationSettings({ enabled: { incoming: 'não' } })).toBe(false)
        expect(isNotificationSettings({ focusOnRing: 1 })).toBe(false)
        expect(isNotifyRequest({ kind: 'incoming', title: 'a', body: 'b', callId: 'c1' })).toBe(true)
        expect(isNotifyRequest({ kind: 'qualquer', title: 'a', body: 'b' })).toBe(false)
        expect(isNotifyRequest({ kind: 'missed', title: 'x'.repeat(201), body: '' })).toBe(false)
    })
})
