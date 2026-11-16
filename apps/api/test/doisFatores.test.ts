import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Verificação em duas etapas por e-mail (PV2-26). O envio e a conferência do
// código no Supabase são dublês; o resto (middleware, rotas, contagem de
// tentativas) é o real.

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


import { doisFatoresRoutes } from '../src/routes/doisFatores.js'
import { resultadosRoutes } from '../src/routes/resultados.js'
import { pacientesRoutes } from '../src/routes/pacientes.js'
import { buildApp, createSupabaseMock, type SupaCall } from './helpers.js'
import { otp as otpReal } from '../src/lib/doisFatores.js'

// Envio e conferência no Supabase Auth: dublês no objeto que o módulo usa.
const otp = { enviar: vi.fn(), conferir: vi.fn() }
otpReal.enviar = (...a: Parameters<typeof otpReal.enviar>) => otp.enviar(...a)
otpReal.conferir = (...a: Parameters<typeof otpReal.conferir>) => otp.conferir(...a)

const PAC_ID = '11111111-1111-1111-1111-111111111111'
const SESSAO = '33333333-3333-3333-3333-333333333333'

/** JWT só com o payload que a API lê (o Auth já o aceitou no getUser). */
function jwt(amr: string[], sessionId = SESSAO, senhaHaS = 60): string {
  const timestamp = Math.floor(Date.now() / 1000) - senhaHaS
  const payload = Buffer.from(
    JSON.stringify({ session_id: sessionId, amr: amr.map((method) => ({ method, timestamp })) }),
  ).toString('base64url')
  return `cabecalho.${payload}.assinatura`
}
const PELA_SENHA = jwt(['password'])
const SO_PELO_CODIGO = jwt(['otp'])

interface Cenario {
  doisFatores: boolean
  linha: Record<string, unknown> | null
  /** O update condicional da tentativa não acha a linha (outra conferência chegou antes). */
  corrida?: boolean
  /** Linha de bloqueios_dois_fatores da conta. */
  bloqueio?: { falhas: number; desde: string } | null
  /** A gravação que marca a sessão como verificada falha. */
  falhaAoVerificar?: boolean
}

let app: FastifyInstance
let calls: SupaCall[]
let cenario: Cenario

async function montar(rotas = doisFatoresRoutes) {
  const mock = createSupabaseMock({
    getUser: { data: { user: { id: 'auth-1', email: 'maria@exemplo.test' } }, error: null },
    handler: (call) => {
      if (call.table === 'pacientes' && call.op === 'select') {
        return { data: { id: PAC_ID, dois_fatores_email: cenario.doisFatores }, error: null }
      }
      if (call.table === 'sessoes_dois_fatores' && call.op === 'select') return { data: cenario.linha, error: null }
      if (call.table === 'sessoes_dois_fatores' && call.op === 'update') {
        if (cenario.falhaAoVerificar && 'verificada_em' in (call.payload as object)) {
          return { data: null, error: { message: 'timeout' } }
        }
        return { data: cenario.corrida ? [] : [{ session_id: SESSAO }], error: null }
      }
      if (call.table === 'bloqueios_dois_fatores' && call.op === 'select') return { data: cenario.bloqueio ?? null, error: null }
      if (call.table === 'resultados') return { data: [], error: null }
      return { data: null, error: null }
    },
  })
  calls = mock.calls
  h.setSb({ ...mock.client, auth: { ...mock.client.auth, admin: { signOut: vi.fn(), deleteUser: vi.fn() } } })
  app = await buildApp(rotas)
}

const pedir = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) })

const atualizacoes = () => calls.filter((c) => c.table === 'sessoes_dois_fatores' && c.op === 'update')

beforeEach(() => {
  vi.clearAllMocks()
  cenario = { doisFatores: true, linha: null }
})
afterEach(async () => {
  await app?.close()
})

