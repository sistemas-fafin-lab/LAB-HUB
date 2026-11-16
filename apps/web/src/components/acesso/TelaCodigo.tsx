import { useState } from 'react'
import type { FormEvent } from 'react'
import { Btn } from '../portal'
import { CodigoVerificacao, ReenviarCodigo, TituloAcesso } from './pecas'
import { useFluxoDoCodigo } from './useFluxoDoCodigo'
import { doisFatores, mascararEmail } from '../../lib/doisFatores'
import { comTransicao } from '../../lib/transicao'

interface TelaCodigoProps {
  email: string | null
  /** Último envio já feito para esta sessão (recarregar a tela não reenvia). */
  enviadoEm: string | null
  onVerificado: () => void
  /** Encerra a sessão aberta pela senha e volta ao login. */
  onVoltar: () => void | Promise<void>
}

/** Segunda etapa do login: o código enviado ao e-mail da conta. */
export function TelaCodigo({ email, enviadoEm, onVerificado, onVoltar }: TelaCodigoProps) {
  const fluxo = useFluxoDoCodigo('login', email, enviadoEm)
  const [verificando, setVerificando] = useState(false)
  const [voltando, setVoltando] = useState(false)

  const verificar = async (e?: FormEvent) => {
    e?.preventDefault()
    const codigo = fluxo.codigoPronto()
    if (codigo === null) return
    setVerificando(true)
    try {
      await comTransicao('Preparando seus resultados', () => doisFatores.verificar(codigo))
      onVerificado()
    } catch (erro: unknown) {
      fluxo.recusado(erro)
      setVerificando(false)
    }
  }

  return (
    <>
      <TituloAcesso titulo="Confirme que é você" sub="Sua conta tem verificação em duas etapas." />
      <form onSubmit={(e) => void verificar(e)} noValidate className="flex flex-col gap-5">
        <p className="text-[14px]">
          Enviamos um código de 6 dígitos para <b className="font-semibold">{email ? mascararEmail(email) : 'o seu e-mail'}</b>.
        </p>
        <CodigoVerificacao valor={fluxo.codigo} onChange={fluxo.setCodigo} erro={fluxo.erro} disabled={verificando} />
        <ReenviarCodigo enviadoEm={fluxo.enviadoEm} onReenviar={fluxo.reenviar} />
        <div className="flex flex-col gap-3">
          <Btn type="submit" size="lg" fullWidth loading={verificando}>
            {verificando ? 'Verificando' : 'Verificar e entrar'}
          </Btn>
          <Btn
            variant="ghost"
            fullWidth
            disabled={verificando || voltando}
            onClick={() => {
              setVoltando(true)
              void onVoltar()
            }}
          >
            Voltar
          </Btn>
        </div>
      </form>
    </>
  )
}
