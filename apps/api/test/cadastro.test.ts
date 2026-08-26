import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Proxy hoisted p/ o singleton supabase.
const h = vi.hoisted(() => {
  let sb: Record<string, unknown> | null = null
  return {
    sbProxy: new Proxy({}, { get: (_t, p: string) => sb?.[p] }),
    setSb: (x: Record<string, unknown>) => {
      sb = x
    },
  }
})
vi.mock('../src/lib/supabase.js', () => ({ supabase: h.sbProxy }))

import { cadastroRoutes } from '../src/routes/cadastro.js'
import { aadDe, decifrar, hashCpf } from '../src/lib/crypto.js'
import { buildApp, createSupabaseMock, type SupaCall, type SupaHandler } from './helpers.js'

const PAC_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'

// Corpo válido do auto-cadastro. Os testes variam só o que interessa ao claim.
const CORPO = {
  email: 'maria@exemplo.test',
  password: 'SenhaDeTeste123', // atende a política do S-04: 12+, maiúscula, minúscula e dígito
  nome: 'Maria Souza',
  cpf: '390.533.447-05',
  sexo: 'F' as const,
  dataNascimento: '1990-05-14',
  telefone: '11988887777',
}
const CPF_DIGITOS = '39053344705'

// Linha que a recepção do FlowLab pré-criou: sem auth_user_id.
function fantasma(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PAC_ID,
    auth_user_id: null,
    nome: 'Maria S.',
    email: null,
    cpf: CPF_DIGITOS,
    sexo: 'F',
    data_nascimento: '1990-05-14',
    telefone: null,
    ...over,
  }
}

let app: FastifyInstance
let calls: SupaCall[]
let createUser: ReturnType<typeof vi.fn>
let deleteUser: ReturnType<typeof vi.fn>

// Monta o app com o mock do query builder + o `auth.admin` que a rota usa
// (createSupabaseMock só cobre auth.getUser).
async function montar(handler: SupaHandler): Promise<void> {
  const mock = createSupabaseMock({ handler })
  calls = mock.calls
  createUser = vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null }))
  deleteUser = vi.fn(async () => ({ data: null, error: null }))
  h.setSb({
    ...mock.client,
    auth: { ...mock.client.auth, admin: { createUser, deleteUser }, resend: vi.fn() },
  })
  app = await buildApp(cadastroRoutes)
}

// Cenário padrão: o CPF pertence a um fantasma da recepção e o UPDATE do claim
// devolve a linha reivindicada.
function cenarioFantasma(linha: Record<string, unknown> = fantasma()): SupaHandler {
  return (call) => {
    if (call.op === 'select') return { data: linha, error: null }
    if (call.op === 'update') {
      return { data: { ...linha, ...(call.payload as object), auth_user_id: USER_ID }, error: null }
    }
    return { data: null, error: null }
  }
}

