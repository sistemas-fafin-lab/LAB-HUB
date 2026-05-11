import { WIcon } from '../components/primitives/WIcon'
import type { Dependent } from '../components/layout/Topbar'

interface ProfilePageProps {
  patient: Dependent
  dark:    boolean
}

interface Field {
  label: string
  value: string
}

export function ProfilePage({ patient, dark }: ProfilePageProps) {
  const fields: Field[] = [
    { label: 'Nome completo',     value: patient.name          },
    { label: 'CPF',               value: '•••.•••.123-45'     },
    { label: 'Data de nascimento', value: '12/03/1989'         },
    { label: 'Email',             value: 'joao.madeiro@email.com' },
    { label: 'Telefone',          value: '(61) 9 9123-4567'   },
    { label: 'Convênio',          value: 'Unimed · Plano Premium' },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header card */}
      <div className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-6 shadow-sm mb-5 flex items-center gap-5`}>
        <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${patient.color} text-white text-2xl font-bold flex items-center justify-center shadow-lg shadow-blue-500/25`}>
          {patient.initials}
        </div>
        <div className="flex-1">
          <h1
            className={`text-2xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            {patient.name}
          </h1>
          <p className="text-sm text-gray-500">{patient.relation} · Plano Premium · Unimed</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1 text-[11px] font-semibold">
              <WIcon name="shield-check" className="w-3 h-3" strokeWidth={2.6} />
              Conta verificada
            </span>
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 text-[11px] font-semibold">
              <WIcon name="bell" className="w-3 h-3" strokeWidth={2.6} />
              Notificações ativas
            </span>
          </div>
        </div>
        <button className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700">
          <WIcon name="pencil" className="w-4 h-4" strokeWidth={2.2} />
          Editar
        </button>
      </div>

      {/* Personal data */}
      <div className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm`}>
        <h3 className={`text-sm font-semibold mb-4 ${dark ? 'text-white' : 'text-slate-800'}`}>Dados pessoais</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {fields.map((f) => (
            <div key={f.label}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}</div>
              <div className={`text-sm font-medium ${dark ? 'text-gray-200' : 'text-slate-800'}`}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
