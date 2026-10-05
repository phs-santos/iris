// Notificações do sistema, respeitando o que o usuário escolheu em Configurações → Notificações.

import { notificationOn, type NotificationKind } from '@shared/notifications'
import { usePreferencesStore } from '@renderer/stores/preferences'

export function notify(kind: NotificationKind, title: string, body: string, callId?: string): void {
    // Nos testes de unidade das stores não há processo principal nem preferências carregadas.
    if (typeof window === 'undefined' || !window.iris?.notify) return
    if (!notificationOn(usePreferencesStore().notifications, kind)) return
    window.iris.notify({ kind, title, body, callId })
}
