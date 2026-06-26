import { useEffect, useMemo, useState } from 'react'
import type { Agendamento, PostoDisponivel } from '@lab-hub/shared'
import { WIcon } from '../components/primitives/WIcon'
import { api } from '../lib/api'

interface SchedulePageProps {
  dark: boolean
}

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

interface SlotGroup {
  label: string
  slots: string[] // ISO 8601
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

export function SchedulePage({ dark }: SchedulePageProps) {
  const [postos, setPostos] = useState<PostoDisponivel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null) // slot ISO em envio
  const [confirmed, setConfirmed] = useState<{ posto: string; dataHora: string } | null>(null)

  useEffect(() => {
    let alive = true
    api
      .get<PostoDisponivel[]>('/postos/disponibilidade')
      .then((data) => {
        if (!alive) return
        setPostos(data)
        setSelectedId(data[0]?.id ?? null)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erro ao carregar disponibilidade')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const selected = useMemo(
    () => postos.find((p) => p.id === selectedId) ?? null,
    [postos, selectedId],
  )
  const groups = useMemo(() => (selected ? groupByDay(selected.slots) : []), [selected])

  const handleConfirm = async (dataHora: string) => {
    if (!selected) return
    setSubmitting(dataHora)
    setError(null)
    try {
      await api.post<Agendamento>('/agendamentos', {
        postoFlowlabId: selected.id,
        dataHora,
      })
      setConfirmed({ posto: selected.nome, dataHora })
      // Remove o horário recém-agendado da lista local.
      setPostos((prev) =>
        prev.map((p) =>
          p.id === selected.id ? { ...p, slots: p.slots.filter((s) => s !== dataHora) } : p,
        ),
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao agendar')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1
        className={`text-2xl font-bold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}
        style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
      >
        Agendar coleta
      </h1>
      <p className="text-sm text-gray-500 mb-5">Selecione a unidade, data e horário disponíveis.</p>

      {confirmed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-4 mb-5 flex items-center gap-3">
          <WIcon name="check-circle" className="w-5 h-5" strokeWidth={2.2} />
          <div className="text-sm">
            Coleta confirmada na <strong>{confirmed.posto}</strong> para{' '}
            <strong>
              {dayFmt.format(new Date(confirmed.dataHora))} às {timeFmt.format(new Date(confirmed.dataHora))}
            </strong>
            .
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 mb-5 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center text-sm text-gray-400 py-10">Carregando disponibilidade…</div>
      )}

      {!loading && postos.length === 0 && !error && (
        <div className="text-center text-sm text-gray-400 py-10">
          Nenhuma unidade disponível no momento.
        </div>
      )}

      {/* Seletor de unidade */}
      {!loading && postos.length > 0 && (
        <div
          className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm mb-5`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Unidade</div>
          <div className="flex flex-col gap-2">
            {postos.map((p) => {
              const active = p.id === selectedId
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-blue-500 bg-blue-50/60'
                      : dark
                        ? 'border-gray-800 hover:bg-gray-800/50'
                        : 'border-gray-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <WIcon name="map-pin" className="w-5 h-5" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${dark && !active ? 'text-white' : 'text-slate-800'}`}>
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
      )}

      {/* Horários do posto selecionado */}
      {selected && groups.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-8">
          Sem horários disponíveis nesta unidade.
        </div>
      )}

      {selected &&
        groups.map((g) => (
          <div key={g.label} className="mb-5">
            <div className={`text-sm font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-slate-700'}`}>
              {g.label}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {g.slots.map((iso) => (
                <button
                  key={iso}
                  disabled={submitting !== null}
                  onClick={() => void handleConfirm(iso)}
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
