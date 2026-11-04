import { Btn, Ico, Modal } from '../portal'
import { formatDataHora } from '../../lib/datetime'

interface ConfirmBookingModalProps {
  postoNome: string
  /** Horário ISO 8601 prestes a ser agendado. */
  dataHora: string
  /** Enquanto true, mostra o carregamento e não deixa fechar. */
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Confirmação antes de efetivar o agendamento. Os exames NÃO são escolhidos
// aqui: o paciente leva o pedido médico e a recepção os seleciona no check-in.
export function ConfirmBookingModal({ postoNome, dataHora, submitting, onConfirm, onCancel }: ConfirmBookingModalProps) {
  return (
    <Modal
      open
      title="Confirmar agendamento"
      {...(submitting ? {} : { onClose: onCancel })}
      footer={
        <>
          <Btn variant="secondary" disabled={submitting} onClick={onCancel}>
            Cancelar
          </Btn>
          <Btn icon="check" loading={submitting} onClick={onConfirm}>
            {submitting ? 'Agendando…' : 'Confirmar coleta'}
          </Btn>
        </>
      }
    >
      <p className="text-[14px]">
        Coleta na <strong className="font-semibold">{postoNome}</strong> para{' '}
        <strong className="font-semibold tabular-nums">{formatDataHora(dataHora)}</strong>.
      </p>
      <div className="flex items-start gap-2.5 rounded-[12px] bg-subtle p-3">
        <Ico name="clipboard-list" size={16} className="mt-0.5" />
        <p className="text-[13px] leading-snug">
          Leve o <strong className="font-semibold">pedido médico</strong> no dia da coleta — a recepção confere os exames no
          check-in. Depois de confirmar, você poderá <strong className="font-semibold">enviar seus documentos</strong> para
          adiantar essa conferência.
        </p>
      </div>
    </Modal>
  )
}
