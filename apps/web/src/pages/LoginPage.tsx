import { useState } from 'react'
import type { FormEvent } from 'react'
import { Btn, Field } from '../components/portal'
import { AvisoErro, CampoSenha } from '../components/acesso/pecas'
import * as DS from '../ds'
import { salvarManterConectado, supabase } from '../lib/supabase'
import { validarEmail } from '../lib/validators'
import { mensagemErroLogin } from '../lib/errosAuth'
import { track } from '../lib/analytics'
import { comTransicao } from '../lib/transicao'
import { marcarEntrada } from '../lib/boasVindas'
import { doisFatores } from '../lib/doisFatores'
import { chaveDaSessao, registrarSituacao } from '../lib/segundaEtapa'

type FieldErrors = {
  email?: string | undefined
  password?: string | undefined
}

// No login não aplicamos a política de senha (senhas legadas podem ser menores),
// apenas exigimos que a senha não fique vazia.
const validarSenhaLogin = (senha: string): string | null => (senha ? null : 'Informe sua senha')

interface LoginPageProps {
  onEsqueciSenha: () => void
}

// ---------------------------------------------------------------------------
// LoginPage — corpo do formulário de entrada. A moldura (painel da marca,
// título, abas) vem do AuthGate.
// ---------------------------------------------------------------------------
export function LoginPage({ onEsqueciSenha }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [manter, setManter] = useState(true)

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
    // Antes do login: é ela que diz onde o Supabase guarda a sessão nova.
    salvarManterConectado(manter)
    // Sucesso: o onAuthStateChange do AuthProvider troca a tela automaticamente.
    // Dentro da transição também a situação da verificação em duas etapas: o
    // App já abre direto na tela do código, sem mostrar o portal antes.
    const { error: signInError } = await comTransicao('Preparando seus resultados', async () => {
      const resposta = await supabase.auth.signInWithPassword({ email, password })
      if (!resposta.error) {
        try {
          registrarSituacao(chaveDaSessao(resposta.data.session), await doisFatores.estado())
        } catch {
          // Sem a situação, o App abre o portal e a API decide (403 → código).
        }
      }
      return resposta
    })
    if (!signInError) marcarEntrada()
    if (signInError) {
      setError(mensagemErroLogin(signInError.message))
      // Só a mensagem do Supabase ("Invalid login credentials"), nunca o e-mail.
      track('login_erro', { motivo: signInError.message })
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error !== null && <AvisoErro>{error}</AvisoErro>}

      <Field
        id="login-email"
        label="E-mail"
        type="email"
        icon="mail"
        value={email}
        onChange={setEmail}
        onBlur={() => handleBlur('email', email, validarEmail)}
        error={errors.email}
        placeholder="voce@email.com"
        autoComplete="username"
      />

      <CampoSenha
        id="login-senha"
        value={password}
        onChange={setPassword}
        onBlur={() => handleBlur('password', password, validarSenhaLogin)}
        error={errors.password}
        autoComplete="current-password"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap -my-2">
        <DS.Checkbox label="Manter conectado" checked={manter} onChange={setManter} />
        <button type="button" onClick={onEsqueciSenha} className="min-h-[44px] inline-flex items-center text-[14px] font-medium text-link hover:underline">
          Esqueci minha senha
        </button>
      </div>

      <Btn type="submit" size="lg" fullWidth loading={loading} iconRight="arrow-right">
        {loading ? 'Entrando' : 'Entrar'}
      </Btn>
    </form>
  )
}
