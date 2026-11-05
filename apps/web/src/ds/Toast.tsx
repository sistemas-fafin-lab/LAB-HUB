import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export type ToastTone = 'info' | 'success' | 'alert' | 'neutral'

export interface ToastProps {
  title?: string
  message?: string
  tone?: ToastTone
  action?: string
  onAction?: () => void
  onClose?: () => void
  style?: CSSProperties
}

const TONS: Record<ToastTone, readonly [fundo: string, icone: IconName]> = {
  info: ['var(--lab-blue)', 'info'],
  success: ['var(--lab-blue)', 'check-circle-2'],
  alert: ['var(--lab-coral)', 'alert-circle'],
  neutral: ['#000', 'bell'],
}

export function Toast({ title, message, tone = 'info', action, onAction, onClose, style }: ToastProps) {
  const [fundo, icone] = TONS[tone]
  return (
    <div
      role={tone === 'alert' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 320,
        maxWidth: 480,
        padding: '14px 16px',
        background: fundo,
        color: '#fff',
        borderRadius: 'var(--radius-lg)',
        fontFamily: 'var(--font-body)',
        boxShadow: 'var(--shadow-md)',
        ...style,
      }}
    >
      <Icon name={icone} size={22} />
      <div style={{ flex: 1, display: 'grid', gap: 2 }}>
        {title && <div style={{ font: 'var(--type-label)', fontSize: 15 }}>{title}</div>}
        {message && <div style={{ font: 'var(--type-body-sm)', opacity: 0.9 }}>{message}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          style={{ border: 0, background: 'rgba(255,255,255,.18)', color: '#fff', font: 'var(--type-label)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
        >
          {action}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{ border: 0, background: 'transparent', color: '#fff', display: 'flex', cursor: 'pointer', padding: 4 }}
        >
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  )
}
