import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  aadDe,
  cifrar,
  cifrarJson,
  cifrarJsonSeConfigurado,
  criptografiaConfigurada,
  decifrar,
  decifrarJson,
  hashCpf,
  hashCpfConfigurado,
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
    // O aviso mudou com o corte do S-06: a coluna em claro não é mais escrita,
    // então sem chave a gravação FALHA em vez de degradar para texto puro.
    // Prometer texto puro aqui seria mentir num aviso de segurança.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FALHAR'))
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('gravado em TEXTO PURO'))
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

  // CPF_HASH_KEY (fase 2b) segue o MESMO padrão fail-closed da PII_KEY_K1, mas
  // é uma checagem INDEPENDENTE — nenhuma das duas mascara a ausência da outra.
  it('em produção, sem CPF_HASH_KEY, o boot falha', () => {
    vi.stubEnv('CPF_HASH_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => validarCriptografia()).toThrow(/CPF_HASH_KEY é obrigatória em produção/)
  })

  it('fora de produção, sem CPF_HASH_KEY, avisa e segue', () => {
    vi.stubEnv('CPF_HASH_KEY', '')
    vi.stubEnv('NODE_ENV', 'test')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => validarCriptografia()).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CPF_HASH_KEY ausente'))
    warn.mockRestore()
  })

  it('chave de índice cego malformada derruba o boot mesmo fora de produção', () => {
    vi.stubEnv('CPF_HASH_KEY', 'nao-e-base64-de-32-bytes')
    vi.stubEnv('NODE_ENV', 'test')
    expect(() => validarCriptografia()).toThrow(/HMAC/)
  })

  it('PII_KEY_K1 ausente não esconde a checagem de CPF_HASH_KEY', () => {
    vi.stubEnv('PII_KEY_K1', '')
    vi.stubEnv('CPF_HASH_KEY', '')
    vi.stubEnv('NODE_ENV', 'test')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    validarCriptografia()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PII_KEY_K1 ausente'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CPF_HASH_KEY ausente'))
    warn.mockRestore()
  })
})

describe('hashCpf — índice cego do CPF (fase 2b)', () => {
  it('o mesmo CPF normalizado sempre produz o mesmo hash', () => {
    expect(hashCpf('52998224725')).toBe(hashCpf('52998224725'))
  })

  it('CPFs diferentes produzem hashes diferentes', () => {
    expect(hashCpf('52998224725')).not.toBe(hashCpf('11144477735'))
  })

  it('a saída não depende de formatação, desde que normalizado antes', () => {
    const semMascara = '52998224725'
    const comMascaraNormalizada = '529.982.247-25'.replace(/\D/g, '')
    expect(hashCpf(semMascara)).toBe(hashCpf(comMascaraNormalizada))
  })

  it('não é reversível a olho: a saída não contém o CPF nem parece com ele', () => {
    const hash = hashCpf('52998224725')
    expect(hash).not.toContain('52998224725')
  })

  it('hashCpfConfigurado reflete a presença da chave', () => {
    expect(hashCpfConfigurado()).toBe(true)
    vi.stubEnv('CPF_HASH_KEY', '')
    expect(hashCpfConfigurado()).toBe(false)
  })

  it('sem CPF_HASH_KEY, hashCpf falha fechado em vez de devolver algo', () => {
    vi.stubEnv('CPF_HASH_KEY', '')
    expect(() => hashCpf('52998224725')).toThrow(/CPF_HASH_KEY não configurada/)
  })

  it('recusa CPF_HASH_KEY que não tem 32 bytes', () => {
    vi.stubEnv('CPF_HASH_KEY', Buffer.alloc(16).toString('base64'))
    expect(() => hashCpf('52998224725')).toThrow(/HMAC/)
  })

  // A separação de chaves é o ponto central do desenho (spec § Implementation
  // Decisions): reaproveitar PII_KEY_K1 para o HMAC anularia a independência
  // entre as duas primitivas.
  it('usa CPF_HASH_KEY, não PII_KEY_K1 — trocar uma não afeta a outra', () => {
    const antes = hashCpf('52998224725')
    vi.stubEnv('PII_KEY_K1', K2)
    expect(hashCpf('52998224725')).toBe(antes)
  })
})
