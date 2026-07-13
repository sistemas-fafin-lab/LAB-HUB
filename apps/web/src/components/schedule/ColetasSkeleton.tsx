import { WSkeleton } from '../primitives/WSkeleton'

interface ColetasSkeletonProps {
  dark: boolean
  count?: number
}

// Placeholder de carregamento da aba "Minhas coletas": espelha o card de coleta
// para evitar o "pulo" de layout quando os dados chegam.
export function ColetasSkeleton({ dark, count = 3 }: ColetasSkeletonProps) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-4 shadow-sm`}
        >
          <div className="flex items-center gap-4">
            {/* Ícone + info principal */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <WSkeleton className="h-11 w-11 rounded-xl shrink-0" dark={dark} />
              <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                <WSkeleton className="h-3.5 w-32 rounded" dark={dark} />
                <WSkeleton className="h-3 w-24 rounded" dark={dark} />
              </div>
              <WSkeleton className="h-7 w-20 rounded-lg shrink-0" dark={dark} />
            </div>

            {/* Badge de status + ações */}
            <div className="flex items-center gap-3 shrink-0">
              <WSkeleton className="h-6 w-20 rounded-full" dark={dark} />
              <WSkeleton className="h-6 w-16 rounded" dark={dark} />
            </div>

            {/* Chevron */}
            <WSkeleton className="h-4 w-4 rounded shrink-0" dark={dark} />
          </div>
        </div>
      ))}
    </div>
  )
}
