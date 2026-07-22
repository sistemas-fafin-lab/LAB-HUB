import { WSkeleton } from '../primitives/WSkeleton'

interface ExamRowSkeletonProps {
  dark: boolean
  count?: number
}

// Placeholder de carregamento da lista de resultados: espelha o grid do ExamRow
// (ícone, nome/categoria, médico ou contagem, unidade·data, status, chevron)
// para evitar o "pulo" de layout quando os exames chegam.
export function ExamRowSkeleton({ dark, count = 4 }: ExamRowSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`w-full grid grid-cols-[auto_1.6fr_1fr_1fr_auto_auto] items-center gap-4 px-4 py-3 rounded-xl border ${
            dark ? 'border-gray-800' : 'border-gray-100'
          }`}
        >
          <WSkeleton className="h-10 w-10 rounded-xl shrink-0" dark={dark} />

          <div className="min-w-0 flex flex-col gap-1.5">
            <WSkeleton className="h-3.5 w-44 max-w-full rounded" dark={dark} />
            <WSkeleton className="h-2.5 w-24 max-w-full rounded" dark={dark} />
          </div>

          <WSkeleton className="h-3 w-20 rounded" dark={dark} />
          <WSkeleton className="h-3 w-28 rounded" dark={dark} />

          <div className="w-24 flex justify-end">
            <WSkeleton className="h-6 w-20 rounded-full" dark={dark} />
          </div>
          <WSkeleton className="h-4 w-4 rounded" dark={dark} />
        </div>
      ))}
    </>
  )
}
