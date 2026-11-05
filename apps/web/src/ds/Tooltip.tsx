import { useEffect, useId, useRef, useState } from 'react'
import { focaveis } from './teclado'
import type { CSSProperties, ReactNode } from 'react'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: TooltipSide
  /** Força visível (documentação) */
  open?: boolean
  style?: CSSProperties
}

const POSICAO: Record<TooltipSide, CSSProperties> = {
  top: { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  left: { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
  right: { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
}

export function Tooltip({ content, children, side = 'top', open, style }: TooltipProps) {
  const [ativo, setAtivo] = useState(false)
  const visivel = open ?? ativo
  const id = useId()
  const raiz = useRef<HTMLSpanElement>(null)
  // O texto do tooltip vira a descrição acessível do controle que ele
  // acompanha: o leitor de tela anuncia ao focar, mesmo com o tooltip
  // escondido (aria-describedby lê o conteúdo de elementos ocultos).
  useEffect(() => {
    const alvo = raiz.current ? focaveis(raiz.current)[0] : undefined
    if (!alvo) return
    const anterior = alvo.getAttribute('aria-describedby')
    alvo.setAttribute('aria-describedby', anterior ? `${anterior} ${id}` : id)
    return () => {
      if (anterior) alvo.setAttribute('aria-describedby', anterior)
      else alvo.removeAttribute('aria-describedby')
    }
  }, [id])
  return (
    // Abre também com o foco do filho (teclado), não só com o mouse; Esc fecha.
    <span
      ref={raiz}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setAtivo(false)
      }}
      onMouseEnter={() => setAtivo(true)}
      onMouseLeave={() => setAtivo(false)}
      onFocus={() => setAtivo(true)}
      onBlur={() => setAtivo(false)}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        style={{
          position: 'absolute',
          ...POSICAO[side],
          background: '#000',
          color: '#fff',
          font: 'var(--type-body-sm)',
          padding: '6px 10px',
          borderRadius: 8,
          whiteSpace: 'nowrap',
          opacity: visivel ? 1 : 0,
          visibility: visivel ? 'visible' : 'hidden',
          pointerEvents: 'none',
          transition: 'opacity var(--duration-fast), visibility var(--duration-fast)',
          zIndex: 20,
        }}
      >
        {content}
      </span>
    </span>
  )
}
