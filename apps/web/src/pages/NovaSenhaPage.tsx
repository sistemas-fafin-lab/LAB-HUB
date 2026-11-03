import { useState } from 'react'
import type { FormEvent } from 'react'
import { Btn } from '../components/portal'
import { AvisoErro, CampoSenha, RegrasSenha, TituloAcesso } from '../components/acesso/pecas'
import { supabase } from '../lib/supabase'
import { validarSenha } from '../lib/validators'
import { erroNovaSenha } from '../lib/errosAuth'
import { navegar } from '../lib/router'
import { CAMINHO_DA_TELA } from '../lib/rotas'

interface NovaSenhaPageProps {
  /** Sessão de recuperação aberta pelo link do e-mail (o Supabase lê o link). */
  comSessao: boolean
  onPedirNovoLink: () => void
  onVoltar: () => void
}

type FieldErrors = { senha?: string | undefined; confirmacao?: string | undefined }

// ---------------------------------------------------------------------------
// NovaSenhaPage — destino do link de recuperação. O Supabase troca o link por
// uma sessão antes do primeiro render (AuthProvider só sai do "carregando"
// depois); sem ela, o link venceu ou já foi usado. A senha nova segue a mesma
// política do cadastro e é salva com updateUser. A sessão continua aberta,
// então "Continuar" leva direto ao portal.
// ---------------------------------------------------------------------------
export function NovaSenhaPage({ comSessao, onPedirNovoLink, onVoltar }: NovaSenhaPageProps) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [estado, setEstado] = useState<'form' | 'concluido' | 'expirado'>('form')
  // Derivado a cada render (e não só no primeiro): o AuthGate é o mesmo com e
  // sem sessão, então a sessão pode chegar ou cair com a tela montada.
  const expirado = estado === 'expirado' || (!comSessao && estado !== 'concluido')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    const nextErrors: FieldErrors = {
      senha: validarSenha(senha) ?? undefined,
      confirmacao: confirmacao !== senha ? 'As senhas não conferem.' : undefined,
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (!error) {
      setEstado('concluido')
      return
    }
    const falha = erroNovaSenha(error.message)
    if (falha.tipo === 'link-expirado') setEstado('expirado')
    else if (falha.tipo === 'campo') setErrors({ senha: falha.mensagem })
    else setErro(falha.mensagem)
  }

  if (expirado) {
    return (
      <>
        <TituloAcesso titulo="Link inválido ou expirado" sub="Peça um novo link para criar sua senha." />
        <div className="flex flex-col gap-3">
          <Btn size="lg" fullWidth iconRight="arrow-right" onClick={onPedirNovoLink}>
            Pedir novo link
          </Btn>
          <Btn variant="ghost" fullWidth onClick={onVoltar}>
            Voltar para o login
          </Btn>
        </div>
      </>
    )
  }

  if (estado === 'concluido') {
    return (
      <>
        <TituloAcesso titulo="Senha alterada" sub="Use a nova senha nos próximos acessos." />
        <Btn size="lg" fullWidth iconRight="arrow-right" onClick={() => navegar(CAMINHO_DA_TELA.home, { substituir: true })}>
          Continuar
        </Btn>
      </>
    )
  }

  return (
    <>
      <TituloAcesso titulo="Crie uma nova senha" sub="Escolha uma senha que você não usa em outros serviços." />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {erro !== null && <AvisoErro>{erro}</AvisoErro>}
        <CampoSenha
          id="nova-senha"
          label="Nova senha"
          value={senha}
          onChange={setSenha}
          error={errors.senha}
          autoComplete="new-password"
        />
        <RegrasSenha senha={senha} />
        <CampoSenha
          id="nova-senha-confirmacao"
          label="Confirmar nova senha"
          value={confirmacao}
          onChange={setConfirmacao}
          error={errors.confirmacao}
          autoComplete="new-password"
        />
        <Btn type="submit" size="lg" fullWidth loading={salvando}>
          {salvando ? 'Salvando' : 'Salvar nova senha'}
        </Btn>
      </form>
    </>
  )
}
