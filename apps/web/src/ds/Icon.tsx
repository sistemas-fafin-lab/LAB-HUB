import type { CSSProperties } from 'react'
import { Icone } from '../components/icones/Icone'
import type { NomeIcone } from '../components/icones/registro'

// Ícone do LAB DS. Delega ao registro único de ícones do app
// (components/icones/registro.ts): nome fora do registro não desenha nada e
// avisa em dev. Para um ícone novo, acrescente-o ao registro.
export type IconName = NomeIcone

export interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  color?: string
  style?: CSSProperties
  className?: string
}

export function Icon({ name, size = 20, strokeWidth = 1.5, color = 'currentColor', style, className }: IconProps) {
  return (
    <Icone
      name={name}
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      style={{ flex: 'none', display: 'inline-block', ...style }}
      {...(className !== undefined ? { className } : {})}
    />
  )
}
