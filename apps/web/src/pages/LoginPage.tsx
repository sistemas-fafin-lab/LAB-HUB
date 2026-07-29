import { useState } from 'react'
import type { FormEvent } from 'react'
import { WIcon } from '../components/primitives/WIcon'
import { AuthField } from '../components/auth/AuthField'
import { BotaoOlho } from '../components/auth/BotaoOlho'
import { supabase } from '../lib/supabase'
import { validarEmail } from '../lib/validators'
import { track } from '../lib/analytics'

type FieldErrors = {
  email?: string | undefined
  password?: string | undefined
}

// O Supabase responde em inglês. Traduz o que o paciente lê; o track() continua
// enviando a mensagem crua para não quebrar a série histórica no Umami.
function mensagemErroLogin(original: string): string {
  const m = original.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  }
  if (m.includes('rate limit') || m.includes('for security purposes')) {
    return 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.'
  }
  return 'Não foi possível entrar agora. Tente novamente em instantes.'
}

// ---------------------------------------------------------------------------
// LoginPage — corpo do formulário de entrada. A moldura (painel da marca,
// card, abas) vem do AuthShell/AuthGate.
// ---------------------------------------------------------------------------
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // No login não aplicamos o mínimo de 8 caracteres (senhas legadas podem ser menores),
  // apenas exigimos que a senha não fique vazia.
  const validarSenhaLogin = (senha: string): string | null =>
    senha ? null : 'Informe sua senha'

  const setFieldError = (field: keyof FieldErrors, msg: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: msg ?? undefined }))

  // No blur só valida se o usuário digitou algo: focar e sair de um campo vazio
  // não deve marcá-lo como erro — os obrigatórios vazios são pegos no submit.
  const handleBlur = (field: keyof FieldErrors, valor: string, validar: (v: string) => string | null) => {
    if (valor) setFieldError(field, validar(valor))
  }

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
    track('login_submit')
    // Sucesso: o onAuthStateChange do AuthProvider troca a tela automaticamente.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(mensagemErroLogin(signInError.message))
      // Só a mensagem do Supabase ("Invalid login credentials"), nunca o e-mail.
      track('login_erro', { motivo: signInError.message })
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <AuthField id="login-email" label="E-mail" icon="mail" error={errors.email}>
        {(c) => (
          <input
            {...c}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => handleBlur('email', email, validarEmail)}
            placeholder="voce@email.com"
            autoComplete="username"
          />
        )}
      </AuthField>

      <AuthField
        id="login-senha"
        label="Senha"
        icon="lock"
        error={errors.password}
        slotDireito={
          <BotaoOlho visivel={mostrarSenha} onToggle={() => setMostrarSenha((v) => !v)} />
        }
      >
        {(c) => (
          <input
            {...c}
            type={mostrarSenha ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => handleBlur('password', password, validarSenhaLogin)}
            placeholder="Senha"
            autoComplete="current-password"
          />
        )}
      </AuthField>

      {error !== null && (
        <div
          role="alert"
          className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-lg px-3 py-2"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-xl active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
      >
        {loading ? 'Entrando…' : 'Entrar'}
        {!loading && <WIcon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} />}
      </button>
    </form>
  )
}
