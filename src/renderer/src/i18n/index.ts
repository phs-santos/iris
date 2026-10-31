// Texto da interface (RNF-13): os componentes não têm texto fixo; pedem pelo nome a `t()`
// (no script) ou `$t()` (no modelo). A interface é só em português do Brasil.

import type { App } from 'vue'
import { ptBR } from './pt-BR'

export type Messages = typeof ptBR
/** Nomes válidos, como `accountForm.nome`: um erro de digitação não passa no typecheck. */
export type MessageKey = { [N in keyof Messages]: `${N & string}.${keyof Messages[N] & string}` }[keyof Messages]

function lookup(key: string): string | undefined {
    const dot = key.indexOf('.')
    const group = ptBR[key.slice(0, dot) as keyof Messages] as Record<string, string> | undefined
    return group?.[key.slice(dot + 1)]
}

/** Texto da interface, com `{nome}` trocado pelos parâmetros. */
export function t(key: MessageKey, params?: Record<string, unknown>): string {
    const text = lookup(key) ?? key
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name] ?? '') : whole))
}

export function installI18n(app: App): void {
    app.config.globalProperties.$t = t
}

declare module 'vue' {
    interface ComponentCustomProperties {
        $t: typeof t
    }
}
