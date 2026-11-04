import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { IconButton } from './IconButton'
import { focaveis } from './teclado'

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

// Caixas abertas, da mais antiga à do topo. Só a do topo responde ao teclado:
// com uma confirmação por cima de outra caixa, Esc fecha uma de cada vez e o Tab
// não disputa o foco entre as duas.
const pilha: string[] = []
let overflowDoBody = ''

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
    // O fundo não rola enquanto houver caixa aberta.
    if (pilha.length === 0) {
      overflowDoBody = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    pilha.push(id)
    return () => {
      pilha.splice(pilha.indexOf(id), 1)
      if (pilha.length === 0) document.body.style.overflow = overflowDoBody
      anterior?.focus()
    }
  }, [modal, id])
  useEffect(() => {
    if (!modal) return
    const tecla = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== id) return
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key === 'Tab') prenderFoco(e)
    }
    // Tab e Shift+Tab circulam só dentro da caixa (aria-modal promete isso).
    const prenderFoco = (e: KeyboardEvent) => {
      const painel = painelRef.current
      if (!painel) return
      const itens = focaveis(painel)
      const primeiro = itens[0]
      const ultimo = itens[itens.length - 1]
      const ativo = document.activeElement
      if (!primeiro || !ultimo) {
        e.preventDefault()
        painel.focus()
        return
      }
      const fora = !(ativo instanceof Node) || !painel.contains(ativo)
      if (e.shiftKey && (fora || ativo === primeiro || ativo === painel)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (fora || ativo === ultimo)) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [modal, onClose, id])
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
      {footer && <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>{footer}</div>}
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
      // O trilho fica na largura da tela: sem isto, ele cresce até `width` e a
      // caixa sai pela direita em telas menores que ela.
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', placeItems: 'center', padding: 24, zIndex: 50 }}
    >
      {painel}
    </div>
  )
}
