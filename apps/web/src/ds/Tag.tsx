import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { ativarComTeclado } from './teclado'

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

export function Tag({ children, selected = false, onClick, onRemove, icon, disabled = false, style }: TagProps) {
  const [hover, setHover] = useState(false)
  const clicavel = onClick !== undefined && !disabled
  // Com botão de remover dentro, a tag não pode ser ela mesma um botão
  // (controle interativo aninhado): o clique de mouse continua funcionando.
  const papel = disabled
    ? { role: 'button', 'aria-disabled': true }
    : clicavel && !onRemove
      ? { role: 'button', tabIndex: 0, 'aria-pressed': selected, onKeyDown: ativarComTeclado(onClick) }
      : {}
  return (
    <span
      onClick={clicavel ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...papel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 14px',
        borderRadius: 'var(--radius-pill)',
        border: '1.5px solid ' + (selected ? 'var(--lab-blue)' : 'var(--border-strong)'),
        background: selected ? 'var(--lab-blue)' : hover && clicavel ? 'var(--lab-blue-50)' : '#fff',
        color: selected ? '#fff' : 'var(--text-body)',
        font: 'var(--type-label)',
        cursor: clicavel ? 'pointer' : 'default',
        transition: 'background var(--duration-fast)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remover"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          // Espaço/Enter aqui não devem acionar também o onClick da tag.
          onKeyDown={(e) => e.stopPropagation()}
          style={{ display: 'flex', marginRight: -4, cursor: 'pointer', border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </span>
  )
}
