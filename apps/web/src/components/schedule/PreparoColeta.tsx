import { useEffect, useRef, useState } from 'react'
import { WIcon } from '../primitives/WIcon'

interface PreparoColetaProps {
  dark: boolean
}

// Orientações gerais de preparo para a coleta. Estático por enquanto — não há
// preparo por exame no backend; vale para qualquer coleta.
const PREPAROS = [
  'Mantenha 8h de jejum (água liberada)',
  'Leve documento com foto e a guia do convênio',
  'Evite atividade física intensa 24h antes',
]

// Ícone de atenção que revela o preparo/cuidados da coleta ao passar o mouse
// ou clicar. O clique fixa o popover (fecha ao clicar fora); o hover mostra
// enquanto o cursor estiver sobre o ícone ou o balão.
export function PreparoColeta({ dark }: PreparoColetaProps) {
  const [pinned, setPinned] = useState(false) // aberto por clique
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visible = pinned || hover

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
          className={`absolute right-0 top-full mt-2 z-20 w-72 rounded-xl border p-3 shadow-xl text-left ${
            dark ? 'border-amber-500/30 bg-amber-950/90 backdrop-blur-sm' : 'border-amber-200 bg-amber-50'
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
          <ul className="flex flex-col gap-1">
            {PREPAROS.map((p) => (
              <li
                key={p}
                className={`text-xs flex gap-1.5 ${dark ? 'text-amber-200/90' : 'text-amber-700'}`}
              >
                <span className="text-amber-500 leading-none">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
