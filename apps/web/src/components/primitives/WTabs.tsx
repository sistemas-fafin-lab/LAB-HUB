interface WTab<T extends string> {
  id: T
  label: string
  /** Contador opcional exibido como badge (ex.: nº de coletas). */
  count?: number
}

interface WTabsProps<T extends string> {
  items: readonly WTab<T>[]
  value: T
  onChange: (id: T) => void
  dark: boolean
}

// Segmented control reutilizável — mesmo visual das abas de DocumentsPage.
export function WTabs<T extends string>({ items, value, onChange, dark }: WTabsProps<T>) {
  return (
    <div
      className={`rounded-2xl border ${
        dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
      } p-1.5 shadow-sm inline-flex gap-1`}
    >
      {items.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative px-3.5 h-8 rounded-lg text-xs font-semibold transition inline-flex items-center justify-center ${
              active
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                : dark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            {/* Badge estilo notificação no canto superior direito. */}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ${
                  dark ? 'ring-gray-900' : 'ring-white'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
