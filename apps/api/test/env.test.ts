import { afterEach, describe, expect, it, vi } from 'vitest'
import { booleanEnv, chaveSupabase, numeroEnv, requireEnv } from '../src/lib/env.js'

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

describe('booleanEnv', () => {
  it('lê os dois valores reconhecidos, em qualquer caixa', () => {
    process.env[VAR] = 'false'
    expect(booleanEnv(VAR, true)).toBe(false)
    process.env[VAR] = 'TRUE'
    expect(booleanEnv(VAR, false)).toBe(true)
    process.env[VAR] = ' False '
    expect(booleanEnv(VAR, true)).toBe(false)
  })

  it('cai no padrão quando a variável não existe ou está vazia', () => {
    expect(booleanEnv(VAR, true)).toBe(true)
    process.env[VAR] = '   '
    expect(booleanEnv(VAR, true)).toBe(true)
  })

  it('não obedece valor não reconhecido — o padrão manda, com aviso', () => {
    // O ponto do helper: `=== 'true'` leria 'sim' e '1' como false em silêncio,
    // e a flag que decide o que o paciente VÊ mudaria de lado por digitação.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const bruto of ['sim', '1', 'yes', 'off']) {
      process.env[VAR] = bruto
      expect(booleanEnv(VAR, true)).toBe(true)
      expect(booleanEnv(VAR, false)).toBe(false)
    }
    expect(warn).toHaveBeenCalled()
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

// S-10: as chaves legadas (`anon`/`service_role`) são JWTs assinados com o
// segredo do projeto — não se revoga uma sem rotacionar o segredo inteiro e
// derrubar toda sessão viva. As novas (`sb_secret_…`) são revogáveis uma a uma.
// Aceitar os dois nomes é o que deixa a troca acontecer em produção sem uma
// janela em que a API fique sem chave válida.
describe('chaveSupabase', () => {
  const NOVO = 'TESTE_CHAVE_NOVA'
  const LEGADO = 'TESTE_CHAVE_LEGADA'

  afterEach(() => {
    delete process.env[NOVO]
    delete process.env[LEGADO]
  })

  it('prefere a chave nova quando as duas existem', () => {
    process.env[NOVO] = 'sb_secret_nova'
    process.env[LEGADO] = 'eyJlegada'
    expect(chaveSupabase(NOVO, LEGADO)).toBe('sb_secret_nova')
  })

  it('cai na legada enquanto a migração não terminou, avisando', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[LEGADO] = 'eyJlegada'

    expect(chaveSupabase(NOVO, LEGADO)).toBe('eyJlegada')
    // O aviso é o que impede a migração de parar no meio e ser esquecida.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(NOVO))
  })

  it('não avisa se a chave nova já foi colocada na variável de nome legado', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[LEGADO] = 'sb_secret_nova'

    expect(chaveSupabase(NOVO, LEGADO)).toBe('sb_secret_nova')
    expect(warn).not.toHaveBeenCalled()
  })

  it('ignora valor só com espaços, em vez de subir com chave vazia', () => {
    process.env[NOVO] = '   '
    process.env[LEGADO] = 'sb_secret_nova'
    expect(chaveSupabase(NOVO, LEGADO)).toBe('sb_secret_nova')
  })

  it('lança nomeando as DUAS variáveis — quem lê o erro precisa saber a saída', () => {
    expect(() => chaveSupabase(NOVO, LEGADO)).toThrow(NOVO)
    expect(() => chaveSupabase(NOVO, LEGADO)).toThrow(LEGADO)
  })
})
