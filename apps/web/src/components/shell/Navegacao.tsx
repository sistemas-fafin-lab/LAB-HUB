import { useEffect, useRef } from 'react'
import { focaveis } from '../../ds/teclado'
import { useContagemResultados } from '../../lib/useResultados'
import { Ico, IconBtn } from '../portal'
import { Logo } from './Logo'
import { secoesVisiveis } from './menu'
import type { ItemMenu } from './menu'

/**
 * Lista de navegação (barra lateral e gaveta). Links de verdade: o router
 * intercepta o clique, e Ctrl/⌘+clique abre a tela noutra aba.
 */
export function NavLista({ ativo }: { ativo: ItemMenu | null }) {
  // Total real de exames (FlowLab + LIS), como no menu antigo; null enquanto
  // nenhuma busca concluiu — aí o contador não aparece.
  const contagemResultados = useContagemResultados()
  return (
    <nav className="flex flex-col gap-5" aria-label="Navegação principal">
      {secoesVisiveis().map((s) => (
        <div key={s.title}>
          <div className="lh-ov px-3 pt-2 pb-2">{s.title}</div>
          <div className="flex flex-col gap-0.5">
            {s.items.map((it) => {
              const on = ativo === it.id
              const n = it.id === 'results' ? contagemResultados : null
              return (
                <a
                  key={it.id}
                  href={it.href}
                  className={'lh-nav' + (on ? ' is-active' : '')}
                  aria-current={on ? 'page' : undefined}
                >
                  <Ico name={it.icon} size={18} />
                  <span className="flex-1 text-left">
                    {it.label}
                    {n !== null && (
                      <>
                        <span className="lh-supc" aria-hidden="true">
                          {n}
                        </span>
                        <span className="sr-only">, {n} exames</span>
                      </>
                    )}
                    {on && <span className="lh-dot" />}
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

interface GavetaProps {
  aberta: boolean
  onFechar: () => void
  ativo: ItemMenu | null
  dark: boolean
}

/** Navegação em gaveta lateral abaixo de 1024 px. Esc e o fundo fecham. */
export function Gaveta({ aberta, onFechar, ativo, dark }: GavetaProps) {
  const painelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberta) return
    // Foco entra na gaveta ao abrir e volta ao botão do menu ao fechar.
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const painel = painelRef.current
    if (painel) focaveis(painel)[0]?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFechar()
        return
      }
      if (e.key !== 'Tab' || !painel) return
      // Tab circula só dentro da gaveta (aria-modal promete isso).
      const itens = focaveis(painel)
      const primeiro = itens[0]
      const ultimo = itens[itens.length - 1]
      if (!primeiro || !ultimo) return
      const at = document.activeElement
      const fora = !(at instanceof Node) || !painel.contains(at)
      if (e.shiftKey && (fora || at === primeiro)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (fora || at === ultimo)) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('keydown', tecla)
      anterior?.focus()
    }
  }, [aberta, onFechar])

  if (!aberta) return null
  return (
    <div className="lh-noprint fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 lh-fade" style={{ background: 'var(--lh-scrim)' }} onClick={onFechar} />
      <div
        ref={painelRef}
        className="absolute left-0 top-0 bottom-0 w-[288px] max-w-[85vw] bg-card border-r border-line p-3 overflow-y-auto"
      >
        <div className="flex items-center justify-between px-2 h-12 mb-2">
          <Logo dark={dark} className="h-[20px]" />
          <IconBtn icon="x" label="Fechar menu" onClick={onFechar} />
        </div>
        <NavLista ativo={ativo} />
      </div>
    </div>
  )
}
