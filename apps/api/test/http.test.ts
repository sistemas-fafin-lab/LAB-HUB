import { afterEach, describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import {
  CAMPOS_REDIGIDOS,
  redigirUrl,
  resolverCorsOrigin,
  serializarErro,
  serializarRequest,
} from '../src/lib/http.js'

const CORS = 'CORS_ORIGIN'
const AMBIENTE = 'NODE_ENV'
const originalCors = process.env[CORS]
const originalAmbiente = process.env[AMBIENTE]

afterEach(() => {
  if (originalCors === undefined) delete process.env[CORS]
  else process.env[CORS] = originalCors
  if (originalAmbiente === undefined) delete process.env[AMBIENTE]
  else process.env[AMBIENTE] = originalAmbiente
})

describe('resolverCorsOrigin', () => {
  it('em dev, sem CORS_ORIGIN, libera qualquer porta de localhost', () => {
    delete process.env[CORS]
    process.env[AMBIENTE] = 'development'

    const origens = resolverCorsOrigin() as RegExp[]

    expect(origens).toHaveLength(2)
    // O Vite troca de porta quando a anterior está ocupada, daí o \d+.
    expect(origens[0]!.test('http://localhost:5174')).toBe(true)
    expect(origens[1]!.test('http://127.0.0.1:5173')).toBe(true)
  })

  it('em produção, sem CORS_ORIGIN, derruba o boot em vez de liberar localhost', () => {
    delete process.env[CORS]
    process.env[AMBIENTE] = 'production'

    // O ponto do P-03: a permissão de dev escapando para produção deixaria
    // qualquer página em localhost, de qualquer máquina, falar com a API com
    // credenciais. Falhar no boot é preferível a subir aberto.
    expect(() => resolverCorsOrigin()).toThrow(/CORS_ORIGIN é obrigatória em produção/)
  })

  it('em produção, CORS_ORIGIN só com vírgulas e espaço também derruba o boot', () => {
    process.env[CORS] = ' , ,  '
    process.env[AMBIENTE] = 'production'

    // Variável presente porém vazia é o modo de falha mais provável de um
    // painel de deploy — não pode passar por "configurada".
    expect(() => resolverCorsOrigin()).toThrow(/CORS_ORIGIN é obrigatória em produção/)
  })

  it('divide a lista por vírgula e ignora espaços', () => {
    process.env[CORS] = 'https://labhub.com.br, https://www.labhub.com.br'
    process.env[AMBIENTE] = 'production'

    expect(resolverCorsOrigin()).toEqual(['https://labhub.com.br', 'https://www.labhub.com.br'])
  })

  it('entrada entre barras vira RegExp (previews da Vercel)', () => {
    process.env[CORS] = '/^https:\\/\\/.*\\.vercel\\.app$/'
    process.env[AMBIENTE] = 'production'

    const [origem] = resolverCorsOrigin() as RegExp[]

    expect(origem).toBeInstanceOf(RegExp)
    expect(origem!.test('https://labhub-git-abc123.vercel.app')).toBe(true)
    expect(origem!.test('https://vercel.app.invasor.com')).toBe(false)
  })
})

describe('redigirUrl', () => {
  it('não mexe em URL sem query', () => {
    expect(redigirUrl('/api/v1/pacientes/me')).toBe('/api/v1/pacientes/me')
  })

  it('redige o `q` da busca da recepção, que carrega nome e CPF', () => {
    // Sem isto, cada busca no balcão grava um identificador de paciente em
    // claro no log da API.
    expect(redigirUrl('/api/v1/integracao/pacientes/buscar?q=39053344705')).toBe(
      '/api/v1/integracao/pacientes/buscar?q=<redigido>',
    )
    expect(redigirUrl('/api/v1/integracao/pacientes/buscar?q=Maria%20Souza')).toBe(
      '/api/v1/integracao/pacientes/buscar?q=<redigido>',
    )
  })

  it('mantém os params que não identificam ninguém', () => {
    expect(redigirUrl('/api/v1/laudos?refresh=true')).toBe('/api/v1/laudos?refresh=true')
    expect(redigirUrl('/api/v1/documentos?escopo=perenes')).toBe('/api/v1/documentos?escopo=perenes')
  })

  it('redige por padrão o param desconhecido', () => {
    // Fail-closed: quem acrescentar um param novo não precisa lembrar de vir
    // aqui para que ele nasça protegido.
    expect(redigirUrl('/api/v1/algo?cpf=39053344705&refresh=true')).toBe(
      '/api/v1/algo?cpf=<redigido>&refresh=true',
    )
  })

  it('preserva a chave visível e não engasga com query malformada', () => {
    expect(redigirUrl('/api/v1/algo?')).toBe('/api/v1/algo')
    expect(redigirUrl('/api/v1/algo?sozinho')).toBe('/api/v1/algo?sozinho')
  })
})

describe('serializarRequest', () => {
  it('registra método, host e IP, com a query redigida', () => {
    const log = serializarRequest({
      method: 'GET',
      url: '/api/v1/integracao/pacientes/buscar?q=Maria',
      hostname: 'api.labhub.com.br',
      ip: '203.0.113.10',
    })

    expect(log).toEqual({
      method: 'GET',
      url: '/api/v1/integracao/pacientes/buscar?q=<redigido>',
      hostname: 'api.labhub.com.br',
      remoteAddress: '203.0.113.10',
    })
  })
})

describe('CAMPOS_REDIGIDOS', () => {
  it('cobre credenciais de header e identificadores de paciente', () => {
    for (const campo of [
      'req.headers.authorization',
      'req.headers["x-webhook-signature"]',
      '*.cpf',
      '*.password',
      '*.data_nascimento',
    ]) {
      expect(CAMPOS_REDIGIDOS).toContain(campo)
    }
  })
})

describe('serializarErro', () => {
  it('4xx não leva stack: é resposta esperada, não falha do servidor', () => {
    // Sem isto, cada requisição sem token despeja dez linhas de stack apontando
    // para dentro do node_modules/fastify — e uma varredura automatizada numa
    // rota protegida enche o log de blocos idênticos que não explicam nada.
    const err = Object.assign(new Error('Token ausente'), {
      name: 'UnauthorizedError',
      statusCode: 401,
    })

    expect(serializarErro(err)).toEqual({
      type: 'UnauthorizedError',
      message: 'Token ausente',
      statusCode: 401,
    })
  })

  it('5xx mantém o stack — aí sim alguém precisa investigar', () => {
    const err = Object.assign(new Error('Falha ao criar paciente'), { statusCode: 500 })

    expect(serializarErro(err)).toMatchObject({ message: 'Falha ao criar paciente' })
    expect(serializarErro(err).stack).toBeDefined()
  })

  it('erro sem statusCode conta como 5xx', () => {
    // Exceção não tratada não pode cair no caminho compacto e perder o stack.
    expect(serializarErro(new Error('boom')).stack).toBeDefined()
  })

  it('preserva o `cause` — o serializer padrão do pino o descarta', () => {
    // O `new Error(..., { cause })` de lib/flowlab.ts existe para não perder o
    // erro original do AbortSignal. Com `stdSerializers.err` (o padrão) o campo
    // some, e a correção não valeria nada no log.
    const original = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    })
    const err = new Error('FlowLab listar: timeout após 8000ms', { cause: original })

    const serializado = serializarErro(err) as { cause?: { message?: string } }

    expect(serializado.cause?.message).toBe('The operation was aborted')
  })
})

describe('cabeçalhos de segurança (helmet)', () => {
  it('responde com nosniff, HSTS e X-Frame-Options, e sem CSP', async () => {
    const app = Fastify()
    await app.register(helmet, { contentSecurityPolicy: false })
    app.get('/ping', async () => ({ status: 'ok' }))
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/ping' })

    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-frame-options']).toBeDefined()
    // API só-JSON: CSP não protege nada aqui e atrapalharia o dia em que algum
    // endpoint servir HTML.
    expect(res.headers['content-security-policy']).toBeUndefined()

    await app.close()
  })
})
