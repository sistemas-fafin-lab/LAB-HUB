import { WIcon } from '../primitives/WIcon'

interface BotaoOlhoProps {
  visivel: boolean
  onToggle: () => void
}

// ---------------------------------------------------------------------------
// BotaoOlho — mostra/esconde a senha. Vai no slotDireito do AuthField, por isso
// já vem posicionado. O flex é o que centraliza de fato: como inline-block com
// conteúdo inline, a SVG ganharia espaço de descendente embaixo e o ícone
// subiria em relação ao meio do campo.
// ---------------------------------------------------------------------------
export function BotaoOlho({ visivel, onToggle }: BotaoOlhoProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
      className="absolute z-10 right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 transition"
    >
      <WIcon name={visivel ? 'eye-off' : 'eye'} className="w-4 h-4" />
    </button>
  )
}
