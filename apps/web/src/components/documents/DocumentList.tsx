import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Documento } from '@lab-hub/shared'
import { Btn, Modal, Node, Panel, Skel } from '../portal'
import { DOC_META } from '../../lib/documentos'
import { DocumentCard } from './DocumentCard'

interface DocumentListProps {
  documentos: Documento[]
  loading: boolean
  onRemover?: (id: string) => void
  /** Estado vazio: muda entre a coleta e a página de documentos. */
  vazio: ReactNode
  /** Grade: o detalhe da coleta é estreito (até 2 colunas); a página cabe 3. */
  colunas?: 2 | 3
}

// A de 2 colunas vive num painel estreito: decide pela largura disponível, não
// pela da tela, para o cartão nunca ficar espremido.
const GRADE = {
  2: 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4',
  3: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5',
} as const

export function DocumentList({ documentos, loading, onRemover, vazio, colunas = 3 }: DocumentListProps) {
  const [aExcluir, setAExcluir] = useState<Documento | null>(null)

  // Só sem nada para mostrar: um recarregamento não troca a lista por esqueleto.
  if (loading && documentos.length === 0) {
    return (
      <div className={GRADE[colunas]} role="status" aria-busy="true" aria-label="Carregando">
        {[0, 1, 2].map((i) => (
          <Panel key={i} pad={16}>
            <div className="flex items-center gap-3 mb-3">
              <Node loading size={26} />
              <div className="flex-1">
                <Skel className="h-3.5 w-2/3" />
                <Skel className="h-3 w-1/2 mt-2" />
              </div>
            </div>
            <Skel className="h-24 rounded-[12px]" />
            <Skel className="h-3 w-1/2 mt-3" />
          </Panel>
        ))}
      </div>
    )
  }

  if (documentos.length === 0) return <>{vazio}</>

  return (
    <>
      <div className={GRADE[colunas]}>
        {documentos.map((d) => (
          <DocumentCard key={d.id} documento={d} {...(onRemover ? { onExcluir: setAExcluir } : {})} />
        ))}
      </div>
      {aExcluir && onRemover && (
        <Modal
          open
          title="Excluir documento?"
          description={`${DOC_META[aExcluir.tipo].label} (${aExcluir.nomeArquivo}) será removido da sua conta.`}
          onClose={() => setAExcluir(null)}
          footer={
            <>
              <Btn variant="secondary" onClick={() => setAExcluir(null)}>
                Manter
              </Btn>
              <Btn
                onClick={() => {
                  onRemover(aExcluir.id)
                  setAExcluir(null)
                }}
              >
                Excluir
              </Btn>
            </>
          }
        />
      )}
    </>
  )
}
