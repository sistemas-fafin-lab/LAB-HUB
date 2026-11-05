import type { CSSProperties } from 'react'
import { ICONES, ehNomeIcone } from './registro'
import type { NomeIcone } from './registro'

interface IconeProps {
  // `string` além de `NomeIcone` porque parte dos nomes chega de dados (ex.:
  // regras de preparo, metadados de documento) tipados como string. Nome fora
  // do registro não quebra a tela: some e avisa em dev.
  name: NomeIcone | (string & {})
  className?: string
  strokeWidth?: number
  // Usados pelo LAB DS (ds/Icon), que dimensiona e pinta por prop e não por
  // classe. Sem eles, vale o padrão do Lucide (24 px, currentColor).
  size?: number
  color?: string
  style?: CSSProperties
}

export function Icone({ name, strokeWidth = 2, ...visual }: IconeProps) {
  if (!ehNomeIcone(name)) {
    if (import.meta.env.DEV) {
      console.warn(`[Icone] "${name}" não está no registro de ícones (components/icones/registro.ts).`)
    }
    return null
  }
  const Componente = ICONES[name]
  // `visual` (className, size, color, style) vai por spread: só as props que o
  // chamador passou chegam ao Lucide, sem `undefined` sobrescrevendo padrão.
  return <Componente strokeWidth={strokeWidth} {...visual} />
}
