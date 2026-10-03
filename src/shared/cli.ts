// Linha de comando (RF-31): executa cenários sem janela, para CI. Os nomes em português e em
// inglês são equivalentes. Código de saída: 0 tudo passou, 1 algum passo falhou, 2 erro de uso.

export interface CliOptions {
    /** Nomes ou ids dos cenários; vazio com `all` roda todos. */
    scenarios: string[]
    all: boolean
    runs: number
    /** Caminho do relatório; a extensão escolhe o formato (.json ou texto). */
    report?: string
    /** Arquivo de contas exportado pela Íris (com senhas). Usa uma pasta de dados temporária. */
    accountsFile?: string
    /** Arquivo de cenários (scenarios.json, uma lista ou um cenário só). */
    scenariosFile?: string
    trustHosts: string[]
    fakeMedia: boolean
    help: boolean
}

/** O que a janela invisível recebe do processo principal no modo linha de comando. */
export interface CliConfig {
    scenarios: string[]
    all: boolean
    runs: number
    report?: string
    accountsText?: string
    scenariosText?: string
}

export const EXIT_OK = 0
export const EXIT_FAILED = 1
export const EXIT_USAGE = 2

export const CLI_USAGE = `Uso: iris --cenario <nome|id> [opções]
Executa cenários sem abrir a janela e sai com código diferente de zero se algum passo falhar.

  --cenario, --scenario <nome|id>   cenário a executar (pode repetir)
  --todos, --all                    executa todos os cenários
  --vezes, --runs <n>               repete cada cenário n vezes (padrão 1)
  --relatorio, --report <arquivo>   salva o relatório (.json ou .txt)
  --contas, --accounts <arquivo>    contas exportadas pela Íris, com senhas (não toca nos seus dados)
  --cenarios, --scenarios <arquivo> arquivo de cenários (padrão: os cenários salvos no app)
  --confiar-host, --trust-host <h>  aceita o certificado autoassinado desse host (pode repetir)
  --midia-falsa, --fake-media       microfone falso, para máquinas sem placa de som
  --ajuda, --help                   mostra esta ajuda

Códigos de saída: 0 tudo passou · 1 algum passo falhou · 2 erro de uso ou configuração
No Linux sem tela, rode com xvfb-run -a.`

const FLAGS: Record<string, keyof CliOptions> = {
    '--cenario': 'scenarios',
    '--scenario': 'scenarios',
    '--todos': 'all',
    '--all': 'all',
    '--vezes': 'runs',
    '--runs': 'runs',
    '--relatorio': 'report',
    '--report': 'report',
    '--contas': 'accountsFile',
    '--accounts': 'accountsFile',
    '--cenarios': 'scenariosFile',
    '--scenarios': 'scenariosFile',
    '--confiar-host': 'trustHosts',
    '--trust-host': 'trustHosts',
    '--midia-falsa': 'fakeMedia',
    '--fake-media': 'fakeMedia',
    '--ajuda': 'help',
    '--help': 'help'
}

const BOOLEAN: Array<keyof CliOptions> = ['all', 'fakeMedia', 'help']

/**
 * Lê os argumentos. Devolve null quando nenhuma opção da linha de comando aparece (abre a janela
 * normal); `error` quando a linha está errada. Argumentos desconhecidos são ignorados, porque o
 * Electron e o Chromium recebem os seus próprios.
 */
export function parseCliArgs(argv: string[]): { options: CliOptions } | { error: string } | null {
    if (!argv.some((arg) => FLAGS[arg.split('=')[0]])) return null
    const options: CliOptions = { scenarios: [], all: false, runs: 1, trustHosts: [], fakeMedia: false, help: false }
    for (let i = 0; i < argv.length; i++) {
        const [flag, inline] = argv[i].split(/=(.*)/s, 2)
        const key = FLAGS[flag]
        if (!key) continue
        if (BOOLEAN.includes(key)) {
            ;(options[key] as boolean) = true
            continue
        }
        const value = inline ?? argv[++i]
        if (value === undefined || (inline === undefined && value.startsWith('--')))
            return { error: `${flag} precisa de um valor` }
        if (key === 'runs') {
            const n = Number(value)
            if (!Number.isInteger(n) || n < 1 || n > 10_000)
                return { error: `${flag} precisa ser um número de 1 a 10000` }
            options.runs = n
        } else if (key === 'scenarios' || key === 'trustHosts') {
            options[key].push(value)
        } else {
            ;(options[key] as string) = value
        }
    }
    if (!options.help && !options.all && options.scenarios.length === 0)
        return { error: 'Diga qual cenário executar com --cenario <nome> ou use --todos' }
    return { options }
}

/** Aceita scenarios.json ({ scenarios: [...] }), uma lista de cenários ou um cenário só. */
export function extractScenarioList(data: unknown): unknown[] {
    if (Array.isArray(data)) return data
    if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>
        if (Array.isArray(obj.scenarios)) return obj.scenarios
        if (Array.isArray(obj.steps)) return [obj]
    }
    return []
}
