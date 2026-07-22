import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CadastroPacientePayload, Paciente, Sexo } from '@lab-hub/shared'
import { WIcon } from '../components/primitives/WIcon'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import {
  apenasDigitos,
  formatarCpf,
  formatarTelefone,
  validarCpf,
  validarDataNascimento,
  validarEmail,
  validarNome,
  validarSenha,
  validarTelefone,
} from '../lib/validators'

interface CadastroResponse {
  requiresEmailConfirmation: boolean
  paciente: Paciente
}

interface CadastroPageProps {
  onGoToLogin: () => void
}

const inputBase = 'w-full border rounded-xl px-3 h-11 text-sm outline-none'
const inputClass = `${inputBase} border-gray-200 focus:border-blue-400`
const labelClass =
  'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1'

type FieldErrors = {
  nome?: string | undefined
  email?: string | undefined
  password?: string | undefined
  cpf?: string | undefined
  dataNascimento?: string | undefined
  telefone?: string | undefined
}

export function CadastroPage({ onGoToLogin }: CadastroPageProps) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cpf, setCpf] = useState('')
  const [sexo, setSexo] = useState<Sexo>('M')
  const [dataNascimento, setDataNascimento] = useState('')
  const [telefone, setTelefone] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Aplica o erro (ou limpa) de um campo. Usado no onBlur de cada input.
  const setFieldError = (field: keyof FieldErrors, msg: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: msg ?? undefined }))

  // Borda vermelha quando o campo tem erro.
  const fieldClass = (field: keyof FieldErrors) =>
    errors[field] ? `${inputBase} border-red-300 focus:border-red-400` : inputClass

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const nextErrors: FieldErrors = {
      nome: validarNome(nome) ?? undefined,
      email: validarEmail(email) ?? undefined,
      password: validarSenha(password) ?? undefined,
      cpf: validarCpf(cpf) ?? undefined,
      dataNascimento: validarDataNascimento(dataNascimento) ?? undefined,
      telefone: validarTelefone(telefone) ?? undefined,
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setLoading(true)
    track('cadastro_submit')
    try {
      const telDigits = apenasDigitos(telefone)
      const payload: CadastroPacientePayload = {
        nome,
        email,
        password,
        cpf: apenasDigitos(cpf),
        sexo,
        dataNascimento,
        ...(telDigits ? { telefone: telDigits } : {}),
      }
      const res = await api.post<CadastroResponse>('/cadastro', payload)
      track('cadastro_sucesso', { confirmacao_email: res.requiresEmailConfirmation === true })
      if (res.requiresEmailConfirmation) {
        // Produção: precisa confirmar o e-mail antes de entrar.
        setDone(true)
      } else {
        // Testes: entra direto — o onAuthStateChange troca a tela.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          setError('Conta criada, mas o login automático falhou. Tente entrar manualmente.')
        }
      }
    } catch (err: unknown) {
      const motivo = err instanceof Error ? err.message : 'Falha ao cadastrar'
      setError(motivo)
      track('cadastro_erro', { motivo })
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-sm text-center">
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <WIcon name="mail-check" className="w-6 h-6" strokeWidth={2.2} />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-1">Confirme seu e-mail</h1>
          <p className="text-sm text-gray-500 mb-5">
            Enviamos um link de confirmação para <strong>{email}</strong>. Confirme para acessar o portal.
          </p>
          <button
            type="button"
            onClick={onGoToLogin}
            className="w-full bg-blue-600 text-white rounded-xl h-11 font-semibold text-sm hover:bg-blue-700 transition"
          >
            Ir para o login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <img src="/logo.svg" alt="Lab Hub" className="h-9 w-auto" />
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h1 className="text-lg font-bold text-slate-900 mb-1">Criar conta</h1>
          <p className="text-sm text-gray-500 mb-5">Cadastre-se para acessar o portal.</p>

          <div className="mb-4">
            <label className={labelClass}>Nome completo</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={() => setFieldError('nome', validarNome(nome))}
              placeholder="Seu nome"
              className={fieldClass('nome')}
            />
            {errors.nome && <p className="text-xs text-red-600 mt-1">{errors.nome}</p>}
          </div>

          <div className="mb-4">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setFieldError('email', validarEmail(email))}
              placeholder="voce@email.com"
              className={fieldClass('email')}
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div className="mb-4">
            <label className={labelClass}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setFieldError('password', validarSenha(password))}
              placeholder="mínimo 8 caracteres"
              className={fieldClass('password')}
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
          </div>

          <div className="mb-4">
            <label className={labelClass}>CPF</label>
            <input
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              onBlur={() => setFieldError('cpf', validarCpf(cpf))}
              placeholder="000.000.000-00"
              className={fieldClass('cpf')}
            />
            {errors.cpf && <p className="text-xs text-red-600 mt-1">{errors.cpf}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelClass}>Sexo</label>
              <select
                value={sexo}
                onChange={(e) => setSexo(e.target.value as Sexo)}
                className={inputClass}
              >
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Nascimento</label>
              <input
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                onBlur={() => setFieldError('dataNascimento', validarDataNascimento(dataNascimento))}
                className={fieldClass('dataNascimento')}
              />
            </div>
          </div>
          {errors.dataNascimento && (
            <p className="text-xs text-red-600 -mt-3 mb-4">{errors.dataNascimento}</p>
          )}

          <div className="mb-4">
            <label className={labelClass}>Telefone (opcional)</label>
            <input
              inputMode="numeric"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              onBlur={() => setFieldError('telefone', validarTelefone(telefone))}
              placeholder="(61) 9 0000-0000"
              className={fieldClass('telefone')}
            />
            {errors.telefone && <p className="text-xs text-red-600 mt-1">{errors.telefone}</p>}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-xl h-11 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? 'Criando…' : 'Criar conta'}
            {!loading && <WIcon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} />}
          </button>

          <button
            type="button"
            onClick={onGoToLogin}
            className="w-full text-center text-sm text-slate-500 mt-4 hover:text-slate-700"
          >
            Já tem conta? <span className="font-semibold text-blue-600">Entrar</span>
          </button>
        </form>
      </div>
    </div>
  )
}
