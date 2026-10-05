// Notificações do sistema: quais eventos avisam (escolha do usuário em Configurações → Notificações).

export type NotificationKind = 'incoming' | 'missed' | 'message' | 'registration' | 'voicemail' | 'monitor'

export const NOTIFICATION_KINDS: NotificationKind[] = [
    'incoming',
    'missed',
    'message',
    'registration',
    'voicemail',
    'monitor'
]

export interface NotificationSettings {
    /** Sem a chave, o evento avisa: tudo ligado por padrão. */
    enabled?: Partial<Record<NotificationKind, boolean>>
    /** Chamada recebida traz a janela para a frente, mesmo escondida na bandeja. */
    focusOnRing?: boolean
}

export const isNotificationKind = (v: unknown): v is NotificationKind =>
    NOTIFICATION_KINDS.includes(v as NotificationKind)

export function isNotificationSettings(v: unknown): v is NotificationSettings | undefined {
    if (v === undefined) return true
    if (!v || typeof v !== 'object') return false
    const s = v as Record<string, unknown>
    const enabled = s.enabled as Record<string, unknown> | undefined
    return (
        (enabled === undefined ||
            (typeof enabled === 'object' &&
                enabled !== null &&
                Object.entries(enabled).every(([k, on]) => isNotificationKind(k) && typeof on === 'boolean'))) &&
        (s.focusOnRing === undefined || typeof s.focusOnRing === 'boolean')
    )
}

export const notificationOn = (settings: NotificationSettings | undefined, kind: NotificationKind): boolean =>
    settings?.enabled?.[kind] !== false

/** Pedido de notificação da interface para o processo principal. */
export interface NotifyRequest {
    kind: NotificationKind
    title: string
    body: string
    /** Chamada recebida: a notificação ganha Atender e Recusar, e some quando a chamada é atendida. */
    callId?: string
}

export const isNotifyRequest = (v: unknown): v is NotifyRequest => {
    if (!v || typeof v !== 'object') return false
    const r = v as Record<string, unknown>
    return (
        isNotificationKind(r.kind) &&
        typeof r.title === 'string' &&
        r.title.length <= 200 &&
        typeof r.body === 'string' &&
        r.body.length <= 1000 &&
        (r.callId === undefined || (typeof r.callId === 'string' && r.callId.length <= 200))
    )
}

export type NotificationAction = 'answer' | 'reject' | 'open'
