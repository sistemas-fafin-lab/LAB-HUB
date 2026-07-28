import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CadastroPacientePayload, Paciente, Sexo } from '@lab-hub/shared'
import { WIcon } from '../components/primitives/WIcon'
import { AuthField } from '../components/auth/AuthField'
import { AuthSelect } from '../components/auth/AuthSelect'
import type { OpcaoSelect } from '../components/auth/AuthSelect'
import { BotaoOlho } from '../components/auth/BotaoOlho'
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
  /** Conta criada, mas falta confirmar o e-mail: o AuthGate assume a tela. */
  onEmailSent: (email: string) => void
}

const OPCOES_SEXO: readonly OpcaoSelect<Sexo>[] = [
  { valor: 'M', rotulo: 'Masculino' },
  { valor: 'F', rotulo: 'Feminino' },
]

type FieldErrors = {
  nome?: string | undefined
  email?: string | undefined
  password?: string | undefined
  cpf?: string | undefined
  dataNascimento?: string | undefined
  telefone?: string | undefined
}

// ---------------------------------------------------------------------------
// CadastroPage — corpo do formulário de criação de conta. A moldura (painel da
// marca, card, abas) vem do AuthShell/AuthGate.
// ---------------------------------------------------------------------------
export function CadastroPage({ onEmailSent }: CadastroPageProps) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [cpf, setCpf] = useState('')
  const [sexo, setSexo] = useState<Sexo>('M')
  const [dataNascimento, setDataNascimento] = useState('')
  const [telefone, setTelefone] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Aplica o erro (ou limpa) de um campo. Usado no onBlur de cada input.
  const setFieldError = (field: keyof FieldErrors, msg: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: msg ?? undefined }))

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
        onEmailSent(email)
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <AuthField id="cad-nome" label="Nome completo" icon="user" error={errors.nome}>
        {(c) => (
          <input
            {...c}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => setFieldError('nome', validarNome(nome))}
            placeholder="Nome completo"
            autoComplete="name"
          />
        )}
      </AuthField>

      <AuthField id="cad-email" label="E-mail" icon="mail" error={errors.email}>
        {(c) => (
          <input
            {...c}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setFieldError('email', validarEmail(email))}
            placeholder="voce@email.com"
            autoComplete="email"
          />
        )}
      </AuthField>

      <AuthField
        id="cad-senha"
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
            onBlur={() => setFieldError('password', validarSenha(password))}
            placeholder="Senha (mínimo 8 caracteres)"
            autoComplete="new-password"
          />
        )}
      </AuthField>

      <AuthField id="cad-cpf" label="CPF" icon="id-card" error={errors.cpf}>
        {(c) => (
          <input
            {...c}
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
            onBlur={() => setFieldError('cpf', validarCpf(cpf))}
            placeholder="000.000.000-00"
          />
        )}
      </AuthField>

      {/* Sexo e Nascimento não têm placeholder visível, então levam label à vista. */}
      <div className="grid grid-cols-2 gap-3">
        <AuthSelect
          id="cad-sexo"
          label="Sexo"
          icon="venus-and-mars"
          labelVisivel
          valor={sexo}
          opcoes={OPCOES_SEXO}
          onChange={setSexo}
        />

        {/* Sem ícone: o input[type=date] já traz o seu, e num campo estreito os
            dois juntos truncam a data no celular. */}
        <AuthField
          id="cad-nascimento"
          label="Nascimento"
          error={errors.dataNascimento}
          labelVisivel
        >
          {(c) => (
            <input
              {...c}
              className={`${c.className} campo-data`}
              type="date"
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
              onBlur={() => setFieldError('dataNascimento', validarDataNascimento(dataNascimento))}
              autoComplete="bday"
            />
          )}
        </AuthField>
      </div>

      <AuthField id="cad-telefone" label="Telefone (opcional)" icon="phone" error={errors.telefone}>
        {(c) => (
          <input
            {...c}
            inputMode="numeric"
            value={telefone}
            onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
            onBlur={() => setFieldError('telefone', validarTelefone(telefone))}
            placeholder="Telefone (opcional)"
            autoComplete="tel"
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
        {loading ? 'Criando…' : 'Criar conta'}
        {!loading && <WIcon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} />}
      </button>
    </form>
  )
}