describe('rotas de dados com a verificação ligada', () => {
  it('a sessão só com a senha recebe 403 DOIS_FATORES_PENDENTE', async () => {
    await montar(resultadosRoutes)
    const res = await pedir('GET', '/resultados', PELA_SENHA)
    expect(res.statusCode).toBe(403)
    expect(res.json().codigo).toBe('DOIS_FATORES_PENDENTE')
  })

  it('a sessão verificada passa', async () => {
    cenario.linha = { session_id: SESSAO, verificada_em: '2026-11-16T10:00:00Z', enviado_em: null, tentativas: 0 }
    await montar(resultadosRoutes)
    expect((await pedir('GET', '/resultados', PELA_SENHA)).statusCode).toBe(200)
  })

  it('a sessão aberta só pelo código nunca passa, nem com a linha verificada', async () => {
    cenario.linha = { session_id: SESSAO, verificada_em: '2026-11-16T10:00:00Z', enviado_em: null, tentativas: 0 }
    await montar(resultadosRoutes)
    expect((await pedir('GET', '/resultados', SO_PELO_CODIGO)).statusCode).toBe(403)
  })

  it('com a verificação desligada, nada muda', async () => {
    cenario.doisFatores = false
    await montar(resultadosRoutes)
    expect((await pedir('GET', '/resultados', PELA_SENHA)).statusCode).toBe(200)
  })
})

describe('enviar e verificar', () => {
  it('envia o código para a sessão que entrou pela senha', async () => {
    otp.enviar.mockResolvedValue({ ok: true, limite: false })
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/enviar', PELA_SENHA, { finalidade: 'login' })
    expect(res.statusCode).toBe(200)
    expect(otp.enviar).toHaveBeenCalledWith('maria@exemplo.test')
    expect(calls.some((c) => c.table === 'sessoes_dois_fatores' && c.op === 'upsert')).toBe(true)
  })

  it('a sessão aberta só pelo código não pede o código de entrada', async () => {
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/enviar', SO_PELO_CODIGO, { finalidade: 'login' })
    expect(res.statusCode).toBe(403)
    expect(otp.enviar).not.toHaveBeenCalled()
  })

  it('um envio por minuto', async () => {
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/enviar', PELA_SENHA, { finalidade: 'login' })
    expect(res.statusCode).toBe(429)
    expect(otp.enviar).not.toHaveBeenCalled()
  })

  it('o código certo libera a sessão', async () => {
    otp.conferir.mockResolvedValue(true)
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '123456' })
    expect(res.statusCode).toBe(200)
    expect(atualizacoes().some((c) => typeof (c.payload as { verificada_em?: unknown }).verificada_em === 'string')).toBe(true)
  })

  it('o código errado conta uma tentativa e não libera', async () => {
    otp.conferir.mockResolvedValue(false)
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 2 }
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '000000' })
    expect(res.statusCode).toBe(400)
    expect(res.json().codigo).toBe('CODIGO_INVALIDO')
    expect(atualizacoes()[0]?.payload).toEqual({ tentativas: 3 })
    expect(atualizacoes()[0]?.filters).toMatchObject({ tentativas: 2 })
    expect(atualizacoes().some((c) => 'verificada_em' in (c.payload as object))).toBe(false)
  })

  it('esgotadas as 5 tentativas, nem confere: pede um código novo', async () => {
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 5 }
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '123456' })
    expect(res.statusCode).toBe(429)
    expect(res.json().codigo).toBe('TENTATIVAS_ESGOTADAS')
    expect(otp.conferir).not.toHaveBeenCalled()
  })

  it('a sessão aberta só pelo código não é liberada pelo código', async () => {
    otp.conferir.mockResolvedValue(true)
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/verificar', SO_PELO_CODIGO, { codigo: '123456' })
    expect(res.statusCode).toBe(403)
    expect(otp.conferir).not.toHaveBeenCalled()
  })
})

