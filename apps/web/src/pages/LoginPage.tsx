import { useState } from 'react'
import type { FormEvent } from 'react'
import { WIcon } from '../components/primitives/WIcon'
import { supabase } from '../lib/supabase'
import { validarEmail } from '../lib/validators'

interface LoginPageProps {
  onGoToCadastro: () => void
}

const inputBase = 'w-full border rounded-xl px-3 h-11 text-sm outline-none'
const inputClass = `${inputBase} border-gray-200 focus:border-blue-400`
const labelClass = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1'

type FieldErrors = {
  email?: string | undefined
  password?: string | undefined
}

export function LoginPage({ onGoToCadastro }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // No login não aplicamos o mínimo de 8 caracteres (senhas legadas podem ser menores),
  // apenas exigimos que a senha não fique vazia.
  const validarSenhaLogin = (senha: string): string | null =>
    senha ? null : 'Informe sua senha'

  const setFieldError = (field: keyof FieldErrors, msg: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: msg ?? undefined }))

  const fieldClass = (field: keyof FieldErrors) =>
    errors[field] ? `${inputBase} border-red-300 focus:border-red-400` : inputClass

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const nextErrors: FieldErrors = {
      email: validarEmail(email) ?? undefined,
      password: validarSenhaLogin(password) ?? undefined,
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setLoading(true)
    // Sucesso: o onAuthStateChange do AuthProvider troca a tela automaticamente.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/25">
            L
          </div>
          <div className="font-black text-xl tracking-tight text-slate-900">
            Lab Hub<span className="text-blue-500">.</span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h1 className="text-lg font-bold text-slate-900 mb-1">Entrar</h1>
          <p className="text-sm text-gray-500 mb-5">Acesse o portal do paciente.</p>

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
              onBlur={() => setFieldError('password', validarSenhaLogin(password))}
              placeholder="••••••••"
              className={fieldClass('password')}
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
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
            {loading ? 'Entrando…' : 'Entrar'}
            {!loading && <WIcon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} />}
          </button>

          <button
            type="button"
            onClick={onGoToCadastro}
            className="w-full text-center text-sm text-slate-500 mt-4 hover:text-slate-700"
          >
            Não tem conta? <span className="font-semibold text-blue-600">Criar conta</span>
          </button>
        </form>
      </div>
    </div>
  )
}
