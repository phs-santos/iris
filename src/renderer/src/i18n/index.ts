// Tradução da interface (RNF-13): os componentes não têm texto fixo; pedem pelo nome a `t()` (no
// script) ou `$t()` (no modelo). O idioma é um só por enquanto; o catálogo de outro entra em `catalogs`.

import type { App } from 'vue'
import { ptBR } from './pt-BR'

export type Messages = typeof ptBR
/** Nomes válidos, como `accountForm.nome`: um erro de digitação não passa no typecheck. */
export type MessageKey = { [N in keyof Messages]: `${N & string}.${keyof Messages[N] & string}` }[keyof Messages]
export type Locale = 'pt-BR'

/** Outro idioma precisa ter os mesmos grupos e nomes; o que faltar cai no português. */
type Catalog = { [N in keyof Messages]?: Partial<Record<keyof Messages[N], string>> }
const catalogs: Record<Locale, Catalog> = { 'pt-BR': ptBR }
let locale: Locale = 'pt-BR'

export function setLocale(next: Locale): void {
    locale = next
}

function lookup(catalog: Catalog, key: string): string | undefined {
    const dot = key.indexOf('.')
    const group = catalog[key.slice(0, dot) as keyof Messages] as Record<string, string> | undefined
    return group?.[key.slice(dot + 1)]
}

/** Texto do idioma atual, com `{nome}` trocado pelos parâmetros. */
export function t(key: MessageKey, params?: Record<string, unknown>): string {
    const text = lookup(catalogs[locale], key) ?? lookup(ptBR, key) ?? key
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
