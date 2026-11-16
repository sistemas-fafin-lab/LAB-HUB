import { Ico, Node, Pill } from '../portal'
import type { Exam } from '../../lib/exame'
import { contextoDoExame, responsavelDoExame, situacaoDoExame } from '../../lib/exibicaoExame'

/** Linha de um exame numa lista. Nó e pílula dizem a etapa; a pílula, em texto. */
export function ExamRow({ exam, onClick, novo = false }: { exam: Exam; onClick: () => void; /** Liberado e ainda não aberto. */ novo?: boolean }) {
  const { rotulo, tom, passo } = situacaoDoExame(exam)
  const responsavel = responsavelDoExame(exam)
  const contexto = contextoDoExame(exam)
  return (
    <button
      type="button"
      onClick={onClick}
      className="lh-row w-full grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_160px_16px] items-center gap-x-4 px-5 py-3.5 text-left"
    >
      <Node step={passo} size={26} />
      <span className="block min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 min-w-0">
          <span className="text-[14px] font-semibold truncate max-w-full">{exam.name}</span>
          {/* Ao lado do nome: duas linhas com o mesmo exame é onde o paciente
              precisa da distinção. A pílula segue "Liberado": este laudo foi
              liberado, só não é mais o vigente. */}
          {exam.retificado && <span className="text-[11px] font-semibold text-muted shrink-0">Versão anterior</span>}
          {novo && <span className="text-[11px] font-semibold text-link shrink-0">Novo</span>}
        </span>
        <span className="block text-[12px] text-muted truncate">{exam.category}</span>
        {/* Abaixo de md as colunas não cabem; descem para cá em vez de sumirem. */}
        <span className="md:hidden block text-[12px] text-muted truncate">
          {[responsavel, contexto].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="hidden md:block text-[13px] truncate">{responsavel ?? ''}</span>
      <span className="hidden md:block text-[13px] text-muted truncate tabular-nums">{contexto}</span>
      {/* Abaixo de md a pílula fecha a linha (à direita); a partir de md ela
          abre a própria coluna, alinhada à esquerda como no protótipo. */}
      <span className="flex justify-end md:justify-start">
        <Pill tone={tom}>{rotulo}</Pill>
      </span>
      <Ico name="chevron-right" size={16} className="hidden md:inline-flex text-faint" />
    </button>
  )
}
