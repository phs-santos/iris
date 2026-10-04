import type { Account, AccountsExport, Preset } from '@shared/types'
import type { RegStatus } from '@renderer/sip/engine'
import { parseSipServer } from '@shared/sip-target'
import { t } from '@renderer/i18n'

export const ACCOUNT_COLORS = ['#3fcf86', '#6b9cf5', '#f0b13e', '#e879a6', '#5fd0d6', '#b48cf2', '#f08a5d']

export function newAccount(partial: Partial<Account> = {}): Account {
    return {
        id: crypto.randomUUID(),
        name: '',
        color: ACCOUNT_COLORS[Math.floor(Math.random() * ACCOUNT_COLORS.length)],
        preset: 'asterisk',
        provider: 'sipjs',
        domain: '',
        extension: '',
        authUsername: '',
        displayName: '',
        wssUrl: '',
        transport: 'ws',
        sipServer: '',
        iceServers: '',
        dtmfMode: 'auto',
        autoRegister: false,
        autoAnswer: { enabled: false, delayMs: 1000 },
        rawSipLog: true,
        simulated: false,
        quickDials: [],
        ...partial
    }
}

/** Contas de exemplo do primeiro uso, todas no PBX simulado. Senha de todas: 1234. */
export function sampleAccounts(): Array<{ account: Account; password: string }> {
    const demo = { simulated: true, autoRegister: true, preset: 'asterisk' as Preset }
    return [
        {
            account: newAccount({
                ...demo,
                name: 'Suporte 1001',
                color: ACCOUNT_COLORS[0],
                domain: 'demo.local',
                extension: '1001',
                wssUrl: 'wss://demo.local:8089/ws',
                quickDials: [{ label: 'URA', number: '8000' }]
            }),
            password: '1234'
        },
        {
            account: newAccount({
                ...demo,
                name: 'Vendas 1002',
                color: ACCOUNT_COLORS[1],
                domain: 'demo.local',
                extension: '1002',
                wssUrl: 'wss://demo.local:8089/ws',
                autoAnswer: { enabled: true, delayMs: 1500 }
            }),
            password: '1234'
        },
        {
            account: newAccount({
                ...demo,
                name: 'Lab 2001',
                color: ACCOUNT_COLORS[2],
                preset: 'kamailio',
                domain: 'lab.local',
                extension: '2001',
                wssUrl: 'wss://lab.local/ws'
            }),
            password: 'errada'
        }
    ]
}

const stateText = (): Record<RegStatus['state'], string> => ({
    disconnected: t('accounts.desconectada'),
    connecting: t('accounts.conectando'),
    connected: t('accounts.conectado_aguardando'),
    registered: t('accounts.registrada'),
    error: t('accounts.erro')
})

export function describeStatus(status: RegStatus): string {
    if (status.state !== 'error') return stateText()[status.state]
    return [status.code, status.reason].filter(Boolean).join(' ') || t('accounts.erro')
}

/** Erro de registro em português: o que aconteceu e o que conferir. O código original aparece ao lado. */
export interface RegErrorHelp {
    title: string
    hint: string
}

export function explainRegError(status: RegStatus): RegErrorHelp | null {
    if (status.state !== 'error') return null
    const reason = status.reason ?? ''
    switch (status.code) {
        case 401:
        case 407:
            return { title: t('accounts.senha_recusada'), hint: t('accounts.senha_recusada_dica') }
        case 403:
            return { title: t('accounts.login_recusado'), hint: t('accounts.login_recusado_dica') }
        case 404:
            return { title: t('accounts.ramal_inexistente'), hint: t('accounts.ramal_inexistente_dica') }
        case 408:
            return { title: t('accounts.sem_resposta'), hint: t('accounts.sem_resposta_dica') }
        case 480:
        case 503:
            return { title: t('accounts.indisponivel'), hint: t('accounts.indisponivel_dica') }
    }
    if (/websocket|1006|connect|fetch|network|timeout/i.test(reason) || status.code === 1006)
        return {
            title: t('accounts.nao_conectou'),
            hint: t('accounts.nao_conectou_dica')
        }
    return { title: t('accounts.registro_falhou'), hint: t('accounts.registro_falhou_dica') }
}

/** Host do PBX da conta, para casar com a lista de certificados aceitos (RF-37). */
export function accountHost(account: Account): string | null {
    if (account.simulated) return null
    const transport = account.transport ?? 'ws'
    if (transport !== 'ws') return parseSipServer(account.sipServer, account.domain, transport)?.host ?? null
    try {
        return new URL(account.wssUrl).hostname
    } catch {
        return null
    }
}

/** Campos obrigatórios e formato do WSS. Retorna mensagens por campo. */
export function validateAccount(account: Account, password: string): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!account.name.trim()) errors.name = t('accounts.valida_nome')
    if (!account.extension.trim()) errors.extension = t('accounts.valida_ramal')
    if (!account.domain.trim()) errors.domain = t('accounts.valida_dominio')
    if (!account.simulated) {
        const transport = account.transport ?? 'ws'
        if (transport === 'ws') {
            if (!/^wss?:\/\/.+/i.test(account.wssUrl.trim())) errors.wssUrl = t('accounts.valida_wss')
        } else {
            // SIP puro (RF-39): o ramal e o domínio entram direto nas mensagens.
            if (account.extension.trim() && !/^[A-Za-z0-9_.!~*'()&=+$,;?/%-]+$/.test(account.extension.trim()))
                errors.extension = t('accounts.valida_ramal_puro')
            if (account.domain.trim() && !parseSipServer('', account.domain, transport))
                errors.domain = t('accounts.valida_dominio_puro')
            if (!parseSipServer(account.sipServer, account.domain || 'x', transport))
                errors.sipServer = t('accounts.valida_servidor')
        }
        if (!password) errors.password = t('accounts.valida_senha')
    }
    return errors
}

/** Lê um arquivo de exportação e devolve contas completas, com ids novos quando faltarem. */
export function normalizeImported(data: unknown): Array<{ account: Account; password?: string }> {
    const file = data as Partial<AccountsExport>
    if (!file || file.format !== 'iris/accounts' || !Array.isArray(file.accounts)) {
        throw new Error(t('accounts.importacao_invalida'))
    }
    return file.accounts.map((raw) => {
        const { password, ...rest } = raw
        const account = newAccount({ ...rest, id: rest.id || crypto.randomUUID() })
        return { account, password: typeof password === 'string' ? password : undefined }
    })
}
