import { useEffect } from 'react'
import { WIcon } from '../primitives/WIcon'
import { formatarTamanho } from '../../lib/documentos'

interface ConfirmFileModalProps {
  /** Arquivo(s) prestes a ser adicionado(s) — só para exibição, nada é lido do conteúdo. */
  files: File[]
  /** Enquanto true, bloqueia o fechamento e mostra estado de carregamento. */
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
  dark: boolean
}

// Confirmação exibida antes de efetivar a adição de um arquivo (imediata ou à
// fila) — evita anexar por engano num clique/arraste. Mesmo contrato visual do
// ConfirmBookingModal; usa z-[60] porque pode abrir por cima do UploadDocumentsModal.
export function ConfirmFileModal({
  files,
  submitting = false,
  onConfirm,
  onCancel,
  dark,
}: ConfirmFileModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [submitting, onCancel])

  const multiplos = files.length > 1

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={multiplos ? 'Confirmar adição de arquivos' : 'Confirmar adição de arquivo'}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => !submitting && onCancel()}
      />

      <div
        className={`relative w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        }`}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <WIcon name="upload" className="w-5 h-5" strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-base font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>
                {multiplos ? `Adicionar ${files.length} arquivos?` : 'Adicionar este arquivo?'}
              </div>
              <p className={`mt-1 text-sm leading-snug ${dark ? 'text-gray-400' : 'text-slate-600'}`}>
                Confira antes de continuar.
              </p>
            </div>
          </div>

          <div
            className={`mt-4 flex flex-col gap-2 rounded-xl border p-3 max-h-40 overflow-y-auto ${
              dark ? 'border-gray-800 bg-gray-800/40' : 'border-gray-100 bg-slate-50'
            }`}
          >
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center gap-2 min-w-0">
                <WIcon name="file-text" className="w-4 h-4 shrink-0 text-gray-400" strokeWidth={2.2} />
                <span
                  className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-900'}`}
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="text-[11px] text-gray-400 shrink-0 ml-auto">
                  {formatarTamanho(file.size)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className={`px-5 py-3 flex items-center gap-2 border-t ${
            dark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-slate-50'
          }`}
        >
          <button
            onClick={onCancel}
            disabled={submitting}
            className={`ml-auto px-4 h-9 rounded-xl text-sm font-semibold border transition disabled:opacity-50 ${
              dark
                ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                : 'border-gray-200 text-slate-700 hover:bg-white'
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="px-4 h-9 rounded-xl text-sm font-semibold bg-blue-600 text-white inline-flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition disabled:opacity-60"
          >
            {submitting ? (
              'Adicionando…'
            ) : (
              <>
                <WIcon name="check" className="w-4 h-4" strokeWidth={2.4} />
                {multiplos ? 'Adicionar arquivos' : 'Adicionar arquivo'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
