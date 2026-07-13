import { useMemo, useState } from 'react'
import { dayNumFmt, formatDia, formatDiaSemanaCurto, formatMesCurto, timeFmt } from '../../lib/datetime'
import { scrollSlim } from '../../lib/ui'

interface SlotPickerProps {
  slots: string[] // horários ISO 8601
  /** ISO do horário em envio (desabilita a grade enquanto agenda). */
  submitting: string | null
  onPick: (iso: string) => void
  dark: boolean
}

interface SlotGroup {
  key: string // id estável do dia (toDateString)
  date: Date // primeiro horário do dia — usado p/ formatar a pílula
  label: string // "quarta, 01 de julho" — cabeçalho da grade
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
    else groups.set(key, { key, date: d, label: formatDia(d), slots: [iso] })
  }
  return [...groups.values()]
}

// Grade de horários: uma faixa de dias no topo e os horários do dia escolhido.
export function SlotPicker({ slots, submitting, onPick, dark }: SlotPickerProps) {
  const groups = useMemo(() => groupByDay(slots), [slots])
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)

  // Dia ativo: o selecionado, ou o primeiro caso a seleção não exista mais
  // (ex.: troca de unidade ou dia esgotado após um agendamento).
  const activeGroup = useMemo(
    () => groups.find((g) => g.key === selectedDayKey) ?? groups[0] ?? null,
    [groups, selectedDayKey],
  )

  if (groups.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-8">
        Sem horários disponíveis nesta unidade.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Faixa de dias (rolagem horizontal) */}
      <div>
        <div className={`text-sm font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-slate-700'}`}>
          Escolha o dia
        </div>
        <div className={`flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1 ${scrollSlim(dark)}`}>
          {groups.map((g) => {
            const active = g.key === activeGroup?.key
            return (
              <button
                key={g.key}
                onClick={() => setSelectedDayKey(g.key)}
                className={`shrink-0 flex flex-col items-center rounded-xl px-3.5 py-2 border transition active:scale-95 ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : dark
                      ? 'border-gray-800 bg-gray-900 text-gray-300 hover:border-blue-500'
                      : 'border-gray-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    active ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  {formatDiaSemanaCurto(g.date)}
                </span>
                <span className="text-lg font-bold leading-none mt-0.5">
                  {dayNumFmt.format(g.date)}
                </span>
                <span className={`text-[10px] ${active ? 'text-blue-100/80' : 'text-gray-400'}`}>
                  {formatMesCurto(g.date)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Grade de horários do dia ativo */}
      {activeGroup && (
        <div>
          <div className={`text-sm font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-slate-700'}`}>
            Horários · <span className="capitalize">{activeGroup.label}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {activeGroup.slots.map((iso) => (
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
      )}
    </div>
  )
}
