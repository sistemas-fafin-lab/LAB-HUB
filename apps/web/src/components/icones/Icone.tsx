import { ICONES, ehNomeIcone } from './registro'
import type { NomeIcone } from './registro'

interface IconeProps {
  // `string` além de `NomeIcone` porque parte dos nomes chega de dados (ex.:
  // regras de preparo, metadados de documento) tipados como string. Nome fora
  // do registro não quebra a tela: some e avisa em dev.
  name: NomeIcone | (string & {})
  className?: string
  strokeWidth?: number
}

export function Icone({ name, className, strokeWidth = 2 }: IconeProps) {
  if (!ehNomeIcone(name)) {
    if (import.meta.env.DEV) {
      console.warn(`[Icone] "${name}" não está no registro de ícones (components/icones/registro.ts).`)
    }
    return null
  }
  const Componente = ICONES[name]
  return <Componente className={className} strokeWidth={strokeWidth} />
}
