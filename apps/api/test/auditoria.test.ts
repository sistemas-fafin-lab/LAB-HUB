import { afterEach, describe, expect, it, vi } from 'vitest'

// Proxy hoisted p/ o singleton supabase — mesmo padrão dos testes de rota.
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

import { ACOES, ipDaRequisicao, registrarAcesso } from '../src/lib/auditoria.js'
import { createSupabaseMock, type SupaResult } from './helpers.js'

const IP = '187.45.13.9'

function log() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn() }
}

function setup(resultado?: SupaResult) {
  const mock = createSupabaseMock({
    handler: () => resultado ?? { data: null, error: null },
  })
  h.setSb(mock.client)
  return mock
}

/** Payload do insert em `auditoria_acesso`, já achado entre as chamadas do mock. */
function linhaGravada(mock: ReturnType<typeof createSupabaseMock>): Record<string, unknown> {
  const call = mock.calls.find((c) => c.table === 'auditoria_acesso' && c.op === 'insert')
  expect(call, 'nenhum insert em auditoria_acesso').toBeDefined()
  return call!.payload as Record<string, unknown>
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ipDaRequisicao', () => {
  it('aceita IPv4 e IPv6', () => {
    expect(ipDaRequisicao({ ip: IP })).toBe(IP)
    expect(ipDaRequisicao({ ip: '2804:14d:5c81:8a00::1' })).toBe('2804:14d:5c81:8a00::1')
  })

  it('preserva a forma IPv4-mapeada, que o Postgres normaliza sozinho', () => {
    expect(ipDaRequisicao({ ip: '::ffff:187.45.13.9' })).toBe('::ffff:187.45.13.9')
  })

  it('devolve null para valor que não é endereço', () => {
    // O caso real: X-Forwarded-For é escrito pelo cliente, e num salto de proxy
    // configurado a mais isso chega aqui como se fosse o IP de origem. A coluna
    // é `inet` e recusaria a linha inteira — degradar o campo para nulo é o que
    // mantém o resto do registro (quem leu o quê) na trilha.
    expect(ipDaRequisicao({ ip: 'nao-e-um-ip' })).toBeNull()
    expect(ipDaRequisicao({ ip: '' })).toBeNull()
    expect(ipDaRequisicao({ ip: '   ' })).toBeNull()
    expect(ipDaRequisicao({ ip: undefined as unknown as string })).toBeNull()
  })
})

describe('registrarAcesso — o que vai para a trilha', () => {
  it('grava ator, titular, ação, recurso e IP', async () => {
    const mock = setup()

    await registrarAcesso({ ip: IP, log: log() as never }, {
      atorTipo: 'paciente',
      atorId: 'pac-1',
      titularId: 'pac-1',
      acao: 'laudos.ler',
      recursoTipo: 'exam_result',
      recursoId: 'linha-7',
      quantidade: 3,
    })

    expect(linhaGravada(mock)).toEqual({
      ator_tipo: 'paciente',
      ator_id: 'pac-1',
      titular_id: 'pac-1',
      acao: 'laudos.ler',
      recurso_tipo: 'exam_result',
      recurso_id: 'linha-7',
      quantidade: 3,
      ip: IP,
    })
  })

  it('campos ausentes viram null explícito, não undefined', async () => {
    // O canal do FlowLab não tem ator_id (é um sistema) nem recurso_id na busca.
    // `undefined` no payload do PostgREST some do JSON e a coluna cai no default;
    // aqui não há default nenhum, então a diferença seria só teórica — mas a
    // trilha é lida por SQL meses depois, e `is null` precisa ser verdade.
    const mock = setup()

    await registrarAcesso({ ip: IP, log: log() as never }, {
      atorTipo: 'flowlab',
      acao: 'integracao.pacientes.buscar',
      recursoTipo: 'paciente',
      quantidade: 8,
    })

    const linha = linhaGravada(mock)
    expect(linha.ator_id).toBeNull()
    expect(linha.titular_id).toBeNull()
    expect(linha.recurso_id).toBeNull()
    expect(linha.ator_tipo).toBe('flowlab')
  })

  it('não grava conteúdo — só as chaves de metadado previstas', async () => {
    // A regra do § S-08 em forma de teste: uma trilha que copia o laudo para
    // poder auditar o laudo dobra a superfície de vazamento. Se alguém acrescentar
    // um campo com dado clínico ou PII ao registro, este teste cai.
    const mock = setup()

    await registrarAcesso({ ip: IP, log: log() as never }, {
      atorTipo: 'paciente',
      atorId: 'pac-1',
      titularId: 'pac-1',
      acao: 'resultados.listar',
      quantidade: 2,
    })

    expect(Object.keys(linhaGravada(mock)).sort()).toEqual([
      'acao',
      'ator_id',
      'ator_tipo',
      'ip',
      'quantidade',
      'recurso_id',
      'recurso_tipo',
      'titular_id',
    ])
  })

  it('todas as ações do vocabulário são graváveis', async () => {
    const mock = setup()

    for (const acao of ACOES) {
      await registrarAcesso({ ip: IP, log: log() as never }, { atorTipo: 'paciente', acao })
    }

    const gravadas = mock.calls
      .filter((c) => c.table === 'auditoria_acesso')
      .map((c) => (c.payload as { acao: string }).acao)
    expect(gravadas).toEqual([...ACOES])
  })
})

describe('registrarAcesso — falhar não pode derrubar a leitura', () => {
  const registro = {
    atorTipo: 'paciente' as const,
    atorId: 'pac-1',
    titularId: 'pac-1',
    acao: 'laudos.listar' as const,
    quantidade: 4,
  }

  it('erro do PostgREST não vira exceção, e o registro cai no log', async () => {
    setup({ data: null, error: { message: 'permission denied' } })
    const l = log()

    await expect(
      registrarAcesso({ ip: IP, log: l as never }, registro),
    ).resolves.toBeUndefined()

    // O log é a trilha de reserva: a linha perdida no banco precisa estar
    // INTEIRA aqui, senão a falha de gravação vira uma lacuna silenciosa.
    expect(l.error).toHaveBeenCalledTimes(1)
    const [obj, msg] = l.error.mock.calls[0] as [Record<string, unknown>, string]
    expect(msg).toContain('S-08')
    expect(obj.auditoria).toMatchObject({ acao: 'laudos.listar', ator_id: 'pac-1', ip: IP })
  })

  it('throw do client (rede caída) também é contido', async () => {
    // O `error` do PostgREST não cobre DNS/socket: sem o catch, a rejeição
    // subiria pela rota e o paciente perderia o laudo porque a AUDITORIA caiu.
    h.setSb({
      from: () => ({
        insert: () => {
          throw new Error('getaddrinfo ENOTFOUND')
        },
      }),
    })
    const l = log()

    await expect(
      registrarAcesso({ ip: IP, log: l as never }, registro),
    ).resolves.toBeUndefined()
    expect(l.error).toHaveBeenCalledTimes(1)
  })
})
