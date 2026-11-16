import { useState } from 'react'
import { Btn, Modal } from '../portal'
import { api, ApiError } from '../../lib/api'
import { avisar } from '../../lib/avisos'
import { track } from '../../lib/analytics'
import { CaixaComCodigo } from '../acesso/CaixaComCodigo'

// O texto segue o que DELETE /pacientes/me faz (apps/api/src/lib/expurgo.ts e a
// migration 20260731170000): a exclusão é imediata; somem o acesso, os
// documentos enviados, e-mail, telefone e convênio; ficam nome, CPF,
// nascimento, agendamentos e laudos, que são prontuário (CFM 1.821/2007).
export const SUBTITULO_EXCLUIR_CONTA = 'Encerra o acesso e apaga seus documentos e contatos'

interface ExcluirContaProps {
  aberta: boolean
  onFechar: () => void
  /** Depois do DELETE: sai da sessão e leva à entrada. */
  onExcluida: () => void | Promise<void>
  /** Verificação em duas etapas ligada: a exclusão também pede o código. */
  pedeCodigo?: boolean
}

function OQueAcontece() {
  return (
    <>
      <p className="text-[14px]">
        Seu acesso ao portal é encerrado agora, e os documentos que você enviou, seu e-mail, telefone e convênio são
        apagados. Não dá para desfazer.
      </p>
      <p className="text-[13px] text-muted">
        Laudos, agendamentos, nome, CPF e data de nascimento ficam guardados pelo laboratório: são prontuário, que a lei
        manda manter por 20 anos.
      </p>
    </>
  )
}

export function CaixaExcluirConta({ aberta, onFechar, onExcluida, pedeCodigo = false }: ExcluirContaProps) {
  const [excluindo, setExcluindo] = useState(false)

  if (aberta && pedeCodigo) {
    return (
      <CaixaComCodigo
        titulo="Excluir sua conta?"
        descricao={<OQueAcontece />}
        rotuloConfirmar="Excluir conta"
        rotuloConfirmando="Excluindo…"
        rotuloCancelar="Manter conta"
        onFechar={onFechar}
        onConfirmar={async (codigo) => {
          const falha = await api.del('/pacientes/me', { codigo }).then(
            () => null,
            (e: unknown) => e,
          )
          // O 429 do limite da rota (sem código da API) leva o texto da exclusão.
          if (falha instanceof ApiError && falha.status === 429 && falha.codigo === undefined) {
            throw new ApiError(429, 'Muitas tentativas. Aguarde um minuto e tente de novo.')
          }
          if (falha !== null) throw falha
          track('conta_excluida')
          await onExcluida()
        }}
      />
    )
  }

  const confirmar = async () => {
    setExcluindo(true)
    try {
      await api.del('/pacientes/me')
      track('conta_excluida')
    } catch (e: unknown) {
      setExcluindo(false)
      const mensagem =
        e instanceof ApiError && e.status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível excluir a conta.'
      avisar({ tone: 'alert', title: 'Não foi possível excluir a conta', message: mensagem })
      return
    }
    await onExcluida()
  }

  return (
    <Modal
      open={aberta}
      title="Excluir sua conta?"
      {...(excluindo ? {} : { onClose: onFechar })}
      footer={
        <>
          <Btn variant="secondary" disabled={excluindo} onClick={onFechar}>
            Manter conta
          </Btn>
          <Btn loading={excluindo} onClick={() => void confirmar()}>
            {excluindo ? 'Excluindo…' : 'Excluir conta'}
          </Btn>
        </>
      }
    >
      <OQueAcontece />
    </Modal>
  )
}
