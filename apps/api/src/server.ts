import 'dotenv/config'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { CAMPOS_REDIGIDOS, resolverCorsOrigin, serializarRequest } from './lib/http.js'
import { cadastroRoutes } from './routes/cadastro.js'
import { pacientesRoutes } from './routes/pacientes.js'
import { agendamentosRoutes } from './routes/agendamentos.js'
import { postosRoutes } from './routes/postos.js'
import { resultadosRoutes } from './routes/resultados.js'
import { laudosRoutes } from './routes/laudos.js'
import { documentosRoutes } from './routes/documentos.js'
import { integracaoRoutes } from './routes/integracao.js'
import { webhooksRoutes } from './routes/webhooks.js'

// O dado que trafega aqui é de saúde: a query da busca da recepção carrega nome
// e CPF, então o log passa por `serializarRequest`/`redact` (ver lib/http.ts).
const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: CAMPOS_REDIGIDOS,
    serializers: { req: serializarRequest },
  },
})

server.register(sensible)

// Cabeçalhos de segurança. `contentSecurityPolicy: false` porque a API só
// devolve JSON — CSP aqui não protege nada e ainda atrapalharia o dia em que
// algum endpoint servir HTML de verdade. O que importa é `nosniff`, HSTS e
// `X-Frame-Options`.
server.register(helmet, { contentSecurityPolicy: false })

// Em produção, CORS_ORIGIN é obrigatória — sem ela o boot falha (ver lib/http.ts).
server.register(cors, {
  origin: resolverCorsOrigin(),
  credentials: true,
  // O default do @fastify/cors é 'GET,HEAD,POST' — sem isto o preflight barra
  // PUT/PATCH/DELETE (ex.: PUT /pacientes/me na edição de perfil).
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
})
// Fallback global amplo (~10/s) só p/ proteção básica contra abuso; os limites
// estritos ficam por rota (POST /cadastro e POST /agendamentos = 5/min).
server.register(rateLimit, { max: 600, timeWindow: '1 minute' })

server.register(cadastroRoutes, { prefix: '/api/v1' })
server.register(pacientesRoutes, { prefix: '/api/v1' })
server.register(agendamentosRoutes, { prefix: '/api/v1' })
server.register(postosRoutes, { prefix: '/api/v1' })
server.register(resultadosRoutes, { prefix: '/api/v1' })
server.register(laudosRoutes, { prefix: '/api/v1' })
server.register(documentosRoutes, { prefix: '/api/v1' })
server.register(integracaoRoutes, { prefix: '/api/v1' })
server.register(webhooksRoutes, { prefix: '/api/v1' })

server.get('/ping', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

const start = async (): Promise<void> => {
  const PORT = Number(process.env.PORT ?? 3333)
  const HOST = process.env.HOST ?? '0.0.0.0'
  try {
    await server.listen({ port: PORT, host: HOST })
    console.log(`API running at http://${HOST}:${PORT}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

void start()
