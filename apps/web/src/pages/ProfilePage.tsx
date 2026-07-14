import { WIcon } from '../components/primitives/WIcon'
import type { Paciente } from '@lab-hub/shared'
import { iniciais } from '../lib/paciente'
import { MOSTRAR_NOTIFICACOES } from '../lib/flags'
import { formatarCpf, formatarData, formatarTelefone } from '../lib/validators'

interface ProfilePageProps {
  paciente: Paciente | null
  dark:     boolean
  onLogout: () => void | Promise<void>
}

interface Field {
  label: string
  value: string
}

// Gradiente fixo do avatar enquanto não há foto (dependentes adiados, D2).
const AVATAR_GRADIENT = 'from-blue-500 to-indigo-600'

export function ProfilePage({ paciente, dark, onLogout }: ProfilePageProps) {
  // "Operadora · Plano" quando há convênio; "Não informado" se o paciente já
  // carregou sem convênio; "—" enquanto o perfil ainda não chegou.
  const convenioLabel = paciente?.convenio
    ? [paciente.convenio.operadora, paciente.convenio.plano].filter(Boolean).join(' · ')
    : paciente
      ? 'Não informado'
      : '—'

  const fields: Field[] = [
    { label: 'Nome completo',      value: paciente?.nome ?? '—' },
    { label: 'CPF',                value: paciente ? formatarCpf(paciente.cpf) : '—' },
    { label: 'Data de nascimento', value: paciente ? formatarData(paciente.dataNascimento) : '—' },
    { label: 'Email',              value: paciente?.email ?? '—' },
    { label: 'Telefone',           value: paciente?.telefone ? formatarTelefone(paciente.telefone) : '—' },
    { label: 'Convênio',           value: convenioLabel },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header card */}
      <div className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-6 shadow-sm mb-5 flex items-center gap-5`}>
        <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${AVATAR_GRADIENT} text-white text-2xl font-bold flex items-center justify-center shadow-lg shadow-blue-500/25`}>
          {iniciais(paciente?.nome ?? '') || '—'}
        </div>
        <div className="flex-1">
          <h1
            className={`text-2xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            {paciente?.nome ?? '—'}
          </h1>
          <p className="text-sm text-gray-500">
            {paciente?.convenio ? convenioLabel : 'Titular da conta'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1 text-[11px] font-semibold">
              <WIcon name="shield-check" className="w-3 h-3" strokeWidth={2.6} />
              Conta verificada
            </span>
            {/* Badge de notificações — oculto por flag até haver backend */}
            {MOSTRAR_NOTIFICACOES && (
              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                <WIcon name="bell" className="w-3 h-3" strokeWidth={2.6} />
                Notificações ativas
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700">
            <WIcon name="pencil" className="w-4 h-4" strokeWidth={2.2} />
            Editar
          </button>
          <button
            onClick={() => void onLogout()}
            className={`rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 border ${
              dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <WIcon name="log-out" className="w-4 h-4" strokeWidth={2.2} />
            Sair
          </button>
        </div>
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
