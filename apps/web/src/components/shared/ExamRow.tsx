import { WIcon } from '../primitives/WIcon'
import { WStatus } from '../primitives/WStatus'
import type { Exam } from './WebHero'

interface ExamRowProps {
  exam: Exam
  onClick: () => void
  dark: boolean
}

const PLACEHOLDER = '—'

/**
 * Linha da lista de resultados.
 *
 * A data exibida é a da COLETA, a mesma chave por que a lista é ordenada
 * (useResultados). Antes vinha `exam.date`, que é a emissão: uma lista ordenada
 * por coleta mostrando a emissão parece embaralhada para quem lê (um exame com
 * "27 Jul" acima de outro com "28 Jul"). O rótulo "Coleta" tira a ambiguidade,
 * já que agora as duas datas aparecem separadas no laudo.
 */
export function ExamRow({ exam, onClick, dark }: ExamRowProps) {
  const unidade = exam.unit && exam.unit !== PLACEHOLDER ? exam.unit : null
  const data = exam.dataColetaCurta ? `Coleta ${exam.dataColetaCurta}` : exam.date
  const contexto = [unidade, data].filter(Boolean).join(' · ')

  // Pedido consolidado não tem médico único — a contagem de exames é mais útil
  // que um travessão, que parecia um resultado vazio.
  const responsavel =
    exam.doctor === PLACEHOLDER && exam.totalExames
      ? `${exam.totalExames} ${exam.totalExames === 1 ? 'exame' : 'exames'}`
      : exam.doctor !== PLACEHOLDER
        ? exam.doctor
        : null

  return (
    <button
      onClick={onClick}
      className={`w-full grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1.6fr_1fr_1fr_auto_auto] items-center gap-3 md:gap-4 px-3 md:px-4 py-3 rounded-xl text-left transition border ${
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
        <div className={`text-[11px] truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{exam.category}</div>
        {/* Abaixo de md as colunas de responsável e contexto não cabem; descem
            para dentro desta célula em vez de sumirem. */}
        <div className={`md:hidden text-[11px] truncate mt-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {[responsavel, contexto].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div className={`hidden md:block text-xs truncate ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
        {responsavel ?? ''}
      </div>

      <div className={`hidden md:block text-xs truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        {contexto}
      </div>

      {/* Largura fixa: cada linha é um grid independente, então se esta célula
          fosse `auto` a diferença entre "Liberado" e "Em análise" mudaria a
          largura das colunas `fr` de linha para linha, desalinhando a lista. */}
      <div className="md:w-24 flex justify-end">
        <WStatus status={exam.status} />
      </div>
      <WIcon name="chevron-right" className="hidden md:block w-4 h-4 text-gray-400" strokeWidth={2} />
    </button>
  )
}
