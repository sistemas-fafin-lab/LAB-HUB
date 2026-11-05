import { useCallback, useRef, useState } from 'react'
import { Ico, useDismiss } from '../portal'
import { JEJUM_LABEL, JEJUM_MAX_H, REGRAS_GERAIS, RESSALVA_PREPARO, calcularJejum } from '../../lib/preparo'

// Os textos de preparo vêm todos de lib/preparo e não mudam com o visual.

/**
 * Orientações de preparo. Com `dataHora` (ISO da coleta), mostra também o jejum
 * calculado; sem ela (ainda sem horário escolhido), só a duração.
 *
 * Fala no futuro ("última refeição até…"): quem chama filtra por
 * preparoAplicavel() quando há uma coleta.
 */
export function ConteudoPreparo({ dataHora }: { dataHora?: string }) {
  const jejum = dataHora ? calcularJejum(dataHora) : null
  return (
    <>
      {/* Jejum em bloco próprio: é o único item calculado a partir do horário
          da coleta, e o único com uma ação e um prazo. */}
      <div className="rounded-[12px] bg-subtle p-3 mb-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Ico name="utensils-crossed" size={14} />
          <span>Jejum de {JEJUM_LABEL}</span>
        </div>
        {jejum && (
          <>
            <p className="text-[14px] font-semibold mt-1.5 tabular-nums">Última refeição até {jejum.limite}</p>
            <p className="text-[12px] text-muted mt-1 tabular-nums">
              Ideal {jejum.janelaIdeal}. Antes de {jejum.piso} o jejum passa de {JEJUM_MAX_H} horas e pode alterar o resultado.
            </p>
          </>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {REGRAS_GERAIS.map((regra) => (
          <li key={regra.id} className="flex gap-2.5">
            <Ico name={regra.icon} size={16} className="mt-px text-muted" />
            <p className="text-[13px] leading-snug">
              <span className="font-semibold">{regra.titulo}:</span> {regra.texto}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted leading-snug mt-3 pt-3 border-t border-line">{RESSALVA_PREPARO}</p>
    </>
  )
}

/**
 * Preparo na linha da coleta: aparece ao passar o mouse ou clicar. O clique fixa
 * o balão, que fecha com clique fora ou Esc.
 */
export function PreparoPopover({ dataHora }: { dataHora: string }) {
  const [fixado, setFixado] = useState(false)
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visivel = fixado || hover

  const fechar = useCallback(() => {
    setFixado(false)
    setHover(false)
  }, [])
  useDismiss(visivel, fechar, ref)

  return (
    <div ref={ref} className="relative shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setFixado((f) => !f)}
        aria-label="Preparo para a coleta"
        aria-expanded={visivel}
        className="h-11 w-11 lg:h-9 lg:w-9 rounded-[12px] inline-flex items-center justify-center bg-subtle text-ink"
      >
        <Ico name="clipboard-list" size={18} />
      </button>
      {visivel && (
        <div
          className="absolute right-0 top-full mt-2 z-20 w-[min(320px,calc(100vw-48px))] max-h-[70vh] overflow-y-auto rounded-[16px] border border-line bg-card p-4 shadow-float text-left"
        >
          <div className="text-[14px] font-semibold mb-2.5">Preparo para a coleta</div>
          <ConteudoPreparo dataHora={dataHora} />
        </div>
      )}
    </div>
  )
}