describe('limites', () => {
  it('duas conferências em paralelo: a que perde a reserva da tentativa nem confere', async () => {
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 4 }
    cenario.corrida = true
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '123456' })
    expect(res.statusCode).toBe(429)
    expect(otp.conferir).not.toHaveBeenCalled()
  })

  it('senha digitada há mais de 30 minutos não pede nem confere o código de entrada', async () => {
    const antiga = jwt(['password'], SESSAO, 31 * 60)
    await montar()
    expect((await pedir('POST', '/auth/dois-fatores/enviar', antiga, { finalidade: 'login' })).statusCode).toBe(403)
    expect((await pedir('POST', '/auth/dois-fatores/verificar', antiga, { codigo: '123456' })).statusCode).toBe(403)
  })

  it('com a verificação desligada, não há código de entrada para enviar', async () => {
    cenario.doisFatores = false
    await montar()
    expect((await pedir('POST', '/auth/dois-fatores/enviar', PELA_SENHA, { finalidade: 'login' })).statusCode).toBe(403)
    expect(otp.enviar).not.toHaveBeenCalled()
  })
})

describe('sem saída, não', () => {
  const RECUPERACAO = jwt(['recovery'])

  it('sessão pendente com a senha antiga: GET diz para entrar de novo, e o envio responde ENTRE_DE_NOVO', async () => {
    const antiga = jwt(['password'], SESSAO, 31 * 60)
    await montar()
    const estado = await pedir('GET', '/auth/dois-fatores', antiga)
    expect(estado.json()).toMatchObject({ pendente: true, entrarDeNovo: true })
    const envio = await pedir('POST', '/auth/dois-fatores/enviar', antiga, { finalidade: 'login' })
    expect(envio.statusCode).toBe(403)
    expect(envio.json().codigo).toBe('ENTRE_DE_NOVO')
  })

  it('ligar a verificação numa sessão do link de recuperação pede para entrar de novo, sem gravar nada', async () => {
    cenario.doisFatores = false
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/preferencia', RECUPERACAO, { ativa: true, codigo: '123456' })
    expect(res.json().codigo).toBe('ENTRE_DE_NOVO')
    expect(calls.some((c) => c.table === 'pacientes' && c.op === 'update')).toBe(false)
    expect(otp.conferir).not.toHaveBeenCalled()
  })

  it('a sessão verificada em uso renova o último uso (o expurgo não a leva)', async () => {
    const velho = new Date(Date.now() - 2 * 86_400_000).toISOString()
    cenario.linha = { session_id: SESSAO, verificada_em: velho, enviado_em: null, tentativas: 0, usada_em: velho }
    await montar(resultadosRoutes)
    expect((await pedir('GET', '/resultados', PELA_SENHA)).statusCode).toBe(200)
    expect(atualizacoes().some((c) => typeof (c.payload as { usada_em?: unknown }).usada_em === 'string')).toBe(true)
  })

  it('o expurgo conta a partir do último uso, não da criação', async () => {
    otp.enviar.mockResolvedValue({ ok: true, limite: false })
    await montar()
    await pedir('POST', '/auth/dois-fatores/enviar', PELA_SENHA, { finalidade: 'login' })
    await new Promise((r) => setTimeout(r, 0))
    const expurgo = calls.find((c) => c.table === 'sessoes_dois_fatores' && c.op === 'delete')
    expect(Object.keys(expurgo?.filters ?? {})).toEqual(['usada_em__lt'])
  })
})

describe('gravações', () => {
  it('se marcar a sessão como verificada falha, responde 500, não "verificada"', async () => {
    otp.conferir.mockResolvedValue(true)
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    cenario.falhaAoVerificar = true
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '123456' })
    expect(res.statusCode).toBe(500)
  })

  it('consumir o código e verificar a sessão é uma gravação só', async () => {
    otp.conferir.mockResolvedValue(true)
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '123456' })
    const final = atualizacoes().find((c) => 'verificada_em' in (c.payload as object))
    expect(final?.payload).toMatchObject({ enviado_em: null, tentativas: 0 })
  })
})

