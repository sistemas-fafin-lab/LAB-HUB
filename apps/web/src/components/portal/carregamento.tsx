import type { ReactNode } from 'react'
import type { IconName } from '../../ds'
import { Btn } from './controles'
import { IconTile } from './identidade'
import { Node } from './Node'

export function Skel({ className = '' }: { className?: string }) {
  return <span className={'lh-skel block ' + className} />
}

/** Esqueleto de lista com o nó animado da marca. */
export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_110px] items-center gap-4 px-5 py-4">
          <Node loading size={26} />
          <div>
            <Skel className="h-3.5 w-1/2" />
            <Skel className="h-3 w-1/3 mt-2" />
          </div>
          <Skel className="h-6 w-[110px] rounded-full" />
        </div>
      ))}
    </div>
  )
}

export interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  text?: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon = 'inbox', title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <IconTile name={icon} size={48} />
      <div className="text-[15px] font-semibold mt-4">{title}</div>
      {text && <p className="text-[13px] text-muted mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Erro de uma lista: a mensagem da API, sem fingir que a lista está vazia. */
export function FalhaAoCarregar({ titulo, erro, onTentar }: { titulo: string; erro: string; onTentar: () => void }) {
  return (
    <EmptyState
      icon="alert-triangle"
      title={titulo}
      text={erro}
      action={
        <Btn variant="secondary" size="sm" onClick={onTentar}>
          Tentar novamente
        </Btn>
      }
    />
  )
}
