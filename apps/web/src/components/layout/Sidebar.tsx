import { WIcon } from '../primitives/WIcon'
import type { AppRoute } from './Topbar'

interface SidebarProps {
  route: AppRoute
  onNav: (route: AppRoute) => void
  dark: boolean
}

interface NavItem {
  id: AppRoute
  label: string
  icon: string
  badge?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    title: 'Operações',
    items: [
      { id: 'home',     label: 'Visão geral',    icon: 'layout-dashboard' },
      { id: 'results',  label: 'Resultados',     icon: 'file-text', badge: '12' },
      { id: 'schedule', label: 'Agendar coleta', icon: 'calendar-plus' },
      { id: 'trends',   label: 'Tendências',     icon: 'trending-up' },
    ],
  },
  {
    title: 'Conta',
    items: [
      { id: 'profile',   label: 'Perfil',          icon: 'user-round' },
      { id: 'documents', label: 'Documentos',      icon: 'folder' },
      { id: 'billing',   label: 'Faturamento',     icon: 'receipt' },
      { id: 'settings',  label: 'Configurações',   icon: 'settings' },
    ],
  },
]

export function Sidebar({ route, onNav, dark }: SidebarProps) {
  return (
    <aside
      className={`w-60 shrink-0 border-r ${
        dark ? 'bg-gray-900/60 border-gray-800' : 'bg-white/60 border-gray-100'
      } backdrop-blur-sm sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto`}
    >
      <nav className="p-3 flex flex-col gap-5">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {s.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {s.items.map((it) => {
                const active = route === it.id
                return (
                  <button
                    key={it.id}
                    onClick={() => onNav(it.id)}
                    className={`group flex items-center gap-3 px-3 h-9 rounded-xl text-sm font-medium transition active:scale-[0.98] ${
                      active
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                        : dark
                        ? 'text-gray-300 hover:bg-gray-800'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <WIcon name={it.icon} className="w-4 h-4" strokeWidth={active ? 2.4 : 2} />
                    <span className="flex-1 text-left">{it.label}</span>
                    {it.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {it.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Lab Hub Plus upsell card */}
        <div className="mt-2 mx-1 p-3 rounded-2xl bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800 text-white relative overflow-hidden">
          <div className="absolute -bottom-4 -right-4 opacity-15">
            <WIcon name="sparkles" className="w-20 h-20" strokeWidth={1.4} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-1">Lab Hub Plus</div>
          <div className="text-sm font-semibold leading-snug mb-2">
            Acompanhamento contínuo dos seus marcadores
          </div>
          <button className="text-[11px] font-bold bg-white text-blue-700 rounded-lg px-2.5 py-1 inline-flex items-center gap-1">
            Conhecer <WIcon name="arrow-right" className="w-3 h-3" strokeWidth={2.6} />
          </button>
        </div>
      </nav>
    </aside>
  )
}
