import { Icone } from '../icones/Icone'

interface WIconProps {
  name: string
  className?: string
  strokeWidth?: number
}

// Fachada das telas antigas sobre o registro de ícones (components/icones).
// O <span inline-flex> em volta é o mesmo de quando o ícone vinha do Lucide por
// CDN: mantém o layout das telas que ainda usam WIcon idêntico.
export function WIcon({ name, className = 'w-5 h-5', strokeWidth = 2 }: WIconProps) {
  return (
    <span className="inline-flex">
      <Icone name={name} className={className} strokeWidth={strokeWidth} />
    </span>
  )
}
