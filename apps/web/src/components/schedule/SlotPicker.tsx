import { useMemo } from 'react'
import { dayFmt, timeFmt } from '../../lib/datetime'

interface SlotPickerProps {
  slots: string[] // horários ISO 8601
  /** ISO do horário em envio (desabilita a grade enquanto agenda). */
  submitting: string | null
  onPick: (iso: string) => void
  dark: boolean
}

interface SlotGroup {
  label: string
  slots: string[]
}

// Agrupa os horários ISO por dia, preservando a ordem cronológica.
function groupByDay(slots: string[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>()
  for (const iso of [...slots].sort()) {
    const d = new Date(iso)
    const key = d.toDateString()
    const group = groups.get(key)
    if (group) group.slots.push(iso)
    else groups.set(key, { label: dayFmt.format(d), slots: [iso] })
  }
  return [...groups.values()]
}

// Grade de horários disponíveis, agrupados por dia.
export function SlotPicker({ slots, submitting, onPick, dark }: SlotPickerProps) {
  const groups = useMemo(() => groupByDay(slots), [slots])

  if (groups.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-8">
        Sem horários disponíveis nesta unidade.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className={`text-sm font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-slate-700'}`}>
            {g.label}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {g.slots.map((iso) => (
              <button
                key={iso}
                disabled={submitting !== null}
                onClick={() => onPick(iso)}
                className={`rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 border disabled:opacity-50 ${
                  dark
                    ? 'border-gray-800 bg-gray-900 text-gray-200 hover:border-blue-500 hover:bg-blue-500/10'
                    : 'border-gray-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                {submitting === iso ? '…' : timeFmt.format(new Date(iso))}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
