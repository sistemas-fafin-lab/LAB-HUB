import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CadastroPacientePayload, Paciente, Sexo } from '@lab-hub/shared'
import { Btn, Field, SelectField } from '../components/portal'
import { AvisoErro, CampoSenha, RegrasSenha } from '../components/acesso/pecas'
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

const OPCOES_SEXO: readonly { value: Sexo; label: string }[] = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
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
// marca, título, abas) vem do AuthGate. O design dividia o cadastro em três
// etapas (dados, senha, código por SMS); aqui segue um formulário só, com os
// campos e as validações de hoje — não há verificação por SMS.
// ---------------------------------------------------------------------------
export function CadastroPage({ onEmailSent }: CadastroPageProps) {
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

  // Aplica o erro (ou limpa) de um campo. Usado no onBlur de cada input.
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error !== null && <AvisoErro>{error}</AvisoErro>}

      <Field
        id="cad-nome"
        label="Nome completo"
        icon="user-round"
        value={nome}
        onChange={setNome}
        onBlur={() => handleBlur('nome', nome, validarNome)}
        error={errors.nome}
        autoComplete="name"
      />

      <Field
        id="cad-cpf"
        label="CPF"
        icon="id-card"
        inputMode="numeric"
        value={cpf}
        onChange={(v) => setCpf(formatarCpf(v))}
        onBlur={() => handleBlur('cpf', cpf, validarCpf)}
        error={errors.cpf}
        placeholder="000.000.000-00"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="cad-nascimento"
          label="Nascimento"
          type="date"
          value={dataNascimento}
          onChange={setDataNascimento}
          onBlur={() => handleBlur('dataNascimento', dataNascimento, validarDataNascimento)}
          error={errors.dataNascimento}
          autoComplete="bday"
        />
        <SelectField
          label="Sexo"
          options={OPCOES_SEXO}
          value={sexo}
          onChange={(v) => setSexo(v === 'F' ? 'F' : 'M')}
        />
      </div>

      <Field
        id="cad-telefone"
        label="Telefone (opcional)"
        icon="smartphone"
        inputMode="numeric"
        value={telefone}
        onChange={(v) => setTelefone(formatarTelefone(v))}
        onBlur={() => handleBlur('telefone', telefone, validarTelefone)}
        error={errors.telefone}
        placeholder="(00) 0 0000-0000"
        autoComplete="tel"
      />

      <Field
        id="cad-email"
        label="E-mail"
        type="email"
        icon="mail"
        value={email}
        onChange={setEmail}
        onBlur={() => handleBlur('email', email, validarEmail)}
        error={errors.email}
        placeholder="voce@email.com"
        autoComplete="email"
      />

      <CampoSenha
        id="cad-senha"
        value={password}
        onChange={setPassword}
        onBlur={() => handleBlur('password', password, validarSenha)}
        error={errors.password}
        autoComplete="new-password"
      />
      <RegrasSenha senha={password} />

      <Btn type="submit" size="lg" fullWidth loading={loading} iconRight="arrow-right">
        {loading ? 'Criando conta' : 'Criar conta'}
      </Btn>
    </form>
  )
}
