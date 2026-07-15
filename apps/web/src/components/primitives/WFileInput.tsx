import { useRef, useState } from 'react'
import { WIcon } from './WIcon'

interface WFileInputProps {
  /** Recebe sempre um array — com `multiple` falso, de um item só. */
  onSelect: (files: File[]) => void
  /** MIME aceitos. O default casa com o que a API valida por magic bytes. */
  accept?: string
  /** Permite escolher/arrastar vários de uma vez. */
  multiple?: boolean
  disabled?: boolean
  dark: boolean
  /** Texto de apoio sob o rótulo (ex.: limite de tamanho). */
  hint?: string
}

// Área de seleção de arquivo: clique ou arrastar-e-soltar. Primitivo burro —
// não conhece a API nem o domínio, só emite o File escolhido.
//
// `accept` cobre um caso real: no iOS, listar image/jpeg faz o Safari converter
// fotos HEIC para JPEG na seleção. Sem isso chegaria HEIC, que o painel de
// check-in (Chrome desktop) não renderiza.
const ACCEPT_PADRAO = 'image/jpeg,image/png,image/webp,application/pdf'

export function WFileInput({
  onSelect,
  accept = ACCEPT_PADRAO,
  multiple = false,
  disabled = false,
  dark,
  hint,
}: WFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const entregar = (lista: FileList | null) => {
    if (disabled || !lista?.length) return
    onSelect(multiple ? Array.from(lista) : [lista[0] as File])
    // Zera o input: sem isto, escolher o MESMO arquivo duas vezes seguidas não
    // dispara 'change' (o value não muda) e a UI congela sem erro nenhum.
    if (inputRef.current) inputRef.current.value = ''
  }

  const borda = dragging
    ? 'border-blue-500 bg-blue-500/5'
    : dark
      ? 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
      : 'border-gray-200 hover:border-gray-300 bg-slate-50'

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        entregar(e.dataTransfer.files)
      }}
      className={`rounded-xl border-2 border-dashed transition-colors ${borda} ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => entregar(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`w-full px-4 py-6 flex flex-col items-center gap-2 ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            dark ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-400 shadow-sm'
          }`}
        >
          <WIcon name="upload" className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div className="text-center">
          <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
            {multiple ? 'Clique ou arraste seus arquivos' : 'Clique ou arraste um arquivo'}
          </div>
          {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
        </div>
      </button>
    </div>
  )
}
