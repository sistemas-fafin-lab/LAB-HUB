export type AuthView = 'login' | 'cadastro'

interface AuthTabsProps {
  view: AuthView
  onChange: (view: AuthView) => void
}

const ABAS: { id: AuthView; rotulo: string }[] = [
  { id: 'login', rotulo: 'Entrar' },
  { id: 'cadastro', rotulo: 'Criar conta' },
]

// ---------------------------------------------------------------------------
// AuthTabs — segmentado Entrar / Criar conta. A pílula branca é um elemento
// absoluto que desliza, em vez de fundo em cada botão: assim a transição é uma
// só (transform) e não pisca na troca.
// ---------------------------------------------------------------------------
export function AuthTabs({ view, onChange }: AuthTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Entrar ou criar conta"
      className="relative grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-gray-900/50 rounded-xl mb-6 border border-slate-200/50 dark:border-gray-700"
    >
      {/* left-1 é obrigatório: sem ele, `left: auto` num filho absoluto de grid
          cai na borda do padding box e a pílula cola na esquerda. A largura
          fecha com a coluna do grid: (100% - 2×4px de padding - 4px de gap)/2. */}
      <div
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-6px)] rounded-lg bg-white dark:bg-gray-700 shadow-sm transition-transform duration-300"
        style={{ transform: view === 'login' ? 'translateX(0)' : 'translateX(calc(100% + 4px))' }}
      />
      {ABAS.map((aba) => (
        <button
          key={aba.id}
          type="button"
          role="tab"
          aria-selected={view === aba.id}
          onClick={() => onChange(aba.id)}
          className={`relative z-10 py-2 text-sm font-semibold transition ${
            view === aba.id
              ? 'text-blue-700 dark:text-white'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  )
}
