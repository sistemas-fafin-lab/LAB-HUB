import { WIcon } from '../components/primitives/WIcon'

interface SchedulePageProps {
  dark: boolean
}

interface SlotGroup {
  date: string
  times: string[]
}

const SLOTS: SlotGroup[] = [
  { date: 'Hoje, 5 Mai',    times: ['14:30', '15:00', '16:15'] },
  { date: 'Amanhã, 6 Mai', times: ['07:00', '07:30', '08:00', '09:15', '10:30', '11:00'] },
  { date: 'Sex, 8 Mai',    times: ['07:00', '08:30', '10:00', '13:30'] },
]

export function SchedulePage({ dark }: SchedulePageProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <h1
        className={`text-2xl font-bold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}
        style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
      >
        Agendar coleta
      </h1>
      <p className="text-sm text-gray-500 mb-5">Selecione a unidade, data e horário disponíveis.</p>

      <div className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm mb-5`}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Unidade selecionada</div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <WIcon name="map-pin" className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
              Unidade Asa Sul · SGAS 915, Bloco B
            </div>
            <div className="text-xs text-gray-500">Asa Sul, Brasília · DF · 2,4 km</div>
          </div>
          <button className="text-xs font-semibold text-blue-600 px-3 py-1.5 bg-blue-50 rounded-lg">
            Trocar unidade
          </button>
        </div>
      </div>

      {SLOTS.map((s) => (
        <div key={s.date} className="mb-5">
          <div className={`text-sm font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-slate-700'}`}>
            {s.date}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {s.times.map((t) => (
              <button
                key={t}
                className={`rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 border ${
                  dark
                    ? 'border-gray-800 bg-gray-900 text-gray-200 hover:border-blue-500 hover:bg-blue-500/10'
                    : 'border-gray-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
