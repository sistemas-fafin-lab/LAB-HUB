import { WSkeleton } from '../primitives/WSkeleton'

interface BookingSkeletonProps {
  dark: boolean
}

// Placeholder de carregamento da aba "Agendar": espelha o card de unidade e a
// grade de horários para evitar o "pulo" de layout quando os dados chegam.
export function BookingSkeleton({ dark }: BookingSkeletonProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Card de seleção de unidade */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-5 shadow-sm`}
      >
        <WSkeleton className="h-3 w-16 rounded mb-3" dark={dark} />
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                dark ? 'border-gray-800' : 'border-gray-100'
              }`}
            >
              <WSkeleton className="h-10 w-10 rounded-xl shrink-0" dark={dark} />
              <div className="flex-1 min-w-0">
                <WSkeleton className="h-3.5 w-40 rounded mb-2" dark={dark} />
                <WSkeleton className="h-3 w-56 max-w-full rounded" dark={dark} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade de horários (dois dias de exemplo) */}
      {[0, 1].map((day) => (
        <div key={day}>
          <WSkeleton className="h-4 w-28 rounded mb-2" dark={dark} />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <WSkeleton key={i} className="h-10 rounded-xl" dark={dark} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
