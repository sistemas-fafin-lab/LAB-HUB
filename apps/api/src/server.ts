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
import { webhooksRoutes } from './routes/webhooks.js'

const server = Fastify({ logger: { level: 'info' } })

server.register(sensible)
server.register(cors, {
  // Origens do frontend permitidas. Em produção, defina CORS_ORIGIN com o domínio exato.
  origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? [
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
})
// Fallback global amplo (~10/s) só p/ proteção básica contra abuso; os limites
// estritos ficam por rota (POST /cadastro e POST /agendamentos = 5/min).
server.register(rateLimit, { max: 600, timeWindow: '1 minute' })

server.register(cadastroRoutes, { prefix: '/api/v1' })
server.register(pacientesRoutes, { prefix: '/api/v1' })
server.register(agendamentosRoutes, { prefix: '/api/v1' })
server.register(postosRoutes, { prefix: '/api/v1' })
server.register(resultadosRoutes, { prefix: '/api/v1' })
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
