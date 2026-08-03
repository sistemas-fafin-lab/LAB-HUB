import 'dotenv/config'
import pino from 'pino'
import { backfillCriptografia, verificarBackfill } from '../lib/backfillCripto.js'
import { CAMPOS_REDIGIDOS, serializarErro } from '../lib/http.js'

// Backfill da criptografia de coluna (S-06), para rodar uma vez após o deploy
// da escrita dupla:
//
//   docker compose exec -T api node dist/scripts/backfillCripto.js
//
// Processo separado pelos mesmos motivos do expurgo: código de saída que o
// operador enxerga, log isolado, e re-execução à mão sem reiniciar a API. É
// idempotente — rodar de novo não cifra nada duas vezes.
//
// A verificação sai no fim de propósito: um backfill que termina sem dizer
// quantas linhas SOBRARAM é um backfill em que se acredita, não um que se
// confere.

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: CAMPOS_REDIGIDOS,
  serializers: { err: serializarErro },
})

async function main(): Promise<void> {
  const inicio = Date.now()
  const cifradas = await backfillCriptografia(log)
  const pendentes = await verificarBackfill()

  log.info(
    { cifradas, pendentes, duracaoMs: Date.now() - inicio },
    'Backfill de criptografia finalizado',
  )

  if (pendentes.examResults > 0 || pendentes.resultados > 0) {
    log.error(
      { pendentes },
      'Ainda há linhas em claro sem par cifrado — NÃO prossiga para a remoção das colunas em claro',
    )
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  log.error({ err }, 'Backfill de criptografia falhou')
  // O texto puro continua intacto: o backfill só escreve na coluna cifrada.
  // Falhar no meio não perde dado, só deixa linhas por migrar — e a próxima
  // execução as reencontra.
  process.exit(1)
})