describe('limite por conta', () => {
  it('com 10 códigos errados na última hora, nem confere nem envia', async () => {
    otp.conferir.mockResolvedValue(true)
    otp.enviar.mockResolvedValue({ ok: true, limite: false })
    cenario.bloqueio = { falhas: 10, desde: new Date().toISOString() }
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    const verifica = await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '123456' })
    expect(verifica.json().codigo).toBe('CONTA_BLOQUEADA')
    expect(otp.conferir).not.toHaveBeenCalled()
    cenario.linha = null
    const envia = await pedir('POST', '/auth/dois-fatores/enviar', PELA_SENHA, { finalidade: 'login' })
    expect(envia.json().codigo).toBe('CONTA_BLOQUEADA')
    expect(otp.enviar).not.toHaveBeenCalled()
  })

  it('código errado soma uma falha na conta; passada a hora, a contagem recomeça', async () => {
    otp.conferir.mockResolvedValue(false)
    cenario.bloqueio = { falhas: 9, desde: new Date(Date.now() - 2 * 3_600_000).toISOString() }
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    await pedir('POST', '/auth/dois-fatores/verificar', PELA_SENHA, { codigo: '000000' })
    const bloqueio = calls.find((c) => c.table === 'bloqueios_dois_fatores' && c.op === 'upsert')
    expect(bloqueio?.payload).toMatchObject({ paciente_id: PAC_ID, falhas: 1 })
  })
})

describe('preferência', () => {
  it('trocar a preferência exige o código', async () => {
    cenario.doisFatores = false
    await montar()
    const semCodigo = await pedir('POST', '/auth/dois-fatores/preferencia', PELA_SENHA, { ativa: true })
    expect(semCodigo.statusCode).toBe(400)
    expect(calls.some((c) => c.table === 'pacientes' && c.op === 'update')).toBe(false)
  })

  it('com o código, liga e já deixa a sessão atual verificada', async () => {
    otp.conferir.mockResolvedValue(true)
    cenario.doisFatores = false
    cenario.linha = { session_id: SESSAO, verificada_em: null, enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/preferencia', PELA_SENHA, { ativa: true, codigo: '123456' })
    expect(res.statusCode).toBe(200)
    expect(calls.find((c) => c.table === 'pacientes' && c.op === 'update')?.payload).toEqual({ dois_fatores_email: true })
    expect(atualizacoes().some((c) => typeof (c.payload as { verificada_em?: unknown }).verificada_em === 'string')).toBe(true)
  })

  it('a sessão pendente não troca a preferência', async () => {
    await montar()
    const res = await pedir('POST', '/auth/dois-fatores/preferencia', PELA_SENHA, { ativa: false, codigo: '123456' })
    expect(res.statusCode).toBe(403)
  })
})

describe('excluir a conta com a verificação ligada', () => {
  it('com o código errado, não exclui', async () => {
    otp.conferir.mockResolvedValue(false)
    cenario.linha = { session_id: SESSAO, verificada_em: '2026-11-16T10:00:00Z', enviado_em: new Date().toISOString(), tentativas: 0 }
    await montar(pacientesRoutes)
    const res = await pedir('DELETE', '/pacientes/me', PELA_SENHA, { codigo: '000000' })
    expect(res.statusCode).toBe(400)
    expect(res.json().codigo).toBe('CODIGO_INVALIDO')
    expect(calls.some((c) => c.table === 'exclusoes_conta')).toBe(false)
  })

  it('sem o código, recusa antes de excluir', async () => {
    cenario.linha = { session_id: SESSAO, verificada_em: '2026-11-16T10:00:00Z', enviado_em: null, tentativas: 0 }
    await montar(pacientesRoutes)
    const res = await pedir('DELETE', '/pacientes/me', PELA_SENHA)
    expect(res.statusCode).toBe(400)
    expect(res.json().codigo).toBe('CODIGO_OBRIGATORIO')
  })
})
