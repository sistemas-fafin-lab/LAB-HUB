import { Btn, Ico, Modal } from '../portal'
import { formatarTamanho } from '../../lib/documentos'

interface ConfirmFileModalProps {
  /** Arquivo(s) prestes a ser adicionado(s). Só exibição: nada é lido do conteúdo. */
  files: File[]
  onConfirm: () => void
  onCancel: () => void
}

// Confirmação antes de efetivar a adição de um arquivo (imediata ou à fila):
// evita anexar por engano num clique ou arraste. Pode abrir por cima da caixa de
// envio: o Dialog deixa o teclado só com a caixa do topo.
export function ConfirmFileModal({ files, onConfirm, onCancel }: ConfirmFileModalProps) {
  const multiplos = files.length > 1
  return (
    <Modal
      open
      title={multiplos ? `Adicionar ${files.length} arquivos?` : 'Adicionar este arquivo?'}
      description="Confira antes de continuar."
      onClose={onCancel}
      footer={
        <>
          <Btn variant="secondary" onClick={onCancel}>
            Cancelar
          </Btn>
          <Btn icon="check" onClick={onConfirm}>
            {multiplos ? 'Adicionar arquivos' : 'Adicionar arquivo'}
          </Btn>
        </>
      }
    >
      <ul className="flex flex-col gap-2 rounded-[12px] bg-subtle p-3 max-h-40 overflow-y-auto">
        {files.map((file, i) => (
          <li key={`${file.name}-${i}`} className="flex items-center gap-2 min-w-0">
            <Ico name="file-text" size={16} className="text-muted" />
            <span className="text-[14px] font-semibold truncate" title={file.name}>
              {file.name}
            </span>
            <span className="text-[12px] text-muted shrink-0 ml-auto tabular-nums">{formatarTamanho(file.size)}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
