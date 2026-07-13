import type { PostoDisponivel } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'

interface UnitSelectorProps {
  postos: PostoDisponivel[]
  selectedId: string | null
  onSelect: (id: string) => void
  dark: boolean
}

// Cartão de escolha da unidade de coleta.
export function UnitSelector({ postos, selectedId, onSelect, dark }: UnitSelectorProps) {
  return (
    <div
      className={`rounded-2xl border ${
        dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
      } p-5 shadow-sm`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Unidade</div>
      <div className="flex flex-col gap-2">
        {postos.map((p) => {
          const active = p.id === selectedId
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                active
                  ? dark
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-blue-500 bg-blue-50/60'
                  : dark
                    ? 'border-gray-800 hover:bg-gray-800/50'
                    : 'border-gray-100 hover:bg-slate-50'
              }`}
            >
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <WIcon name="map-pin" className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
                  {p.nome}
                </div>
                <div className="text-xs text-gray-500 truncate">{p.endereco}</div>
              </div>
              {active && <WIcon name="check" className="w-4 h-4 text-blue-600" strokeWidth={2.6} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
