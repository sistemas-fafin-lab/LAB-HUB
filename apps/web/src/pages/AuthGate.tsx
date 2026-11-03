import { useState } from 'react'
import * as DS from '../ds'
import { Btn } from '../components/portal'
import { MolduraAcesso } from '../components/acesso/MolduraAcesso'
import { TituloAcesso } from '../components/acesso/pecas'
import { LoginPage } from './LoginPage'
import { CadastroPage } from './CadastroPage'
import { RecuperarSenhaPage } from './RecuperarSenhaPage'
import { NovaSenhaPage } from './NovaSenhaPage'
import { track } from '../lib/analytics'
import { navegar, useLocal } from '../lib/router'
import { caminhoDaEntrada, modoDaEntrada } from '../lib/rotas'
import type { ModoEntrada } from '../lib/rotas'
import { lerTema, salvarTema } from '../lib/tema'

const ABAS = [
  { value: 'login', label: 'Entrar' },
  { value: 'cadastro', label: 'Criar conta' },
] as const

interface AuthGateProps {
  /** Há sessão — só acontece na nova senha, aberta pelo link de recuperação. */
  comSessao: boolean
}

// ---------------------------------------------------------------------------
// AuthGate — tela de entrada (/entrar). O modo vem da URL (`?modo=`), o `next`
// é preservado ao trocar de modo; aqui ficam também o tema e o estado de
// "aguardando confirmação de e-mail". Cada formulário cuida só de si.
// ---------------------------------------------------------------------------
export function AuthGate({ comSessao }: AuthGateProps) {
  const { search } = useLocal()
  const modo = modoDaEntrada(search)
  const [dark, setDark] = useState(lerTema)
  // E-mail da conta recém-criada que ainda precisa ser confirmado.
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null)

  // Mesmo evento e payload usados pelo botão de tema do cabeçalho (App.tsx).
  const handleToggleDark = () => {
    const next = !dark
    track('tema_alternado', { modo: next ? 'dark' : 'light' })
    salvarTema(next)
    setDark(next)
  }

  const ir = (para: ModoEntrada, { substituir = false } = {}) => navegar(caminhoDaEntrada(para, search), { substituir })

  let conteudo: React.ReactNode
  if (emailEnviado !== null) {
    conteudo = (
      <ConfirmacaoEmail
        email={emailEnviado}
        onVoltarAoLogin={() => {
          setEmailEnviado(null)
          ir('login')
        }}
      />
    )
  } else if (modo === 'nova-senha') {
    conteudo = (
      <NovaSenhaPage
        comSessao={comSessao}
        onPedirNovoLink={() => ir('recuperar')}
        onVoltar={() => ir('login')}
      />
    )
  } else if (modo === 'recuperar') {
    conteudo = <RecuperarSenhaPage onVoltar={() => ir('login')} />
  } else {
    const login = modo !== 'cadastro'
    conteudo = (
      <>
        <TituloAcesso
          titulo={login ? 'Bem-vindo de volta' : 'Crie sua conta'}
          sub={login ? 'Acesse seus exames com segurança' : 'Em menos de 1 minuto você está pronto'}
        />
        <DS.Tabs
          variant="segmented"
          label="Entrar ou criar conta"
          items={ABAS}
          value={login ? 'login' : 'cadastro'}
          // Trocar de aba não empilha no histórico: o voltar sai da entrada.
          onChange={(v) => ir(v === 'cadastro' ? 'cadastro' : 'login', { substituir: true })}
          style={{ marginBottom: 24 }}
        />
        {login ? <LoginPage onEsqueciSenha={() => ir('recuperar')} /> : <CadastroPage onEmailSent={setEmailEnviado} />}
      </>
    )
  }

  return (
    <MolduraAcesso dark={dark} onToggleDark={handleToggleDark}>
      {conteudo}
    </MolduraAcesso>
  )
}

interface ConfirmacaoEmailProps {
  email: string
  onVoltarAoLogin: () => void
}

// Substitui o formulário inteiro (inclusive as abas): nesse ponto não há mais o
// que preencher, só confirmar o e-mail. Texto do sistema atual (o design não
// tem esta etapa).
function ConfirmacaoEmail({ email, onVoltarAoLogin }: ConfirmacaoEmailProps) {
  return (
    <>
      <TituloAcesso
        titulo="Confirme seu e-mail"
        sub={
          <>
            Enviamos um link de confirmação para <b className="font-semibold text-ink">{email}</b>. Confirme para
            acessar o portal.
          </>
        }
      />
      <Btn size="lg" fullWidth iconRight="arrow-right" onClick={onVoltarAoLogin}>
        Ir para o login
      </Btn>
    </>
  )
}
