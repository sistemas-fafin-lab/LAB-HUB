import { useEffect, useRef, useState } from 'react'
import { WIcon } from '../primitives/WIcon'
import {
  JEJUM_LABEL,
  JEJUM_MAX_H,
  REGRAS_GERAIS,
  RESSALVA_PREPARO,
  calcularJejum,
} from '../../lib/preparo'

interface PreparoColetaProps {
  /** ISO 8601 da coleta — base do jejum calculado. */
  dataHora: string
  dark: boolean
}

// Ícone de atenção que revela o preparo/cuidados da coleta ao passar o mouse
// ou clicar. O clique fixa o popover (fecha ao clicar fora); o hover mostra
// enquanto o cursor estiver sobre o ícone ou o balão.
//
// Assume que o chamador já filtrou por preparoAplicavel(): este componente fala
// no futuro ("faça sua última refeição até…") e não se auto-protege — há um
// único call site (ColetaCard), então uma guarda dupla seria só duplicação.
export function PreparoColeta({ dataHora, dark }: PreparoColetaProps) {
  const [pinned, setPinned] = useState(false) // aberto por clique
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visible = pinned || hover

  const jejum = calcularJejum(dataHora)

  // Fecha o popover fixado ao clicar fora.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pinned])

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => setPinned((p) => !p)}
        aria-label="Preparo para a coleta"
        aria-expanded={visible}
        className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-400 text-white hover:bg-amber-500 active:scale-95 transition"
      >
        <WIcon name="alert-triangle" className="w-4 h-4" strokeWidth={2.3} />
      </button>

      {visible && (
        <div
          role="tooltip"
          className={`absolute right-0 top-full mt-2 z-20 w-80 max-h-[70vh] overflow-y-auto rounded-xl border p-3 shadow-xl text-left ${
            dark
              ? 'border-amber-500/30 bg-amber-950/90 backdrop-blur-sm'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-lg bg-amber-400 text-white flex items-center justify-center shrink-0">
              <WIcon name="info" className="w-3.5 h-3.5" strokeWidth={2.4} />
            </div>
            <span className={`text-sm font-bold ${dark ? 'text-amber-300' : 'text-amber-800'}`}>
              Preparo para a coleta
            </span>
          </div>

          {/* Jejum em bloco próprio: é o único item calculado a partir do horário
              desta coleta, e o único com uma ação e um prazo. O card já mostra a
              data/hora ao lado, então não repetimos "Coleta amanhã às 08:00". */}
          <div
            className={`rounded-lg p-2.5 mb-2.5 ${dark ? 'bg-amber-500/10' : 'bg-amber-100/60'}`}
          >
            <div className="flex items-center gap-1.5">
              <WIcon
                name="utensils-crossed"
                className={`w-3 h-3 shrink-0 ${dark ? 'text-amber-400' : 'text-amber-600'}`}
                strokeWidth={2.4}
              />
              <span
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  dark ? 'text-amber-400' : 'text-amber-600'
                }`}
              >
                Jejum de {JEJUM_LABEL}
              </span>
            </div>
            <p className={`text-sm font-bold mt-1 ${dark ? 'text-amber-100' : 'text-amber-900'}`}>
              Última refeição até {jejum.limite}
            </p>
            <p className={`text-xs mt-1 leading-snug ${dark ? 'text-amber-200/80' : 'text-amber-700'}`}>
              Ideal {jejum.janelaIdeal}. Antes de {jejum.piso} o jejum passa de {JEJUM_MAX_H} horas
              e pode alterar o resultado.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {REGRAS_GERAIS.map((regra) => (
              <li key={regra.id} className="flex gap-2">
                <WIcon
                  name={regra.icon}
                  className={`w-3.5 h-3.5 shrink-0 mt-px ${dark ? 'text-amber-400' : 'text-amber-500'}`}
                  strokeWidth={2.2}
                />
                <p className={`text-xs leading-snug ${dark ? 'text-amber-200/90' : 'text-amber-700'}`}>
                  <span className={`font-bold ${dark ? 'text-amber-100' : 'text-amber-800'}`}>
                    {regra.titulo}:
                  </span>{' '}
                  {regra.texto}
                </p>
              </li>
            ))}
          </ul>

          <p
            className={`text-[10px] leading-snug mt-2.5 pt-2 border-t ${
              dark ? 'border-amber-500/20 text-amber-200/60' : 'border-amber-200 text-amber-600/80'
            }`}
          >
            {RESSALVA_PREPARO}
          </p>
        </div>
      )}
    </div>
  )
}
