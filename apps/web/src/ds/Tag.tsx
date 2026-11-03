import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export interface TagProps {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  onRemove?: () => void
  icon?: IconName
  /** Indisponível: anunciado como botão desabilitado, sem ação */
  disabled?: boolean
  style?: CSSProperties
}

const RESET_BOTAO: CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textDecoration: 'inherit',
  cursor: 'inherit',
  margin: 0,
}

// A pílula é só o contorno. Quando há ação, ela vive num <button> nativo
// dentro dela (teclado e leitor de tela de graça), e o "remover" é um segundo
// botão ao lado — nunca um controle dentro do outro.
export function Tag({ children, selected = false, onClick, onRemove, icon, disabled = false, style }: TagProps) {
  const [hover, setHover] = useState(false)
  const clicavel = onClick !== undefined && !disabled
  const conteudo: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: '100%',
    padding: onRemove ? '0 6px 0 14px' : '0 14px',
  }
  const rotulo = (
    <>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </>
  )
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 34,
        borderRadius: 'var(--radius-pill)',
        border: '1.5px solid ' + (selected ? 'var(--lab-blue)' : 'var(--border-strong)'),
        background: selected ? 'var(--lab-blue)' : hover && clicavel ? 'var(--lab-blue-50)' : '#fff',
        color: selected ? '#fff' : 'var(--text-body)',
        font: 'var(--type-label)',
        cursor: clicavel ? 'pointer' : 'default',
        transition: 'background var(--duration-fast)',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {clicavel || disabled ? (
        <button
          type="button"
          // aria-disabled (e não `disabled`): o item indisponível continua no
          // Tab e é anunciado como indisponível, em vez de sumir.
          {...(disabled ? { 'aria-disabled': true } : { 'aria-pressed': selected, onClick })}
          style={{ ...RESET_BOTAO, ...conteudo, borderRadius: 'var(--radius-pill)' }}
        >
          {rotulo}
        </button>
      ) : (
        <span style={conteudo}>{rotulo}</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label="Remover"
          onClick={onRemove}
          style={{ ...RESET_BOTAO, display: 'flex', alignItems: 'center', height: '100%', padding: '0 10px 0 2px', cursor: 'pointer', borderRadius: 'var(--radius-pill)' }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </span>
  )
}
