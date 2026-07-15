import { useState } from 'react'
import type { TipoDocumento } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { WFileInput } from '../primitives/WFileInput'
import { DOC_META, validarArquivo } from '../../lib/documentos'

interface DocumentUploaderProps {
  /** Tipos oferecidos. Varia por contexto: perenes no perfil, pedido na coleta. */
  tipos: TipoDocumento[]
  onEnviar: (file: File, tipo: TipoDocumento) => Promise<void>
  enviando: boolean
  dark: boolean
}

// Escolhe o tipo e envia o arquivo. Sem barra de progresso: fetch não expõe
// progresso de upload (e o SDK do Supabase, que também usa fetch, não seria
// diferente) — um spinner indeterminado é o teto honesto aqui.
export function DocumentUploader({ tipos, onEnviar, enviando, dark }: DocumentUploaderProps) {
  const [tipo, setTipo] = useState<TipoDocumento>(tipos[0] ?? 'outro')
  const [recusa, setRecusa] = useState<string | null>(null)

  const enviar = ([file]: File[]) => {
    if (!file) return
    // Recusa localmente o que a API recusaria depois — sem gastar o upload.
    const problema = validarArquivo(file)
    setRecusa(problema)
    if (problema) return
    // O erro do envio já é exibido pelo chamador (via hook); aqui só evitamos o unhandled.
    void onEnviar(file, tipo).catch(() => {})
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {tipos.map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            disabled={enviando}
            className={`px-3 h-8 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 disabled:opacity-50 ${
              tipo === t
                ? 'bg-blue-600 text-white'
                : dark
                  ? 'bg-gray-800 text-gray-400 hover:text-white'
                  : 'bg-slate-100 text-gray-600 hover:text-slate-900'
            }`}
          >
            <WIcon name={DOC_META[t].icon} className="w-3.5 h-3.5" strokeWidth={2.2} />
            {DOC_META[t].label}
          </button>
        ))}
      </div>

      {enviando ? (
        <div
          className={`rounded-xl border-2 border-dashed px-4 py-6 flex flex-col items-center gap-2 ${
            dark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-slate-50'
          }`}
        >
          <WIcon name="loader-2" className="w-5 h-5 text-blue-600 animate-spin" strokeWidth={2.2} />
          <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
            Enviando…
          </span>
        </div>
      ) : (
        <WFileInput
          onSelect={enviar}
          dark={dark}
          hint="JPG, PNG, WEBP ou PDF · até 10 MB"
        />
      )}

      {recusa && (
        <div className="flex items-start gap-2 text-xs text-red-600">
          <WIcon name="alert-circle" className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={2.2} />
          <span>{recusa}</span>
        </div>
      )}
    </div>
  )
}
