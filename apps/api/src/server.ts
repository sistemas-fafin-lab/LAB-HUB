import 'dotenv/config'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import { cadastroRoutes } from './routes/cadastro.js'
import { pacientesRoutes } from './routes/pacientes.js'
import { agendamentosRoutes } from './routes/agendamentos.js'
import { postosRoutes } from './routes/postos.js'
import { resultadosRoutes } from './routes/resultados.js'
import { laudosRoutes } from './routes/laudos.js'
import { documentosRoutes } from './routes/documentos.js'
import { integracaoRoutes } from './routes/integracao.js'
import { webhooksRoutes } from './routes/webhooks.js'

const server = Fastify({ logger: { level: 'info' } })

server.register(sensible)
// Origens do frontend permitidas. Em produção, defina CORS_ORIGIN com o(s) domínio(s)
// separados por vírgula. Uma entrada entre barras (ex.: /^https:\/\/.*\.vercel\.app$/)
// vira RegExp — útil p/ os previews da Vercel, cujo subdomínio muda a cada deploy.
// Em dev (sem CORS_ORIGIN), libera qualquer porta de localhost/127.0.0.1 — o Vite troca
// de porta (5173 → 5174 → …) quando a anterior está ocupada.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) =>
        o.startsWith('/') && o.endsWith('/') ? new RegExp(o.slice(1, -1)) : o,
      )
  : [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]

server.register(cors, {
  origin: corsOrigin,
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
