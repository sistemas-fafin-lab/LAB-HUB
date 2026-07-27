import { afterEach, describe, expect, it, vi } from 'vitest'
import { numeroEnv, requireEnv } from '../src/lib/env.js'

// Config quebrada não pode virar comportamento estranho. Os dois modos de falha
// abaixo são reais e aconteciam antes do guard:
//   - APLIS_PERIODO_DIAS inválido → NaN → setDate(getDate() - NaN) → Invalid
//     Date → toISOString() lança RangeError → GET /laudos devolve 500;
//   - EXAM_CACHE_TTL_HOURS inválido → TTL NaN → toda comparação de validade dá
//     false → o cache NUNCA vence e o paciente fica com o laudo velho para
//     sempre, sem erro nenhum aparecer.

const VAR = 'TESTE_NUMERO_ENV'

afterEach(() => {
  delete process.env[VAR]
  vi.restoreAllMocks()
})

describe('numeroEnv', () => {
  it('usa o valor quando é um número válido', () => {
    process.env[VAR] = '45'
    expect(numeroEnv(VAR, 90)).toBe(45)
  })

  it('cai no padrão quando a variável não existe', () => {
    expect(numeroEnv(VAR, 90)).toBe(90)
  })

  it('cai no padrão quando a variável está vazia ou só com espaços', () => {
    // `Number('')` é 0, não NaN — daí o caso vazio precisar de tratamento próprio.
    process.env[VAR] = ''
    expect(numeroEnv(VAR, 90)).toBe(90)
    process.env[VAR] = '   '
    expect(numeroEnv(VAR, 90)).toBe(90)
  })

  it('cai no padrão quando o valor não é numérico, em vez de propagar NaN', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[VAR] = '90 dias'
    expect(numeroEnv(VAR, 90)).toBe(90)
  })

  it('avisa no boot quando descarta um valor — senão o erro de digitação some', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[VAR] = 'abc'

    numeroEnv(VAR, 90)

    expect(aviso).toHaveBeenCalledOnce()
    expect(aviso.mock.calls[0]?.[0]).toContain(VAR)
  })

  it('respeita o mínimo: zero é válido por padrão, mas não quando mínimo é 1', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[VAR] = '0'
    // TTL de cache: zero é legítimo, desliga o cache.
    expect(numeroEnv(VAR, 30_000)).toBe(0)
    // Timeout: zero abortaria a chamada na hora — vira o padrão.
    expect(numeroEnv(VAR, 8000, 1)).toBe(8000)
  })

  it('rejeita negativo — período retroativo negativo buscaria no futuro', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[VAR] = '-30'
    expect(numeroEnv(VAR, 90, 1)).toBe(90)
  })
})

describe('requireEnv', () => {
  it('devolve o valor quando existe', () => {
    process.env[VAR] = 'valor'
    expect(requireEnv(VAR)).toBe('valor')
  })

  it('lança nomeando a variável — erro de boot tem que dizer qual falta', () => {
    expect(() => requireEnv(VAR)).toThrow(VAR)
  })
})
