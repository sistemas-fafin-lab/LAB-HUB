import type { ReactNode } from 'react'
import { WIcon } from '../primitives/WIcon'

// Props que o AuthField injeta no controle: id casado com o <label>, classes
// visuais e a ligação de acessibilidade com a mensagem de erro.
export interface ControleProps {
  id: string
  className: string
  'aria-invalid': boolean | undefined
  'aria-describedby': string | undefined
}

interface AuthFieldProps {
  id: string
  label: string
  /** Ícone decorativo à esquerda. Omitir em controles que já trazem um ícone
   *  nativo (input[type=date]), onde dois ícones competem pelo mesmo espaço. */
  icon?: string
  error?: string | undefined
  /** Mostra o label acima do campo. Necessário em controles sem placeholder
   *  visível (select e input[type=date]), onde o rótulo não caberia dentro. */
  labelVisivel?: boolean
  /** Conteúdo posicionado à direita dentro do campo (ex.: olho de mostrar senha). */
  slotDireito?: ReactNode
  children: (controle: ControleProps) => ReactNode
}

interface OpcoesControle {
  temErro: boolean
  /** Reserva o espaço do ícone à esquerda. */
  comIcone: boolean
  /** Abre espaço à direita para o botão do olho — sem isso, um valor longo
   *  passa por baixo dele. */
  comSlotDireito: boolean
}

export function classesControle({ temErro, comIcone, comSlotDireito }: OpcoesControle): string {
  const base = `w-full ${comIcone ? 'pl-11' : 'pl-4'} ${comSlotDireito ? 'pr-12' : 'pr-4'} py-4 rounded-xl border text-sm outline-none transition-all
    bg-white/70 dark:bg-gray-900/50 backdrop-blur-sm
    text-slate-800 dark:text-gray-100
    placeholder:text-slate-400 dark:placeholder:text-gray-500
    focus:ring-2`
  const cor = temErro
    ? 'border-red-300 dark:border-red-500/60 focus:border-red-400 focus:ring-red-500/30'
    : 'border-slate-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/30'
  return `${base} ${cor}`
}

// ---------------------------------------------------------------------------
// AuthField — campo das telas de auth: ícone à esquerda, slot opcional à
// direita e mensagem de erro. O design usa o placeholder como rótulo, então o
// <label> fica sr-only por padrão — invisível na tela, presente no leitor de
// tela. O controle vem por render prop para o mesmo wrapper servir input,
// select e input[type=date].
// ---------------------------------------------------------------------------
export function AuthField({
  id,
  label,
  icon,
  error,
  labelVisivel = false,
  slotDireito,
  children,
}: AuthFieldProps) {
  const idErro = `${id}-erro`

  return (
    <div className="field-anim">
      <label
        htmlFor={id}
        className={
          labelVisivel
            ? 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-1'
            : 'sr-only'
        }
      >
        {label}
      </label>

      <div className="relative">
        {/* z-10: o controle tem bg translúcido + backdrop-blur e, sem isso,
            pinta por cima do ícone e o deixa borrado.
            flex: como inline, a SVG ganharia espaço de descendente embaixo e o
            -translate-y-1/2 centralizaria a caixa, não o ícone. */}
        {icon !== undefined && (
          <span
            aria-hidden
            className="absolute z-10 left-3.5 top-1/2 -translate-y-1/2 flex items-center text-slate-400 dark:text-gray-500 pointer-events-none"
          >
            <WIcon name={icon} className="w-4 h-4" />
          </span>
        )}

        {children({
          id,
          className: classesControle({
            temErro: Boolean(error),
            comIcone: icon !== undefined,
            comSlotDireito: slotDireito !== undefined,
          }),
          'aria-invalid': error !== undefined ? true : undefined,
          'aria-describedby': error !== undefined ? idErro : undefined,
        })}

        {slotDireito}
      </div>

      {error !== undefined && (
        <p id={idErro} className="text-xs text-red-600 dark:text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}
