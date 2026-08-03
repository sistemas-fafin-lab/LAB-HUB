import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  aadDe,
  cifrar,
  cifrarJson,
  cifrarJsonSeConfigurado,
  criptografiaConfigurada,
  decifrar,
  decifrarJson,
  validarCriptografia,
} from '../src/lib/crypto.js'

// Chave alternativa (k2), para os casos de rotação e de chave errada.
const K2 = 'M/lZ0Y0kZ2ULQ1oXAJk3sCg1u6Xd0hJcYYWuLmM+tXo='

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('cifrar/decifrar', () => {
  const aad = aadDe('exam_results', 'result', 'linha-1')

  it('ida e volta preserva o texto', () => {
    expect(decifrar(cifrar('Hemoglobina 14,2 g/dL', aad), aad)).toBe('Hemoglobina 14,2 g/dL')
  })

  it('ida e volta preserva JSON estruturado', () => {
    const laudo = [{ name: 'Hemograma', panels: [{ name: 'Série vermelha', valor: 4.9 }] }]
    expect(decifrarJson(cifrarJson(laudo, aad), aad)).toEqual(laudo)
  })

  it('o mesmo texto cifrado duas vezes dá envelopes diferentes', () => {
    // IV aleatório: sem isto, ciphertext igual revelaria que dois pacientes têm
    // o mesmo resultado. É também a razão pela qual coluna cifrada não serve
    // para comparação de igualdade — ver o blind index da fase 2.
    expect(cifrar('mesmo valor', aad)).not.toBe(cifrar('mesmo valor', aad))
  })

  it('o envelope declara versão e chave', () => {
    const [versao, keyId, iv, tag, ct] = cifrar('x', aad).split(':')
    expect(versao).toBe('v1')
    expect(keyId).toBe('k1')
    expect(Buffer.from(iv!, 'base64')).toHaveLength(12)
    expect(Buffer.from(tag!, 'base64')).toHaveLength(16)
    expect(ct).toBeTruthy()
  })
})

describe('AAD — a linha faz parte do que é autenticado', () => {
  it('recusa o envelope movido para outra linha', () => {
    // O ataque que só o AAD impede: quem tem escrita no banco copia o laudo do
    // paciente A para a linha do paciente B. Sem AAD a decifragem funciona e o
    // prontuário aparece sob o dono errado, sem erro nenhum em lugar nenhum.
    const envelope = cifrar('laudo do paciente A', aadDe('exam_results', 'result', 'linha-A'))

    expect(() => decifrar(envelope, aadDe('exam_results', 'result', 'linha-B'))).toThrow()
  })

  it('recusa o envelope movido para outra coluna da mesma linha', () => {
    const envelope = cifrar('valor', aadDe('resultados', 'paineis', 'linha-1'))

    expect(() => decifrar(envelope, aadDe('resultados', 'resumo', 'linha-1'))).toThrow()
  })
})

describe('integridade', () => {
  const aad = aadDe('resultados', 'resumo', 'linha-1')

  it('recusa ciphertext adulterado', () => {
    const [v, k, iv, tag, ct] = cifrar('resultado normal', aad).split(':')
    const bytes = Buffer.from(ct!, 'base64')
    bytes[0] = bytes[0]! ^ 0xff
    const adulterado = [v, k, iv, tag, bytes.toString('base64')].join(':')

    expect(() => decifrar(adulterado, aad)).toThrow()
  })

  it('recusa tag de autenticação trocada', () => {
    const [v, k, iv, , ct] = cifrar('resultado normal', aad).split(':')
    const outraTag = Buffer.alloc(16, 7).toString('base64')

    expect(() => decifrar([v, k, iv, outraTag, ct].join(':'), aad)).toThrow()
  })

  it('recusa envelope malformado', () => {
    expect(() => decifrar('nao-e-envelope', aad)).toThrow(/malformado/)
    expect(() => decifrar('v1:k1:só:três', aad)).toThrow(/malformado/)
  })

  it('recusa versão desconhecida', () => {
    const envelope = cifrar('x', aad).replace(/^v1:/, 'v9:')
    expect(() => decifrar(envelope, aad)).toThrow(/desconhecido/)
  })
})

describe('chaves', () => {
  const aad = aadDe('exam_results', 'result', 'linha-1')

  it('diz qual chave falta quando o envelope aponta para uma ausente', () => {
    vi.stubEnv('PII_KEY_K2', K2)
    const comK2 = cifrar('x', aad) // k2 é a de escrita: maior número vence
    expect(comK2.startsWith('v1:k2:')).toBe(true)

    vi.stubEnv('PII_KEY_K2', '')
    expect(() => decifrar(comK2, aad)).toThrow(/k2 indispon/)
  })

  it('rotação: a chave nova escreve e a antiga continua lendo', () => {
    const comK1 = cifrar('gravado antes da rotação', aad)

    vi.stubEnv('PII_KEY_K2', K2)
    const comK2 = cifrar('gravado depois', aad)

    expect(comK2.startsWith('v1:k2:')).toBe(true)
    // O ponto da rotação: nada de reescrever tudo numa parada programada.
    expect(decifrar(comK1, aad)).toBe('gravado antes da rotação')
    expect(decifrar(comK2, aad)).toBe('gravado depois')
  })

  it('PII_CHAVE_ATUAL força qual chave escreve durante a transição', () => {
    vi.stubEnv('PII_KEY_K2', K2)
    vi.stubEnv('PII_CHAVE_ATUAL', 'k1')
    expect(cifrar('x', aad).startsWith('v1:k1:')).toBe(true)
  })

  it('recusa PII_CHAVE_ATUAL apontando para chave inexistente', () => {
    vi.stubEnv('PII_CHAVE_ATUAL', 'k9')
    expect(() => cifrar('x', aad)).toThrow(/não corresponde/)
  })

  it('recusa chave que não tem 32 bytes', () => {
    vi.stubEnv('PII_KEY_K1', Buffer.alloc(16).toString('base64'))
    expect(() => cifrar('x', aad)).toThrow(/AES-256/)
  })
})

describe('boot', () => {
  it('em produção, sem chave, o boot falha', () => {
    vi.stubEnv('PII_KEY_K1', '')
    vi.stubEnv('NODE_ENV', 'production')

    // Deliberado: laudo em texto puro é um controle que se acredita ter e não se
    // tem. API fora do ar é ruidoso e se resolve em um minuto.
    expect(() => validarCriptografia()).toThrow(/PII_KEY_K1 é obrigatória em produção/)
  })

  it('fora de produção, sem chave, avisa e segue', () => {
    vi.stubEnv('PII_KEY_K1', '')
    vi.stubEnv('NODE_ENV', 'test')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => validarCriptografia()).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TEXTO PURO'))
    warn.mockRestore()
  })

  it('chave malformada derruba o boot mesmo fora de produção', () => {
    vi.stubEnv('PII_KEY_K1', 'nao-e-base64-de-32-bytes')
    vi.stubEnv('NODE_ENV', 'test')
    expect(() => validarCriptografia()).toThrow(/AES-256/)
  })

  it('sem chave, o caminho de escrita devolve null em vez de explodir', () => {
    vi.stubEnv('PII_KEY_K1', '')
    expect(criptografiaConfigurada()).toBe(false)
    expect(cifrarJsonSeConfigurado({ a: 1 }, 'x')).toBeNull()
  })
})
