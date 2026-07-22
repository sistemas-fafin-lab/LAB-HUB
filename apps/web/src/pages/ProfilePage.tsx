import { useState } from 'react'
import { WIcon } from '../components/primitives/WIcon'
import type { Paciente, AtualizarPacientePayload } from '@lab-hub/shared'
import { iniciais } from '../lib/paciente'
import { MOSTRAR_NOTIFICACOES } from '../lib/flags'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import {
  apenasDigitos,
  formatarCpf,
  formatarData,
  formatarTelefone,
  validarNome,
  validarTelefone,
} from '../lib/validators'

interface ProfilePageProps {
  paciente: Paciente | null
  dark:     boolean
  onLogout: () => void | Promise<void>
  onSaved:  (p: Paciente) => void
}

interface Field {
  label: string
  value: string
}

interface FormState {
  nome:      string
  telefone:  string
  operadora: string
  plano:     string
}

// Gradiente fixo do avatar enquanto não há foto (dependentes adiados, D2).
const AVATAR_GRADIENT = 'from-blue-500 to-indigo-600'

export function ProfilePage({ paciente, dark, onLogout, onSaved }: ProfilePageProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [erro, setErro]       = useState<string | null>(null)
  const [form, setForm]       = useState<FormState>({ nome: '', telefone: '', operadora: '', plano: '' })
  const [fieldErr, setFieldErr] = useState<{ nome?: string; telefone?: string }>({})

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

  const startEdit = () => {
    if (!paciente) return
    setForm({
      nome:      paciente.nome,
      telefone:  paciente.telefone ? formatarTelefone(paciente.telefone) : '',
      operadora: paciente.convenio?.operadora ?? '',
      plano:     paciente.convenio?.plano ?? '',
    })
    setFieldErr({})
    setErro(null)
    setEditing(true)
  }

  const salvar = async () => {
    const nomeErr = validarNome(form.nome)
    const telErr  = validarTelefone(form.telefone)
    if (nomeErr || telErr) {
      setFieldErr({ ...(nomeErr ? { nome: nomeErr } : {}), ...(telErr ? { telefone: telErr } : {}) })
      return
    }

    setSaving(true)
    setErro(null)
    try {
      const operadora = form.operadora.trim()
      const plano = form.plano.trim()
      const payload: AtualizarPacientePayload = {
        nome: form.nome.trim(),
        telefone: apenasDigitos(form.telefone),
        convenio: operadora ? { operadora, ...(plano ? { plano } : {}) } : null,
      }
      const atualizado = await api.put<Paciente>('/pacientes/me', payload)
      track('perfil_salvo')
      onSaved(atualizado)
      setEditing(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = `w-full text-sm rounded-lg px-3 h-9 outline-none border transition-colors ${
    dark ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : 'bg-white border-gray-200 text-slate-800 placeholder:text-gray-400'
  } focus:border-blue-500`
  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block'
  const roValueCls = `text-sm font-medium ${dark ? 'text-gray-300' : 'text-slate-700'}`

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
          {editing ? (
            <>
              <button
                onClick={() => void salvar()}
                disabled={saving}
                className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-60"
              >
                <WIcon name="check" className="w-4 h-4" strokeWidth={2.4} />
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className={`rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 border disabled:opacity-60 ${
                  dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                disabled={!paciente}
                className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-60"
              >
                <WIcon name="pencil" className="w-4 h-4" strokeWidth={2.2} />
                Editar
              </button>
              <button
                onClick={() => {
                  track('logout')
                  void onLogout()
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 border ${
                  dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <WIcon name="log-out" className="w-4 h-4" strokeWidth={2.2} />
                Sair
              </button>
            </>
          )}
        </div>
      </div>

      {/* Personal data */}
      <div className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm`}>
        <h3 className={`text-sm font-semibold mb-4 ${dark ? 'text-white' : 'text-slate-800'}`}>Dados pessoais</h3>

        {editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Nome (editável) */}
            <div className="col-span-2">
              <label className={labelCls}>Nome completo</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                className={inputCls}
                placeholder="Seu nome completo"
              />
              {fieldErr.nome && <p className="text-xs text-red-600 mt-1">{fieldErr.nome}</p>}
            </div>

            {/* CPF (bloqueado) */}
            <div>
              <span className={labelCls}>CPF <span className="normal-case text-gray-400 font-normal">· não editável</span></span>
              <div className={roValueCls}>{paciente ? formatarCpf(paciente.cpf) : '—'}</div>
            </div>

            {/* Data de nascimento (bloqueado) */}
            <div>
              <span className={labelCls}>Data de nascimento <span className="normal-case text-gray-400 font-normal">· não editável</span></span>
              <div className={roValueCls}>{paciente ? formatarData(paciente.dataNascimento) : '—'}</div>
            </div>

            {/* Email (bloqueado) */}
            <div className="col-span-2">
              <span className={labelCls}>Email <span className="normal-case text-gray-400 font-normal">· altere pelo login</span></span>
              <div className={roValueCls}>{paciente?.email ?? '—'}</div>
            </div>

            {/* Telefone (editável) */}
            <div className="col-span-2">
              <label className={labelCls}>Telefone</label>
              <input
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: formatarTelefone(e.target.value) }))}
                className={inputCls}
                placeholder="(61) 9 0000-0000"
                inputMode="tel"
              />
              {fieldErr.telefone && <p className="text-xs text-red-600 mt-1">{fieldErr.telefone}</p>}
            </div>

            {/* Convênio (editável) */}
            <div>
              <label className={labelCls}>Convênio (operadora)</label>
              <input
                value={form.operadora}
                onChange={(e) => setForm((f) => ({ ...f, operadora: e.target.value }))}
                className={inputCls}
                placeholder="Ex.: Unimed"
              />
            </div>
            <div>
              <label className={labelCls}>Plano</label>
              <input
                value={form.plano}
                onChange={(e) => setForm((f) => ({ ...f, plano: e.target.value }))}
                className={inputCls}
                placeholder="Ex.: Premium"
              />
            </div>

            {erro && <p className="col-span-2 text-sm text-red-600">{erro}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {fields.map((f) => (
              <div key={f.label}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}</div>
                <div className={`text-sm font-medium ${dark ? 'text-gray-200' : 'text-slate-800'}`}>{f.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
