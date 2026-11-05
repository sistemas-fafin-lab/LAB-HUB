import { useEffect, useRef, useState } from 'react'
import * as DS from '../../ds'
import { aoAvisar } from '../../lib/avisos'
import type { Aviso } from '../../lib/avisos'

interface AvisoNaTela extends Aviso {
  id: number
}

/** Mostra os avisos de `avisar()` (até 3 de cada vez), no rodapé da tela. */
export function Avisos() {
  const [itens, setItens] = useState<AvisoNaTela[]>([])
  const proximoId = useRef(0)

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const desinscreve = aoAvisar((aviso) => {
      const id = ++proximoId.current
      setItens((x) => [...x.slice(-2), { ...aviso, id }])
      const t = setTimeout(() => {
        timers.delete(t)
        setItens((x) => x.filter((y) => y.id !== id))
      }, aviso.duracao ?? 3600)
      timers.add(t)
    })
    return () => {
      desinscreve()
      for (const t of timers) clearTimeout(t)
    }
  }, [])

  const fecha = (id: number) => setItens((x) => x.filter((y) => y.id !== id))

  return (
    <div className="lh-toasts fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {itens.map((t) => (
        <div key={t.id} className="pointer-events-auto lh-fade">
          <DS.Toast
            tone={t.tone ?? 'success'}
            {...(t.title !== undefined ? { title: t.title } : {})}
            {...(t.message !== undefined ? { message: t.message } : {})}
            onClose={() => fecha(t.id)}
            style={{
              minWidth: 0,
              width: 'min(440px, calc(100vw - 32px))',
              background: t.tone === 'alert' ? 'var(--lh-toast-alerta)' : 'var(--lh-toast)',
              border: '1px solid var(--lh-toast-borda)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
