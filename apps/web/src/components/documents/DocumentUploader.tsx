import { useState } from 'react'
import type { TipoDocumento } from '@lab-hub/shared'
import { Chip, Ico, MensagemDeErro, Node } from '../portal'
import { AreaDeArquivos } from './AreaDeArquivos'
import { ConfirmFileModal } from './ConfirmFileModal'
import { avisar } from '../../lib/avisos'
import { DOC_META, validarArquivo } from '../../lib/documentos'

interface DocumentUploaderProps {
  /** Tipos oferecidos. Varia por contexto: perenes no perfil, pedido na coleta. */
  tipos: TipoDocumento[]
  onEnviar: (file: File, tipo: TipoDocumento) => Promise<void>
  enviando: boolean
}

// Escolhe o tipo e envia o arquivo. Sem barra de progresso: fetch não expõe
// progresso de upload, então um indicador indeterminado é o teto honesto aqui.
export function DocumentUploader({ tipos, onEnviar, enviando }: DocumentUploaderProps) {
  const [tipo, setTipo] = useState<TipoDocumento>(tipos[0] ?? 'outro')
  const [recusa, setRecusa] = useState<string | null>(null)
  // Arquivo escolhido aguardando confirmação: nada sobe até o paciente confirmar.
  const [pendente, setPendente] = useState<File | null>(null)

  const selecionar = ([file]: File[]) => {
    if (!file) return
    // Recusa localmente o que a API recusaria depois, sem gastar o upload.
    const problema = validarArquivo(file)
    setRecusa(problema)
    if (problema) return
    setPendente(file)
  }

  const confirmar = () => {
    if (!pendente) return
    const { name } = pendente
    // O erro do envio já é exibido pelo chamador (via hook); aqui só evitamos o unhandled.
    void onEnviar(pendente, tipo)
      .then(() => avisar({ title: 'Documento enviado', message: name }))
      .catch(() => {})
    setPendente(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {tipos.map((t) => (
          // Sem onClick durante o envio: o tipo fica congelado.
          <Chip key={t} selected={tipo === t} {...(enviando ? {} : { onClick: () => setTipo(t) })}>
            <Ico name={DOC_META[t].icon} size={14} />
            {DOC_META[t].label}
          </Chip>
        ))}
      </div>

      {enviando ? (
        <div role="status" className="rounded-[14px] border-[1.5px] border-dashed border-line-strong p-4 flex items-center gap-3 text-[14px] font-semibold">
          <Node loading size={26} />
          Enviando…
        </div>
      ) : (
        <AreaDeArquivos onSelect={selecionar} hint="JPG, PNG, WEBP ou PDF · até 10 MB" />
      )}

      {recusa && <MensagemDeErro>{recusa}</MensagemDeErro>}

      {pendente && <ConfirmFileModal files={[pendente]} onConfirm={confirmar} onCancel={() => setPendente(null)} />}
    </div>
  )
}
