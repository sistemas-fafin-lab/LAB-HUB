import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../portal'

/**
 * Célula de "Referência" de um marcador.
 *
 * Referência de uma linha ("0,70 a 1,30 mg/dL") aparece inteira. As tabelas
 * multilinha da AOL (faixas por idade/sexo) ocupariam a altura de várias
 * linhas da lista, então viram UMA linha truncada (quebras trocadas por " · ")
 * e a tabela completa abre por cima.
 *
 * Abre no hover E no clique. Só no hover, a tabela completa era inalcançável
 * em telefone e tablet, justamente onde a linha truncada corta mais, e também
 * por teclado. O clique fixa a tabela; Esc e clique fora fecham.
 */
export function Referencia({ texto }: { texto: string }) {
  const [sobMouse, setSobMouse] = useState(false)
  const [fixa, setFixa] = useState(false)
  const aberta = sobMouse || fixa
  const raiz = useRef<HTMLDivElement>(null)
  const fechar = useCallback(() => {
    setSobMouse(false)
    setFixa(false)
  }, [])
  useDismiss(aberta, fechar, raiz)

  if (!texto.includes('\n')) {
    return <div className="text-[13px] text-muted tabular-nums whitespace-pre-line">{texto}</div>
  }

  return (
    <div
      ref={raiz}
      className="relative min-w-0"
      onMouseEnter={() => setSobMouse(true)}
      onMouseLeave={() => setSobMouse(false)}
    >
      <button
        type="button"
        aria-expanded={aberta}
        onClick={(e) => {
          // A linha inteira é clicável em algumas telas; abrir a referência não
          // deve navegar junto.
          e.stopPropagation()
          setFixa((v) => !v)
        }}
        className="block w-full text-left text-[13px] text-muted tabular-nums truncate cursor-help underline decoration-dotted decoration-line-strong underline-offset-2"
      >
        {texto.replace(/\n+/g, ' · ')}
      </button>
      {aberta && (
        // pt-1 no invólucro (e não margem no cartão) mantém a área de hover
        // contínua: dá para levar o mouse até o balão sem ele sumir.
        <div className="absolute top-full left-0 z-20 pt-1 w-max">
          <div className="max-w-[min(24rem,calc(100vw-72px))] rounded-[12px] border border-line bg-card text-ink p-3 text-[12px] tabular-nums whitespace-pre-line shadow-float">
            {texto}
          </div>
        </div>
      )}
    </div>
  )
}
