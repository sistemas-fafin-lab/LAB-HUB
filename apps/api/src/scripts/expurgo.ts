import 'dotenv/config'
import pino from 'pino'
import { CAMPOS_REDIGIDOS, serializarErro } from '../lib/http.js'
import { expurgarDocumentosVencidos, expurgarTrilhaAuditoria } from '../lib/expurgo.js'

// Rotina de retenção, para rodar por cron do sistema:
//
//   docker compose exec api node dist/scripts/expurgo.js
//
// Processo separado, e não `setInterval` dentro da API, de propósito: expurgo é
// operação destrutiva de dado pessoal. Como processo próprio ele tem código de
// saída (o cron avisa quando falha), log isolado, e pode ser rodado à mão para
// conferência sem reiniciar a API. Um timer embutido rodaria N vezes se a API
// escalasse para N réplicas — aqui, o agendador é um só.
//
// Não há endpoint HTTP para disparar isto. Seria mais um caminho autenticado
// para uma operação irreversível, e o P-06 mostrou o que acontece com chave de
// integração no mundo real.

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: CAMPOS_REDIGIDOS,
  serializers: { err: serializarErro },
})

async function main(): Promise<void> {
  const inicio = Date.now()
  const resultado = await expurgarDocumentosVencidos(log)

  // Depois dos documentos, e sem poder derrubá-los: a trilha de auditoria tem
  // prazo próprio (6 meses, S-08) e a única coisa que ela compartilha com o
  // expurgo de documentos é o agendador. `expurgarTrilhaAuditoria` já loga a
  // própria falha e devolve null em vez de lançar.
  const auditoria = await expurgarTrilhaAuditoria(log)

  log.info(
    {
      ...resultado,
      auditoriaRemovidas: auditoria?.removidas ?? null,
      duracaoMs: Date.now() - inicio,
    },
    'Rotina de expurgo finalizada',
  )
}

main().catch((err: unknown) => {
  log.error({ err }, 'Rotina de expurgo falhou')
  // Código != 0 para o cron enxergar a falha. Nada é "meio apagado": o
  // removerDocumentos aborta o lote antes de mexer nas linhas, e o próximo
  // ciclo reencontra os mesmos alvos.
  process.exit(1)
})
