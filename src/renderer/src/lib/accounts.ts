import type { Account, AccountsExport, Preset } from '@shared/types'
import type { RegStatus } from '@renderer/sip/engine'

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

const stateText: Record<RegStatus['state'], string> = {
    disconnected: 'desconectada',
    connecting: 'conectando',
    connected: 'WebSocket conectado, aguardando registro',
    registered: 'registrada',
    error: 'erro'
}

export function describeStatus(status: RegStatus): string {
    if (status.state !== 'error') return stateText[status.state]
    return [status.code, status.reason].filter(Boolean).join(' ') || 'erro'
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
            return { title: 'O PBX não aceitou a senha', hint: 'Confira a senha e o usuário de autenticação.' }
        case 403:
            return { title: 'O PBX recusou o login', hint: 'Confira usuário e senha, e se o ramal pode registrar.' }
        case 404:
            return { title: 'O ramal não existe no PBX', hint: 'Confira o ramal e o domínio SIP.' }
        case 408:
            return { title: 'O PBX não respondeu a tempo', hint: 'Confira o endereço do WebSocket e a rede.' }
        case 480:
        case 503:
            return { title: 'O PBX está indisponível', hint: 'Tente de novo em instantes ou rode Saúde.' }
    }
    if (/websocket|1006|connect|fetch|network|timeout/i.test(reason) || status.code === 1006)
        return {
            title: 'Não conectou ao PBX',
            hint: 'Confira o endereço do WebSocket (wss://…), a porta e o certificado. Saúde testa cada parte.'
        }
    return { title: 'O registro falhou', hint: 'Abra Saúde ou "Por que falhou?" para entender o motivo.' }
}

/** Campos obrigatórios e formato do WSS. Retorna mensagens por campo. */
export function validateAccount(account: Account, password: string): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!account.name.trim()) errors.name = 'Dê um nome para reconhecer a conta'
    if (!account.extension.trim()) errors.extension = 'Informe o ramal'
    if (!account.domain.trim()) errors.domain = 'Informe o domínio SIP do PBX'
    if (!account.simulated) {
        if (!/^wss?:\/\/.+/i.test(account.wssUrl.trim()))
            errors.wssUrl = 'Use um endereço como wss://pbx.empresa.com:8089/ws'
        if (!password) errors.password = 'Informe a senha do ramal'
    }
    return errors
}

/** Lê um arquivo de exportação e devolve contas completas, com ids novos quando faltarem. */
export function normalizeImported(data: unknown): Array<{ account: Account; password?: string }> {
    const file = data as Partial<AccountsExport>
    if (!file || file.format !== 'iris/accounts' || !Array.isArray(file.accounts)) {
        throw new Error('Este arquivo não é uma exportação de contas da Íris')
    }
    return file.accounts.map((raw) => {
        const { password, ...rest } = raw
        const account = newAccount({ ...rest, id: rest.id || crypto.randomUUID() })
        return { account, password: typeof password === 'string' ? password : undefined }
    })
}
