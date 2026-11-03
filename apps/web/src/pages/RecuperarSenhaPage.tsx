import { useState } from 'react'
import type { FormEvent } from 'react'
import { Btn, Field } from '../components/portal'
import { AvisoErro, TituloAcesso } from '../components/acesso/pecas'
import { supabase } from '../lib/supabase'
import { validarEmail } from '../lib/validators'
import { mensagemErroRecuperacao } from '../lib/errosAuth'
import { urlNovaSenha } from '../lib/rotas'

interface RecuperarSenhaPageProps {
  onVoltar: () => void
}

// ---------------------------------------------------------------------------
// RecuperarSenhaPage — pede ao Supabase Auth o e-mail com o link de nova senha
// (resetPasswordForEmail). Só por e-mail: o login é por e-mail e o Supabase
// não procura conta por CPF. O Supabase responde igual exista a conta ou não,
// então a confirmação não afirma que o e-mail foi enviado.
// ---------------------------------------------------------------------------
export function RecuperarSenhaPage({ onVoltar }: RecuperarSenhaPageProps) {
  const [email, setEmail] = useState('')
  const [erroCampo, setErroCampo] = useState<string | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    const destino = email.trim()
    const invalido = validarEmail(destino)
    setErroCampo(invalido ?? undefined)
    if (invalido !== null) return

    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(destino, { redirectTo: urlNovaSenha() })
    setEnviando(false)
    if (error) setErro(mensagemErroRecuperacao(error.message))
    else setEnviadoPara(destino)
  }

  if (enviadoPara !== null) {
    return (
      <>
        <TituloAcesso titulo="Verifique seu e-mail" sub="Confira sua caixa de entrada." />
        <div className="flex flex-col gap-3">
          <div className="rounded-[16px] bg-card border border-line p-5 text-[14px]">
            Se houver uma conta com <b className="font-semibold">{enviadoPara}</b>, enviamos um link para criar uma
            nova senha. Se não encontrar, confira a caixa de spam.
          </div>
          <Btn variant="secondary" fullWidth onClick={() => setEnviadoPara(null)}>
            Reenviar
          </Btn>
          <Btn variant="ghost" fullWidth onClick={onVoltar}>
            Voltar para o login
          </Btn>
        </div>
      </>
    )
  }

  return (
    <>
      <TituloAcesso
        titulo="Recuperar acesso"
        sub="Informe o e-mail da sua conta. Enviamos um link para criar uma nova senha."
      />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {erro !== null && <AvisoErro>{erro}</AvisoErro>}
        <Field
          id="recuperar-email"
          label="E-mail"
          type="email"
          icon="mail"
          value={email}
          onChange={setEmail}
          error={erroCampo}
          placeholder="voce@email.com"
          autoComplete="username"
        />
        <Btn type="submit" size="lg" fullWidth loading={enviando} iconRight="arrow-right">
          {enviando ? 'Enviando' : 'Enviar instruções'}
        </Btn>
        <Btn variant="ghost" fullWidth onClick={onVoltar}>
          Voltar para o login
        </Btn>
      </form>
    </>
  )
}
