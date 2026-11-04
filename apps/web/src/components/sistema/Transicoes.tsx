import { Node } from '../portal'
import { Logo } from '../shell/Logo'

// ---------------------------------------------------------------------------
// Splash de abertura: cobre a tela enquanto a sessão é restaurada, no lugar de
// um "Carregando…" solto. Peça `Splash` do shell do protótipo.
// ---------------------------------------------------------------------------
export function Splash() {
  return (
    <div
      role="status"
      aria-label="Carregando o Lab Hub"
      className="fixed inset-0 z-[90] bg-brand flex flex-col items-center justify-center gap-8 lh-fade lh-noprint"
    >
      <Logo dark className="h-[40px]" />
      <Node loading onBrand size={40} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tela de transição: cobre a tela com o nó animado e a frase da operação em
// curso (ver lib/transicao). Peça `Interstitial` do protótipo.
// ---------------------------------------------------------------------------
export function TelaDeTransicao({ texto }: { texto: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={texto}
      className="fixed inset-0 z-[85] bg-page text-ink flex flex-col items-center justify-center gap-5 lh-fade lh-noprint"
    >
      <Node loading size={56} />
      <div className="font-display font-medium text-[22px] tracking-[-0.02em] text-center px-6">
        {texto}
        <span className="lh-dot" aria-hidden="true" />
      </div>
    </div>
  )
}
