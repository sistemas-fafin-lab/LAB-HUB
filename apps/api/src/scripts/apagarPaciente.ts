import 'dotenv/config'
import { parseArgs } from 'node:util'
import pino from 'pino'
import { CAMPOS_REDIGIDOS, serializarErro } from '../lib/http.js'
import {
  apagarPacienteCompleto,
  inventariarPaciente,
  resolverPaciente,
} from '../lib/apagarPaciente.js'

// Apagamento total de um paciente de TESTE — imagens, resultados, agendamentos
// e cadastro. Ver o cabeçalho de lib/apagarPaciente.ts para a diferença entre
// isto e a exclusão de conta do titular (que retém o prontuário de propósito).
//
//   # confere o que seria apagado, sem apagar nada
//   docker compose exec -T api node dist/scripts/apagarPaciente.js --cpf 12345678909
//
//   # apaga de verdade
//   docker compose exec -T api node dist/scripts/apagarPaciente.js --cpf 12345678909 --confirmar
//
// Script, e não rota HTTP, pelo mesmo motivo do expurgo: seria mais um caminho
// autenticado para uma operação irreversível, e o P-06 mostrou o que acontece
// com chave de integração no mundo real. Aqui quem dispara já tem a chave de
// serviço na mão.
//
// Dry-run por PADRÃO, e é a decisão de desenho mais importante do arquivo. O
// inventário impresso é a única barreira entre limpar dado de teste e limpar o
// de uma pessoa real — e ele só serve se alguém for obrigado a olhar antes.

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: CAMPOS_REDIGIDOS,
  serializers: { err: serializarErro },
})

const USO = `
Uso: node dist/scripts/apagarPaciente.js (--cpf <cpf> | --id <uuid>) [--confirmar]

  --cpf        CPF do paciente (com ou sem pontuação)
  --id         id do paciente, se você já o tem
  --confirmar  apaga de verdade; sem ele o script só lista o que apagaria
`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cpf: { type: 'string' },
      id: { type: 'string' },
      confirmar: { type: 'boolean', default: false },
    },
  })

  // Um seletor e apenas um: aceitar os dois abriria a porta para conferir o
  // inventário de um CPF e apagar o id de outro.
  if ((values.cpf ? 1 : 0) + (values.id ? 1 : 0) !== 1) {
    process.stderr.write(`Informe exatamente um seletor: --cpf OU --id.\n${USO}`)
    process.exit(2)
  }

  const paciente = await resolverPaciente({
    ...(values.cpf ? { cpf: values.cpf } : {}),
    ...(values.id ? { id: values.id } : {}),
  })
  if (!paciente) {
    log.error({}, 'Paciente não encontrado')
    process.exit(1)
  }

  const inventario = await inventariarPaciente(paciente, log)

  // `nome` sai em claro de propósito: é o que permite reconhecer o paciente de
  // teste antes de apagá-lo. CPF, e-mail e data de nascimento não saem — a
  // lista de redação do pino os cobre, e o inventário não precisa deles.
  log.info(
    {
      pacienteId: paciente.id,
      nome: paciente.nome,
      temConta: paciente.authUserId !== null,
      contaJaExcluidaEm: paciente.excluidoEm,
      imagens: inventario.objetosDocumentos.length,
      imagensOrfas: inventario.objetosOrfaos.length,
      pdfsDeLaudo: inventario.objetosLaudos.length,
      resultados: inventario.resultados,
      examResults: inventario.examResults,
      agendamentos: inventario.agendamentos,
    },
    values.confirmar ? 'Apagando este paciente' : 'Dry-run — NADA foi apagado',
  )

  if (!values.confirmar) {
    process.stdout.write('\nRode de novo com --confirmar para apagar.\n')
    return
  }

  const inicio = Date.now()
  const resultado = await apagarPacienteCompleto(paciente, inventario, log)

  log.info(
    { ...resultado, pacienteId: paciente.id, duracaoMs: Date.now() - inicio },
    'Paciente apagado — trilhas de auditoria e de exclusão permanecem, sem FK',
  )
}

main().catch((err: unknown) => {
  log.error({ err }, 'Apagamento do paciente falhou')
  // Código != 0 para quem chamou enxergar a falha. Nada fica "meio apagado" de
  // um jeito irrecuperável: os passos de Storage abortam antes de mexer nas
  // linhas, então o alvo continua encontrável pelo mesmo CPF na próxima
  // execução.
  process.exit(1)
})
