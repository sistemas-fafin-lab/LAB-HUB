import type { Exam } from '../components/shared/WebHero'

// O que a linha de um exame mostra além do nome. Compartilhado entre as listas
// para o exame dizer a mesma coisa em qualquer tela.

const PLACEHOLDER = '—'

/** Unidade do exame, ou null quando a fonte não informou. */
export function unidadeDoExame(exam: Exam): string | null {
  return exam.unit && exam.unit !== PLACEHOLDER ? exam.unit : null
}

/**
 * A data é a da COLETA, a mesma chave por que a lista é ordenada
 * (useResultados). `exam.date` é a emissão: uma lista ordenada por coleta
 * mostrando a emissão parece embaralhada para quem lê (um exame com "27 Jul"
 * acima de outro com "28 Jul"). O rótulo "Coleta" tira a ambiguidade, já que as
 * duas datas aparecem separadas no laudo.
 */
export function contextoDoExame(exam: Exam): string {
  const unidade = unidadeDoExame(exam)
  const data = exam.dataColetaCurta ? `Coleta ${exam.dataColetaCurta}` : exam.date
  return [unidade, data].filter(Boolean).join(' · ')
}

/**
 * Pedido consolidado não tem médico único — a contagem de exames é mais útil
 * que um travessão, que parecia um resultado vazio.
 */
export function responsavelDoExame(exam: Exam): string | null {
  if (exam.doctor !== PLACEHOLDER) return exam.doctor
  if (!exam.totalExames) return null
  return `${exam.totalExames} ${exam.totalExames === 1 ? 'exame' : 'exames'}`
}
