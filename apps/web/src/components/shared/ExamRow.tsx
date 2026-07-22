import { WIcon } from '../primitives/WIcon'
import { WStatus } from '../primitives/WStatus'
import type { Exam } from './WebHero'

interface ExamRowProps {
  exam: Exam
  onClick: () => void
  dark: boolean
}

export function ExamRow({ exam, onClick, dark }: ExamRowProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full grid grid-cols-[auto_1.6fr_1fr_1fr_auto_auto] items-center gap-4 px-4 py-3 rounded-xl text-left transition border ${
        dark ? 'border-gray-800 hover:bg-gray-800/50' : 'border-gray-100 hover:bg-slate-50'
      } active:scale-[0.995]`}
    >
      <div
        className={`h-10 w-10 rounded-xl ${
          exam.status === 'ready' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'
        } flex items-center justify-center shrink-0`}
      >
        <WIcon
          name={exam.status === 'ready' ? 'file-check-2' : 'file-clock'}
          className="w-5 h-5"
          strokeWidth={2}
        />
      </div>

      <div className="min-w-0">
        <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-800'}`}>{exam.name}</div>
        <div className="text-[11px] text-gray-400 truncate">{exam.category}</div>
      </div>

      {/* Pedido consolidado não tem médico único — a contagem de exames é mais
          útil que um travessão, que parecia um resultado vazio. */}
      <div className={`text-xs ${dark ? 'text-gray-300' : 'text-gray-600'} truncate`}>
        {exam.doctor === '—' && exam.totalExames
          ? `${exam.totalExames} ${exam.totalExames === 1 ? 'exame' : 'exames'}`
          : exam.doctor}
      </div>

      <div className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'} truncate`}>
        {exam.unit} · {exam.date}
      </div>

      {/* Largura fixa: cada linha é um grid independente, então se esta célula
          fosse `auto` a diferença entre "Liberado" e "Em análise" mudaria a
          largura das colunas `fr` de linha para linha, desalinhando a lista. */}
      <div className="w-24 flex justify-end">
        <WStatus status={exam.status} />
      </div>
      <WIcon name="chevron-right" className="w-4 h-4 text-gray-300" strokeWidth={2} />
    </button>
  )
}
