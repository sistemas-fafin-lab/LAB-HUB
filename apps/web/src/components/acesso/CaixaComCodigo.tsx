import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Btn, Modal } from '../portal'
import { CodigoVerificacao, ReenviarCodigo } from './pecas'
import { useFluxoDoCodigo } from './useFluxoDoCodigo'
import { mascararEmail } from '../../lib/doisFatores'
import { supabase } from '../../lib/supabase'

interface CaixaComCodigoProps {
  titulo: string
  /** Texto acima do código (o que vai acontecer). */
  descricao?: ReactNode
  rotuloConfirmar: string
  rotuloConfirmando: string
  onConfirmar: (codigo: string) => Promise<void>
  onFechar: () => void
}

/** Caixa que pede o código do e-mail antes de uma mudança (montar = enviar o código). */
export function CaixaComCodigo({ titulo, descricao, rotuloConfirmar, rotuloConfirmando, onConfirmar, onFechar }: CaixaComCodigoProps) {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
  }, [])
  const fluxo = useFluxoDoCodigo('confirmacao', email)
  const [confirmando, setConfirmando] = useState(false)

  const confirmar = async () => {
    const codigo = fluxo.codigoPronto()
    if (codigo === null) return
    setConfirmando(true)
    try {
      await onConfirmar(codigo)
    } catch (e: unknown) {
      fluxo.recusado(e)
      setConfirmando(false)
    }
  }

  return (
    <Modal
      open
      title={titulo}
      {...(confirmando ? {} : { onClose: onFechar })}
      footer={
        <>
          <Btn variant="secondary" disabled={confirmando} onClick={onFechar}>
            Cancelar
          </Btn>
          <Btn loading={confirmando} onClick={() => void confirmar()}>
            {confirmando ? rotuloConfirmando : rotuloConfirmar}
          </Btn>
        </>
      }
    >
      {descricao}
      <p className="text-[14px]">
        Enviamos um código para <b className="font-semibold">{email ? mascararEmail(email) : 'o seu e-mail'}</b>.
      </p>
      <CodigoVerificacao valor={fluxo.codigo} onChange={fluxo.setCodigo} erro={fluxo.erro} disabled={confirmando} />
      <ReenviarCodigo enviadoEm={fluxo.enviadoEm} onReenviar={fluxo.reenviar} />
    </Modal>
  )
}
