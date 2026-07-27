import { WIcon } from '../primitives/WIcon'
import type { ExamStatus } from '../primitives/WStatus'
import { api } from '../../lib/api'

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
}

interface WebHeroProps {
  exam: Exam
  onOpen: () => void
  dark: boolean
}

export function WebHero({ exam, onOpen, dark: _dark }: WebHeroProps) {
  // Mesmo padrão da LaudoPage: busca a signed URL sob demanda e abre o PDF.
  const handleDownload = async () => {
    try {
      const { url } = await api.declaracao(exam.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      /* sem declaração disponível */
    }
  }

  return (
    <div className="rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-blue-900/20 bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800">
      <div className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-12 w-72 h-72 rounded-full bg-indigo-300/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -right-4 opacity-10 pointer-events-none">
        <WIcon name="file-text" className="w-56 h-56" strokeWidth={1.2} />
      </div>

      <div className="relative grid grid-cols-[1fr_auto] gap-6 items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 mb-4 text-[11px] font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />Resultado disponível
          </div>
          <h2
            className="font-bold text-2xl leading-tight mb-1"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif", color: 'rgb(255, 255, 255)' }}
          >
            <span style={{ color: 'rgb(255, 255, 255)' }}>Seu último exame está pronto</span>
          </h2>
          {/* "coletado em" só com a data de coleta de verdade; com a emissão a
              frase afirmaria a data errada (ver dataColeta em Exam). */}
          <p className="text-blue-100 text-sm mb-5 leading-snug max-w-md">
            {exam.name} —{' '}
            {exam.dataColeta
              ? `coletado em ${exam.dataColeta}`
              : `liberado em ${exam.dataEmissao ?? exam.fullDate}`}
            {exam.unit && exam.unit !== '—' ? `, na ${exam.unit}` : ''}.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpen}
              className="bg-white text-blue-700 rounded-xl px-4 py-2.5 font-semibold text-sm inline-flex items-center gap-2 active:scale-95 transition hover:shadow-lg"
            >
              Ver resultado completo<WIcon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} />
            </button>
            {exam.declaracaoUrl && (
              <button
                onClick={() => void handleDownload()}
                className="text-white/90 rounded-xl px-3 py-2.5 font-medium text-sm inline-flex items-center gap-2 hover:bg-white/10 transition"
              >
                <WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF
              </button>
            )}
          </div>
        </div>

        {/* Mini summary */}
        <div className="hidden lg:grid grid-cols-2 gap-2 min-w-[260px]">
          {exam.panels.slice(0, 4).map((p, i) => (
            <div key={`${p.name}-${i}`} className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100/80 truncate">{p.name}</div>
              <div className="text-base font-bold tabular-nums">
                {p.value}<span className="text-[10px] font-medium ml-1 text-blue-100/80">{p.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
