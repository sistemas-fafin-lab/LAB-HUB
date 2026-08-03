import 'dotenv/config'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { validarCriptografia } from './lib/crypto.js'
import { numeroEnv } from './lib/env.js'
import {
  CAMPOS_REDIGIDOS,
  resolverCorsOrigin,
  serializarErro,
  serializarRequest,
} from './lib/http.js'
import { cadastroRoutes } from './routes/cadastro.js'
import { pacientesRoutes } from './routes/pacientes.js'
import { agendamentosRoutes } from './routes/agendamentos.js'
import { postosRoutes } from './routes/postos.js'
import { resultadosRoutes } from './routes/resultados.js'
import { laudosRoutes } from './routes/laudos.js'
import { documentosRoutes } from './routes/documentos.js'
import { integracaoRoutes } from './routes/integracao.js'
import { webhooksRoutes } from './routes/webhooks.js'

// Chave da criptografia de coluna (S-06). Antes de abrir a porta, não na
// primeira gravação de laudo: em produção a falta da chave derruba o boot, e é
// melhor que apareça agora, no `docker compose up`, do que como laudo em texto
// puro descoberto meses depois. Ver lib/crypto.ts.
validarCriptografia()

// Saltos de proxy confiáveis para resolver o IP do cliente.
//
// A API nunca é alcançada direto: em produção o único caminho é o túnel ngrok
// do docker-compose, que fala com `api:3333` pela rede interna. Sem isto,
// `request.ip` é o endereço do CONTAINER do ngrok — o mesmo valor para todo
// mundo, sempre. Duas consequências, e a segunda passou despercebida por muito
// tempo: a trilha do S-08 gravaria um IP que não distingue ninguém, e o
// rate-limit por IP já vinha jogando todos os pacientes num balde só (o teto de
// 60/min do GET /laudos era, na prática, 60/min para o portal inteiro).
//
// O número é a contagem de saltos a partir do socket, e 1 é o que corresponde à
// topologia real. Não é o mesmo que `trustProxy: true`: com `true` a API
// acreditaria na entrada mais à esquerda do X-Forwarded-For, que o cliente
// escreve, e qualquer um se passaria pelo IP que quisesse — na trilha de
// auditoria isso não seria um campo impreciso, seria um campo plantado. Com 1,
// vale a entrada que o túnel escreveu, e o que o cliente mandou fica para trás
// dela. A env existe para o dia em que entrar um CDN na frente (aí são 2); 0
// desliga e volta ao endereço do socket.
const TRUST_PROXY_HOPS = numeroEnv('TRUST_PROXY_HOPS', 1, 0)

// O dado que trafega aqui é de saúde: a query da busca da recepção carrega nome
// e CPF, então o log passa por `serializarRequest`/`redact` (ver lib/http.ts).
const server = Fastify({
  trustProxy: TRUST_PROXY_HOPS,
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: CAMPOS_REDIGIDOS,
    serializers: { req: serializarRequest, err: serializarErro },
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
