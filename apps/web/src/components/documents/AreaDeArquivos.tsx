import { useRef, useState } from 'react'
import { IconTile } from '../portal'
import { MIMES_ACEITOS } from '../../lib/documentos'

interface AreaDeArquivosProps {
  /** Recebe sempre um array: com `multiple` falso, de um item só. */
  onSelect: (files: File[]) => void
  /** Permite escolher e arrastar vários de uma vez. */
  multiple?: boolean
  disabled?: boolean
  /** Texto de apoio sob o rótulo (ex.: limite de tamanho). */
  hint: string
}

/** Seleção de arquivo por clique ou arrastar e soltar. Só entrega os File escolhidos. */
export function AreaDeArquivos({ onSelect, multiple = false, disabled = false, hint }: AreaDeArquivosProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)

  const entregar = (lista: FileList | null) => {
    if (disabled || !lista?.length) return
    onSelect(multiple ? Array.from(lista) : [lista[0] as File])
    // Sem zerar, escolher o MESMO arquivo duas vezes seguidas não dispara 'change'.
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setArrastando(true)
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        entregar(e.dataTransfer.files)
      }}
      className={'lh-row rounded-[14px] border-[1.5px] border-dashed ' + (disabled ? 'opacity-60' : '')}
      style={{ borderColor: arrastando ? 'var(--lh-action)' : 'var(--lh-line-strong)' }}
    >
      <input
        ref={inputRef}
        type="file"
        // Lista de MIME e não `image/*`: no iOS, citar image/jpeg faz o Safari
        // converter fotos HEIC para JPEG. Sem isso chegaria HEIC, que o painel de
        // check-in (Chrome desktop) não renderiza.
        accept={MIMES_ACEITOS.join(',')}
        aria-label="Arquivos"
        multiple={multiple}
        disabled={disabled}
        hidden
        onChange={(e) => entregar(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={'w-full p-4 flex items-center gap-3 text-left rounded-[14px] ' + (disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
      >
        <IconTile name="upload" size={40} />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">{multiple ? 'Clique ou arraste seus arquivos' : 'Clique ou arraste um arquivo'}</span>
          <span className="block text-[12px] text-muted">{hint}</span>
        </span>
      </button>
    </div>
  )
}
