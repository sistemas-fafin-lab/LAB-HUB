// Exame como as telas o consomem (mapeado de GET /resultados e GET /laudos em
// lib/mappers.ts).

/** Situação do exame: liberado ou ainda em análise. */
export type ExamStatus = 'ready' | 'analyzing'

export interface ExamPanel {
  name: string
  value: string
  unit: string
  ref: string
  ok: boolean
  trend: number[]
}

// Subgrupo de marcadores — hoje só hemograma (Série Branca / Vermelha / Plaquetas).
export interface ExamGroup {
  name: string
  panels: ExamPanel[]
}

export interface Exam {
  id: string
  name: string
  category: string
  date: string
  fullDate: string
  unit: string
  doctor: string
  crm: string
  status: ExamStatus
  summary: string
  panels: ExamPanel[]
  declaracaoUrl?: string // path da declaração no bucket privado (signed URL sob demanda)
  // Data da coleta em ISO (YYYY-MM-DD…): `date` acima já está formatada para
  // exibição e não serve para comparar — o filtro de período usa esta.
  coletadoEm?: string

  // Coleta e emissão POR EXTENSO, separadas. `fullDate` é a data de exibição do
  // card (a emissão quando existe) e serve para um rótulo genérico; não serve
  // para preencher um campo rotulado "Coleta", que é uma afirmação sobre quando
  // o paciente foi coletado. Ausente = a fonte não informou; a tela mostra '—'
  // em vez de repetir a outra data.
  dataColeta?: string // ex.: "24 de julho de 2026"
  dataEmissao?: string // ex.: "28 de julho de 2026"
  // Forma curta da coleta, para a lista. `date` é a data de EXIBIÇÃO do card
  // (a emissão quando existe), mas a lista é ordenada por coleta — mostrar uma
  // e ordenar pela outra faz as linhas parecerem fora de ordem cronológica.
  dataColetaCurta?: string // ex.: "24 Jul 2026"
  // Identificador do laudo NO LABORATÓRIO (codigo_lis, ou a OS da AOL). É o
  // número pelo qual o lab acha o exame — diferente de `id`, que é um UUID
  // sorteado a cada mapeamento e muda entre uma impressão e outra.
  numeroLaudo?: string

  // Daqui para baixo, só o laudo vindo dos LIS (ApLIS/AOL) preenche — o
  // resultado do FlowLab não tem esses dados. Por isso são opcionais: as telas
  // omitem o que estiver ausente em vez de mostrar '—'.
  origem?: 'flowlab' | 'lis'
  material?: string // ex.: "Soro", "Sangue Total com EDTA"
  metodo?: string // ex.: "Hexoquinase"
  laboratorio?: string // nome do laboratório executor
  groups?: ExamGroup[]
  // Quantos exames o pedido consolidado reúne — a lista mostra isto quando o
  // pedido não tem um médico responsável único.
  totalExames?: number
  // Este resultado foi SUBSTITUÍDO por uma versão mais nova do mesmo exame
  // (correção, reliberação). Continua na lista, abaixo da versão vigente e
  // marcado — quem já baixou o PDF antigo precisa conseguir achá-lo, e o que
  // mudou entre duas versões de um laudo é informação clínica. Só o resultado
  // do FlowLab preenche; o laudo dos LIS não tem esse conceito.
  retificado?: boolean
  // Aberto a partir da consulta administrativa por CPF (ResultsPage) — é o
  // resultado de OUTRO paciente, não do titular da sessão. `usePaciente()`
  // devolveria a conta logada, não a consultada, então qualquer tela que
  // monte um documento a partir da sessão (ex.: LaudoPage) fica errada aqui;
  // as telas de detalhe usam esta flag para esconder esse caminho em vez de
  // imprimir um laudo com a identidade de outra pessoa.
  somenteLeituraAdmin?: boolean
}
