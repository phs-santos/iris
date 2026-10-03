// Definição dos passos de cenário (RF-28): rótulos, valores padrão, validação e leitura de arquivo.

import type { Scenario, ScenarioCallState, ScenarioCheck, ScenarioStep, ScenarioStepType } from '@shared/types'
import { parseDtmfSequence } from './dtmf'

export const STEP_TYPES: Array<{ type: ScenarioStepType; label: string }> = [
    { type: 'register', label: 'Registrar' },
    { type: 'dial', label: 'Discar' },
    { type: 'answer', label: 'Atender' },
    { type: 'wait', label: 'Esperar' },
    { type: 'waitState', label: 'Aguardar estado' },
    { type: 'dtmf', label: 'DTMF' },
    { type: 'transfer', label: 'Transferir' },
    { type: 'hangup', label: 'Desligar' },
    { type: 'verify', label: 'Verificar' }
]

export const CALL_STATES: Array<{ state: ScenarioCallState; label: string }> = [
    { state: 'ringing', label: 'chamando' },
    { state: 'early', label: 'early media' },
    { state: 'established', label: 'em chamada' },
    { state: 'held', label: 'em espera' },
    { state: 'ended', label: 'encerrada' }
]

export const CHECKS: Array<{ check: ScenarioCheck; label: string; hint: string }> = [
    { check: 'code', label: 'código SIP', hint: 'ex.: 486' },
    { check: 'dtmfReceived', label: 'DTMF recebido', hint: 'ex.: 1234' },
    { check: 'log', label: 'texto no log', hint: 'ex.: URA atendeu' }
]

export const stepLabel = (type: ScenarioStepType): string => STEP_TYPES.find((t) => t.type === type)?.label ?? type
export const stateLabel = (state: ScenarioCallState): string =>
    CALL_STATES.find((s) => s.state === state)?.label ?? state

/** Passo novo com valores padrão; `call` é o apelido da última chamada do cenário. */
export function newStep(type: ScenarioStepType, call = 'c1'): ScenarioStep {
    switch (type) {
        case 'register':
            return { type }
        case 'dial':
            return { type, to: '', call }
        case 'answer':
            return { type, call, timeoutMs: 10_000 }
        case 'wait':
            return { type, ms: 1000 }
        case 'waitState':
            return { type, call, state: 'established', timeoutMs: 10_000 }
        case 'dtmf':
            return { type, call, digits: '' }
        case 'transfer':
            return { type, call, to: '' }
        case 'hangup':
            return { type, call }
        case 'verify':
            return { type, call, check: 'code', expected: '' }
    }
}

export function newScenario(accountId = '', partial: Partial<Scenario> = {}): Scenario {
    return {
        id: crypto.randomUUID(),
        name: 'Novo cenário',
        accountId,
        steps: [newStep('register'), newStep('dial'), newStep('waitState'), newStep('hangup')],
        ...partial
    }
}

/** Resumo de uma linha do passo, usado no relatório e no log. */
export function describeStep(step: ScenarioStep, accountName: (id?: string) => string): string {
    switch (step.type) {
        case 'register':
            return `Registrar ${accountName(step.account)}`
        case 'dial':
            return `Discar ${step.to} de ${accountName(step.account)} (${step.call})`
        case 'answer':
            return `Atender em ${accountName(step.account)} (${step.call})`
        case 'wait':
            return `Esperar ${step.ms} ms`
        case 'waitState':
            return `Aguardar ${step.call} ${stateLabel(step.state)}`
        case 'dtmf':
            return `DTMF ${step.digits} em ${step.call}`
        case 'transfer':
            return `Transferir ${step.call} para ${step.to}`
        case 'hangup':
            return `Desligar ${step.call}`
        case 'verify': {
            const check = CHECKS.find((c) => c.check === step.check)?.label ?? step.check
            return `Verificar ${check} "${step.expected}"${step.check === 'log' ? '' : ` em ${step.call}`}`
        }
    }
}

/** Erros do passo antes de executar; vazio quando está pronto. */
export function validateStep(step: ScenarioStep, known: Set<string>): string | null {
    const needsCall = (call: string): string | null =>
        !call.trim() ? 'Escolha a chamada' : known.has(call) ? null : `A chamada ${call} ainda não existe neste ponto`
    switch (step.type) {
        case 'register':
            return null
        case 'dial':
            return !step.to.trim() ? 'Informe o número' : !step.call.trim() ? 'Dê um apelido à chamada' : null
        case 'answer':
            return !step.call.trim() ? 'Dê um apelido à chamada' : step.timeoutMs <= 0 ? 'Tempo inválido' : null
        case 'wait':
            return step.ms < 0 ? 'Tempo inválido' : null
        case 'waitState':
            return needsCall(step.call) ?? (step.timeoutMs <= 0 ? 'Tempo inválido' : null)
        case 'dtmf':
            try {
                parseDtmfSequence(step.digits)
            } catch (error) {
                return (error as Error).message
            }
            return needsCall(step.call)
        case 'transfer':
            return needsCall(step.call) ?? (!step.to.trim() ? 'Informe o destino' : null)
        case 'hangup':
            return needsCall(step.call)
        case 'verify':
            if (!step.expected.trim()) return 'Informe o valor esperado'
            return step.check === 'log' ? null : needsCall(step.call)
    }
}

/** Valida o cenário inteiro, passo a passo, acompanhando quais apelidos de chamada já existem. */
export function validateScenario(scenario: Scenario): Array<string | null> {
    const known = new Set<string>()
    return scenario.steps.map((step) => {
        const error = validateStep(step, known)
        if (step.type === 'dial' || step.type === 'answer') known.add(step.call.trim())
        return error
    })
}

/** Último apelido de chamada criado antes da posição `index`, para preencher passos novos. */
export function lastCallAlias(steps: ScenarioStep[], index = steps.length): string {
    for (let i = index - 1; i >= 0; i--) {
        const step = steps[i]
        if (step.type === 'dial' || step.type === 'answer') return step.call
    }
    return 'c1'
}

/** Lê cenários de arquivo, completando campos que faltam e descartando passos desconhecidos (RNF-19). */
export function normalizeScenarios(data: unknown): Scenario[] {
    if (!Array.isArray(data)) return []
    return data
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map((raw) => {
            const steps = Array.isArray(raw.steps) ? raw.steps : []
            return {
                id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
                name: typeof raw.name === 'string' ? raw.name : 'Cenário',
                accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
                steps: steps
                    .filter((s): s is ScenarioStep => STEP_TYPES.some((t) => t.type === (s as ScenarioStep)?.type))
                    .map((s) => ({ ...newStep(s.type), ...s }) as ScenarioStep)
            }
        })
}
