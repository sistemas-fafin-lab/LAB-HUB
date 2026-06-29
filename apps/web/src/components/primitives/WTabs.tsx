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
            className={`px-3.5 h-8 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
              active
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                : dark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none ${
                  active
                    ? 'bg-white/20 text-white'
                    : dark
                      ? 'bg-gray-800 text-gray-400'
                      : 'bg-slate-100 text-slate-500'
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
