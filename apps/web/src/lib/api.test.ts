import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O cliente real, com a rede (fetch) e o Supabase dublados. O que se afirma é
// o contrato com o shell: qualquer chamada que volte 401 avisa que a sessão
// expirou — e só 401 (403 é "sem permissão", não sessão vencida).
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tk' } } }) } },
}))

const { api, ApiError } = await import('./api')
const { aoExpirarSessao } = await import('./sessao')

function responde(status: number, corpo: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })),
  )
}

let avisos: number
let desinscreve: () => void
beforeEach(() => {
  avisos = 0
  desinscreve = aoExpirarSessao(() => avisos++)
})
afterEach(() => {
  desinscreve()
  vi.unstubAllGlobals()
})

describe('sessão expirada no cliente api', () => {
  it.each([
    ['get', () => api.get('/pacientes/me')],
    ['post', () => api.post('/agendamentos', {})],
    ['upload', () => api.upload('/documentos', new FormData())],
    ['declaracao', () => api.declaracao('r-1')],
  ])('401 em %s avisa o shell e ainda rejeita com ApiError', async (_, chama) => {
    responde(401, { message: 'Token inválido' })
    await expect(chama()).rejects.toBeInstanceOf(ApiError)
    expect(avisos).toBe(1)
  })

  it.each([403, 404, 500])('%i não é sessão expirada', async (status) => {
    responde(status)
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError)
    expect(avisos).toBe(0)
  })

  it('resposta ok não avisa', async () => {
    responde(200, { ok: true })
    await expect(api.get('/x')).resolves.toEqual({ ok: true })
    expect(avisos).toBe(0)
  })
})
