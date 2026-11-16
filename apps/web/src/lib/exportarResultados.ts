import type { Exam } from './exame'
import { gerarCsv } from './csv'
import { situacaoDoExame } from './exibicaoExame'

// Exportação da lista de Resultados (botão "Exportar"): as linhas filtradas,
// sem marcador nem valor — só o que a própria linha da lista mostra.

const SEM_VALOR = '—'

export const ARQUIVO_CSV = 'resultados-labhub.csv'
const COLUNAS_CSV = ['Exame', 'Categoria', 'Data da coleta', 'Unidade', 'Médico', 'Situação'] as const

const semTraco = (v: string | undefined) => (v === undefined || v === SEM_VALOR ? '' : v)

export function csvDosResultados(exams: readonly Exam[]): string {
  return gerarCsv(
    COLUNAS_CSV,
    exams.map((e) => [
      e.name,
      semTraco(e.category),
      semTraco(e.dataColetaCurta ?? e.dataColeta),
      semTraco(e.unit),
      semTraco(e.doctor),
      situacaoDoExame(e).rotulo,
    ]),
  )
}

