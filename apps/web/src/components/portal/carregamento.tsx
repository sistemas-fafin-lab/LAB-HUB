import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/** O botão de nova tentativa fica em "Tentando" por no mínimo este tempo, para não piscar. */
const TENTANDO_MIN_MS = 600

/** Erro de uma lista: a mensagem da API, sem fingir que a lista está vazia. */
export function FalhaAoCarregar({ titulo, erro, onTentar }: { titulo: string; erro: string; onTentar: () => void | Promise<unknown> }) {
  const [tentando, setTentando] = useState(false)
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  async function tentar() {
    setTentando(true)
    const minimo = new Promise((r) => setTimeout(r, TENTANDO_MIN_MS))
    try {
      await Promise.all([Promise.resolve(onTentar()).catch(() => undefined), minimo])
    } finally {
      if (montado.current) setTentando(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <IconTile name="cloud-off" size={48} tone="coral" />
      <div className="text-[15px] font-semibold mt-4">{titulo}</div>
      <p className="text-[13px] text-muted mt-1 max-w-sm">{erro}</p>
      <div className="mt-4">
        <Btn variant="secondary" icon="rotate-cw" loading={tentando} onClick={() => void tentar()}>
          {tentando ? 'Tentando' : 'Tentar novamente'}
        </Btn>
      </div>
    </div>
  )
}
