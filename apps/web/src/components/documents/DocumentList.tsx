import type { Documento } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { WSkeleton } from '../primitives/WSkeleton'
import { DocumentCard } from './DocumentCard'

interface DocumentListProps {
  documentos: Documento[]
  loading: boolean
  dark: boolean
  onRemover?: (id: string) => void
  /** Texto do estado vazio — muda entre a coleta e a página de documentos. */
  vazio?: string
  /** Colunas máximas do grid. A timeline é estreita (2); a página inteira cabe 3. */
  colunas?: 2 | 3
}

export function DocumentList({
  documentos,
  loading,
  dark,
  onRemover,
  vazio = 'Nenhum documento enviado ainda.',
  colunas = 3,
}: DocumentListProps) {
  const grid = `grid grid-cols-1 sm:grid-cols-2 ${colunas === 3 ? 'xl:grid-cols-3' : ''} gap-4`

  if (loading) {
    return (
      <div className={grid}>
        {[0, 1].map((i) => (
          <WSkeleton key={i} className="h-52 rounded-2xl" dark={dark} />
        ))}
      </div>
    )
  }

  if (documentos.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed py-10 flex flex-col items-center gap-2 ${
          dark ? 'border-gray-800 text-gray-500' : 'border-gray-200 text-gray-400'
        }`}
      >
        <WIcon name="file-x" className="w-7 h-7" strokeWidth={1.6} />
        <span className="text-sm">{vazio}</span>
      </div>
    )
  }

  return (
    <div className={grid}>
      {documentos.map((d) => (
        // Spread condicional: com exactOptionalPropertyTypes, passar
        // onRemover={undefined} não é o mesmo que omitir a prop.
        <DocumentCard key={d.id} documento={d} dark={dark} {...(onRemover ? { onRemover } : {})} />
      ))}
    </div>
  )
}
