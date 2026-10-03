import { describe, expect, it, vi } from 'vitest'
import { DtmfSyntaxError, parseDtmfSequence, runDtmfSequence } from '@renderer/lib/dtmf'

describe('parseDtmfSequence', () => {
  it('lê dígitos, pausas e separadores', () => {
    expect(parseDtmfSequence('1,w2,43#')).toEqual([
      { type: 'tone', tone: '1' },
      { type: 'wait', ms: 2000 },
      { type: 'tone', tone: '4' },
      { type: 'tone', tone: '3' },
      { type: 'tone', tone: '#' }
    ])
  })

  it('aceita pausa decimal e letras A-D em minúscula', () => {
    expect(parseDtmfSequence('w1.5 a*')).toEqual([
      { type: 'wait', ms: 1500 },
      { type: 'tone', tone: 'A' },
      { type: 'tone', tone: '*' }
    ])
  })

  it('aponta o caractere inválido', () => {
    expect(() => parseDtmfSequence('12x')).toThrow(/"x" não é um dígito DTMF \(posição 3\)/)
  })

  it('exige os segundos depois de w', () => {
    expect(() => parseDtmfSequence('1w')).toThrow(DtmfSyntaxError)
  })

  it('limita a pausa a 60 s', () => {
    expect(() => parseDtmfSequence('w61')).toThrow(/60 s/)
  })
})

describe('runDtmfSequence', () => {
  it('envia na ordem, com intervalo entre dígitos e as pausas pedidas', async () => {
    vi.useFakeTimers()
    const sent: Array<[string, number]> = []
    const start = Date.now()
    const done = runDtmfSequence(parseDtmfSequence('12w1#'), async (tone) => {
      sent.push([tone, Date.now() - start])
    }, undefined, 200)
    await vi.runAllTimersAsync()
    await done
    expect(sent).toEqual([
      ['1', 0],
      ['2', 200],
      ['#', 1200]
    ])
    vi.useRealTimers()
  })

  it('para quando o sinal é abortado', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const sent: string[] = []
    const done = runDtmfSequence(parseDtmfSequence('1w5 2'), async (t) => void sent.push(t), controller.signal)
    await vi.advanceTimersByTimeAsync(100)
    controller.abort()
    await expect(done).rejects.toThrow('Sequência interrompida')
    expect(sent).toEqual(['1'])
    vi.useRealTimers()
  })
})