async function cadastrar(body: Record<string, unknown> = CORPO) {
  return app.inject({ method: 'POST', url: '/cadastro', payload: body })
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(async () => {
  await app?.close()
  vi.unstubAllEnvs()
})

describe('POST /cadastro — claim do paciente-fantasma (P-01)', () => {
  it('reivindica o fantasma quando a data de nascimento confere', async () => {
    await montar(cenarioFantasma())
    const res = await cadastrar()

    expect(res.statusCode).toBe(201)
    expect(res.json().paciente.id).toBe(PAC_ID)
    const update = calls.find((c) => c.op === 'update')
    expect(update?.filters).toMatchObject({ id: PAC_ID, auth_user_id: null })
  })

  it('recusa o claim quando a data de nascimento não confere', async () => {
    await montar(cenarioFantasma(fantasma({ data_nascimento: '1990-05-15' })))
    const res = await cadastrar()

    expect(res.statusCode).toBe(409)
    // A recusa acontece ANTES de criar o usuário no Auth: um chute errado não
    // pode deixar conta órfã nem consumir o e-mail informado.
    expect(createUser).not.toHaveBeenCalled()
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('recusa o claim quando o fantasma não tem data de nascimento registrada', async () => {
    await montar(cenarioFantasma(fantasma({ data_nascimento: null })))
    const res = await cadastrar()

    // Fail-closed: sem o segundo fator não há claim, mesmo que o CPF bata.
    expect(res.statusCode).toBe(409)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('recusa o claim de prontuário de conta excluída, mesmo com a data certa', async () => {
    // S-09: quem pede exclusão vira fantasma de novo, mas com histórico clínico
    // retido atrás. Reivindicar isso só com CPF + nascimento seria entregar o
    // prontuário inteiro de quem pediu para sair. O caminho de volta é o balcão.
    await montar(cenarioFantasma(fantasma({ excluido_em: '2026-07-31T12:00:00Z' })))
    const res = await cadastrar()

    expect(res.statusCode).toBe(409)
    expect(createUser).not.toHaveBeenCalled()
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('não sobrescreve a data que a recepção registrou', async () => {
    await montar(cenarioFantasma())
    await cadastrar()

    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).not.toHaveProperty('data_nascimento')
    // Os campos que o fantasma não tinha continuam vindo do paciente.
    expect(update?.payload).toMatchObject({ auth_user_id: USER_ID, email: CORPO.email })
  })

  it('CPF novo cria paciente sem passar pela conferência', async () => {
    await montar((call) => {
      if (call.op === 'select') return { data: null, error: null }
      return { data: { ...fantasma(), auth_user_id: USER_ID }, error: null }
    })
    const res = await cadastrar()

    expect(res.statusCode).toBe(201)
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert?.payload).toMatchObject({ cpf: CPF_DIGITOS, data_nascimento: CORPO.dataNascimento })
  })

  it('busca o fantasma pelo CPF só em dígitos, com a data de nascimento no select', async () => {
    await montar(cenarioFantasma())
    await cadastrar()

    const select = calls.find((c) => c.op === 'select')
    expect(select?.filters).toMatchObject({ cpf: CPF_DIGITOS })
  })
})

// ---------------------------------------------------------------------------
// Fase 2b (S-06) — índice cego de pacientes.cpf, escrita dupla
// ---------------------------------------------------------------------------
// Ticket 01: a criação de paciente novo passa a gravar cpf_hash e cpf_enc além
// do cpf em claro já gravado hoje. O claim do fantasma NÃO entra aqui — ele não
// altera `cpf`, então cpf_hash/cpf_enc do fantasma já vieram corretos de quando
// a recepção o criou (integracao.ts).

describe('POST /cadastro — fase 2b: escrita dupla do índice cego', () => {
  it('paciente novo grava cpf_hash e cpf_enc corretos, junto do cpf em claro', async () => {
    await montar((call) => {
      if (call.op === 'select') return { data: null, error: null }
      return { data: { ...fantasma(), auth_user_id: USER_ID }, error: null }
    })
    const res = await cadastrar()

    expect(res.statusCode).toBe(201)
    const insert = calls.find((c) => c.op === 'insert')
    const gravado = insert?.payload as Record<string, unknown>

    expect(gravado.cpf).toBe(CPF_DIGITOS)
    expect(gravado.cpf_hash).toBe(hashCpf(CPF_DIGITOS))

    const id = gravado.id as string
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(decifrar(gravado.cpf_enc as string, aadDe('pacientes', 'cpf', id))).toBe(CPF_DIGITOS)
  })

  it('o claim do fantasma não mexe em cpf_hash/cpf_enc — cpf não muda nesse caminho', async () => {
    await montar(cenarioFantasma())
    await cadastrar()

    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).not.toHaveProperty('cpf')
    expect(update?.payload).not.toHaveProperty('cpf_hash')
    expect(update?.payload).not.toHaveProperty('cpf_enc')
  })

  it('a resposta do cadastro não expõe cpf_hash nem o envelope cru de cpf_enc', async () => {
    await montar((call) => {
      if (call.op === 'select') return { data: null, error: null }
      return { data: { ...fantasma(), auth_user_id: USER_ID }, error: null }
    })
    const res = await cadastrar()

    const corpo = res.json()
    expect(corpo.paciente).not.toHaveProperty('cpfHash')
    expect(corpo.paciente).not.toHaveProperty('cpfEnc')
    expect(res.body).not.toContain('cpf_hash')
    expect(res.body).not.toContain('cpf_enc')
  })

  // O usuário do Auth já foi criado (createUser, antes do INSERT de pacientes)
  // quando cpf_hash/cpf_enc entram em cena. Se essa parte lançasse por falta de
  // CPF_HASH_KEY, a exceção pularia o `dbError` que dispara o rollback
  // (`deleteUser`) — o usuário do Auth ficaria órfão e um retry com o mesmo
  // e-mail passaria a falhar com "já em uso" para sempre. Por isso a escrita do
  // índice cego usa as variantes tolerantes (`SeConfigurado`), não `hashCpf`/
  // `cifrar` direto: sem a chave, o cadastro segue funcionando só sem elas —
  // `cpf` em claro continua sendo a fonte de verdade nesta fase.
  it('sem CPF_HASH_KEY, o cadastro continua funcionando e não deixa o Auth órfão', async () => {
    vi.stubEnv('CPF_HASH_KEY', '')
    await montar((call) => {
      if (call.op === 'select') return { data: null, error: null }
      return { data: { ...fantasma(), auth_user_id: USER_ID }, error: null }
    })
    const res = await cadastrar()

    expect(res.statusCode).toBe(201)
    expect(deleteUser).not.toHaveBeenCalled()
    const insert = calls.find((c) => c.op === 'insert')
    // Só cpf_hash fica de fora — cpf_enc usa PII_KEY_K1, uma chave independente
    // que continua configurada neste cenário (as duas checagens são gates
    // separados, de propósito: ver crypto.ts).
    expect(insert?.payload).not.toHaveProperty('cpf_hash')
    expect(insert?.payload).toMatchObject({ cpf: CPF_DIGITOS })
  })
})

describe('POST /cadastro — política de senha (S-04)', () => {
  // Precisa espelhar a do Supabase Auth. Se afrouxar aqui, o zod deixa passar e
  // o Auth recusa depois — com mensagem em inglês, vinda da biblioteca.
  const fracas: [string, string][] = [
    ['curta demais', 'Senha12'],
    ['sem maiúscula', 'senhadeteste123'],
    ['sem minúscula', 'SENHADETESTE123'],
    ['sem dígito', 'SenhaDeTesteAbc'],
  ]
  it.each(fracas)('recusa senha %s antes de tocar no banco', async (_rotulo, password) => {
    await montar(cenarioFantasma())
    const res = await cadastrar({ ...CORPO, password })

    expect(res.statusCode).toBe(400)
    expect(calls).toHaveLength(0)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('devolve a frase da política, e não o JSON do zod', async () => {
    // O web mostra `body.message` cru na tela; mandar `error.message` do zod
    // punha um bloco de JSON na frente do paciente.
    await montar(cenarioFantasma())
    const res = await cadastrar({ ...CORPO, password: 'senhaminuscula123' })

    expect(res.json().message).toBe('Senha deve ter ao menos uma letra maiúscula')
    expect(res.payload).not.toContain('invalid_string')
  })

  it('e-mail inválido também sai em português', async () => {
    await montar(cenarioFantasma())
    const res = await cadastrar({ ...CORPO, email: 'nao-e-email' })

    expect(res.json().message).toBe('E-mail inválido')
  })
})

describe('POST /cadastro — a recusa não vira oráculo', () => {
  // O ponto do P-01: se "CPF já tem conta" e "nascimento não confere" tivessem
  // respostas diferentes, bastaria um chute por CPF para descobrir quais estão
  // na base do laboratório e ainda podem ser reivindicados.
  it('responde igual para CPF já cadastrado e para nascimento errado', async () => {
    await montar(cenarioFantasma(fantasma({ auth_user_id: 'outro-user' })))
    const jaCadastrado = await cadastrar()
    await app.close()

    await montar(cenarioFantasma(fantasma({ data_nascimento: '1975-01-02' })))
    const naoConfere = await cadastrar()

    expect(jaCadastrado.statusCode).toBe(naoConfere.statusCode)
    expect(jaCadastrado.json()).toEqual(naoConfere.json())
  })

  it('a recusa não repete de volta a data nem o CPF enviados', async () => {
    await montar(cenarioFantasma(fantasma({ data_nascimento: '1975-01-02' })))
    const res = await cadastrar()

    const corpo = res.payload
    expect(corpo).not.toContain('1975')
    expect(corpo).not.toContain(CPF_DIGITOS)
  })

  it('perder a corrida pelo fantasma devolve a mesma recusa', async () => {
    // Outro cadastro reivindicou entre o SELECT e o UPDATE: o `.is(auth_user_id,
    // null)` não casa e o UPDATE volta vazio.
    await montar((call) => {
      if (call.op === 'select') return { data: fantasma(), error: null }
      return { data: null, error: null }
    })
    const res = await cadastrar()

    expect(res.statusCode).toBe(409)
    // O usuário do Auth criado no meio do caminho precisa sumir.
    expect(deleteUser).toHaveBeenCalledWith(USER_ID)
  })

  it('colisão de CPF no INSERT devolve a mesma recusa', async () => {
    await montar((call) => {
      if (call.op === 'select') return { data: null, error: null }
      return { data: null, error: { code: '23505' } }
    })
    const res = await cadastrar()

    expect(res.statusCode).toBe(409)
    expect(deleteUser).toHaveBeenCalledWith(USER_ID)
  })
})
