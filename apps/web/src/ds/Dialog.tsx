import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { IconButton } from './IconButton'

export interface DialogProps {
  open?: boolean
  title?: string
  description?: string
  children?: ReactNode
  /** Botões de ação, alinhados à direita */
  footer?: ReactNode
  onClose?: () => void
  width?: number
  /** Sem fundo escurecido nem posição fixa (para documentação e embutir) */
  inline?: boolean
  style?: CSSProperties
}

export function Dialog({ open = true, title, description, children, footer, onClose, width = 480, inline = false, style }: DialogProps) {
  const id = useId()
  const painelRef = useRef<HTMLDivElement>(null)
  const cliqueComecouNoFundo = useRef(false)
  const modal = open && !inline
  useEffect(() => {
    if (!modal) return
    // Foco vai para a caixa ao abrir (leitor de tela anuncia o título) e volta
    // para quem a abriu ao fechar.
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    painelRef.current?.focus()
    return () => anterior?.focus()
  }, [modal])
  useEffect(() => {
    if (!modal || !onClose) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [modal, onClose])
  if (!open) return null
  const idTitulo = title ? `${id}-titulo` : undefined
  const idDescricao = description ? `${id}-descricao` : undefined
  const painel = (
    <div
      ref={painelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal={!inline}
      aria-labelledby={idTitulo}
      aria-describedby={idDescricao}
      className="lh-dialog"
      style={{
        width,
        maxWidth: '100%',
        background: '#fff',
        borderRadius: 'var(--radius-xl)',
        padding: 28,
        boxShadow: inline ? 'none' : 'var(--shadow-lg)',
        fontFamily: 'var(--font-body)',
        display: 'grid',
        gap: 12,
        boxSizing: 'border-box',
        outline: 'none',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, display: 'grid', gap: 6 }}>
          {title && (
            <div id={idTitulo} style={{ font: 'var(--type-h3)', fontSize: 24, letterSpacing: 'var(--tracking-display)' }}>
              {title}
            </div>
          )}
          {description && (
            <div id={idDescricao} style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>
              {description}
            </div>
          )}
        </div>
        {onClose && <IconButton icon="x" label="Fechar" size="sm" onClick={onClose} />}
      </div>
      {children}
      {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>{footer}</div>}
    </div>
  )
  if (inline) return painel
  return (
    <div
      // Só fecha se o clique começou E terminou no fundo: arrastar uma seleção
      // de dentro da caixa para fora não pode fechá-la.
      onMouseDown={(e) => {
        cliqueComecouNoFundo.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (cliqueComecouNoFundo.current && e.target === e.currentTarget) onClose?.()
      }}
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 50 }}
    >
      {painel}
    </div>
  )
}
