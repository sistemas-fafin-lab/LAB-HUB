import Fastify from 'fastify'

const server = Fastify({ logger: { level: 'info' } })

server.get('/ping', async (_request, _reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

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
