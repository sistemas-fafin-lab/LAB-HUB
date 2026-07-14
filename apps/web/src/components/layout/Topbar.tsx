import { useState } from 'react'
import { WIcon } from '../primitives/WIcon'
import { MOSTRAR_NOTIFICACOES, MOSTRAR_DEPENDENTES } from '../../lib/flags'

export type AppRoute =
  | 'home'
  | 'results'
  | 'exam'
  | 'laudo'
  | 'schedule'
  | 'trends'
  | 'documents'
  | 'billing'
  | 'settings'
  | 'profile'

// Gradiente fixo do avatar enquanto não há foto.
const AVATAR_GRADIENT = 'from-blue-500 to-indigo-600'

// Mock de dependentes (D2 adiado) — preservado para o seletor, exibido apenas
// quando MOSTRAR_DEPENDENTES estiver ligado. Não há backend de dependentes.
export interface Dependent {
  id: string
  name: string
  relation: string
  initials: string
  color: string
}

const DEPENDENTS: Dependent[] = [
  { id: 'p1', name: 'João Madeiro',   relation: 'Você',   initials: 'JM', color: 'from-blue-500 to-indigo-600' },
  { id: 'p2', name: 'Marina Madeiro', relation: 'Esposa', initials: 'MM', color: 'from-rose-500 to-pink-600' },
  { id: 'p3', name: 'Tomás Madeiro',  relation: 'Filho',  initials: 'TM', color: 'from-emerald-500 to-teal-600' },
]

interface TopbarProps {
  nome: string
  iniciais: string
  dark: boolean
  onToggleDark: () => void
}

export function Topbar({ nome, iniciais, dark, onToggleDark }: TopbarProps) {
  const primeiroNome = nome.split(' ')[0] ?? ''

  // Estado local do seletor de dependentes (mock, só ativo com a flag).
  const [depOpen, setDepOpen] = useState(false)
  const [depSel, setDepSel] = useState<Dependent>(DEPENDENTS[0]!)

  return (
    <header
      className={`sticky top-0 z-40 border-b ${
        dark ? 'bg-gray-900/85 border-gray-800' : 'bg-white/85 border-gray-100'
      } backdrop-blur-md`}
    >
      <div className="px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-500/25">
            L
          </div>
          <div className="leading-tight">
            <div className={`font-black text-[15px] tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
              Lab Hub<span className="text-blue-500">.</span>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500/80 -mt-0.5">
              portal do paciente
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xl relative">
          <div
            className={`flex items-center gap-2 ${
              dark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-slate-50 border-gray-100 text-gray-500'
            } border rounded-xl px-3 h-10`}
          >
            <WIcon name="search" className="w-4 h-4" strokeWidth={2.2} />
            <input
              placeholder="Buscar exames, médicos, marcadores…"
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-gray-400"
            />
            <kbd
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                dark ? 'bg-gray-700 text-gray-400' : 'bg-white border border-gray-200 text-gray-400'
              }`}
            >
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Dark mode toggle */}
          <button
            onClick={onToggleDark}
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              dark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-50 text-gray-600 hover:bg-slate-100'
            } transition active:scale-95`}
          >
            <WIcon name={dark ? 'sun' : 'moon'} className="w-4 h-4" strokeWidth={2.2} />
          </button>

          {/* Notifications — oculto por flag até haver backend de notificações */}
          {MOSTRAR_NOTIFICACOES && (
            <button
              className={`relative h-10 w-10 rounded-xl flex items-center justify-center ${
                dark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-50 text-gray-600 hover:bg-slate-100'
              } transition active:scale-95`}
            >
              <WIcon name="bell" className="w-4 h-4" strokeWidth={2.2} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
            </button>
          )}

          {MOSTRAR_DEPENDENTES ? (
            /* Seletor de dependentes (mock, D2 adiado) */
            <div className="relative">
              <button
                onClick={() => setDepOpen((o) => !o)}
                className={`flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl border ${
                  dark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700' : 'border-gray-100 bg-white hover:bg-slate-50'
                } transition active:scale-[0.98]`}
              >
                <div
                  className={`h-8 w-8 rounded-lg bg-gradient-to-br ${depSel.color} text-white text-xs font-bold flex items-center justify-center`}
                >
                  {depSel.initials}
                </div>
                <div className="text-left leading-tight pr-1">
                  <div className={`text-[13px] font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
                    {depSel.name.split(' ')[0]}
                  </div>
                  <div className="text-[10px] text-gray-400">{depSel.relation}</div>
                </div>
                <WIcon name="chevron-down" className="w-3.5 h-3.5 text-gray-400" strokeWidth={2.4} />
              </button>

              {depOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setDepOpen(false)} />
                  <div
                    className={`absolute right-0 top-12 w-72 rounded-2xl border shadow-xl z-40 p-2 ${
                      dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
                    }`}
                  >
                    <div className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Perfil ativo
                    </div>
                    {DEPENDENTS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { setDepSel(d); setDepOpen(false) }}
                        className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition ${
                          depSel.id === d.id
                            ? dark ? 'bg-blue-500/10' : 'bg-blue-50'
                            : dark ? 'hover:bg-gray-800' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`h-9 w-9 rounded-lg bg-gradient-to-br ${d.color} text-white text-xs font-bold flex items-center justify-center`}
                        >
                          {d.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-800'}`}>
                            {d.name}
                          </div>
                          <div className="text-[11px] text-gray-400">{d.relation}</div>
                        </div>
                        {depSel.id === d.id && (
                          <WIcon name="check" className="w-4 h-4 text-blue-600" strokeWidth={2.6} />
                        )}
                      </button>
                    ))}
                    <div className={`mt-1 pt-1 border-t ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
                      <button
                        className={`w-full flex items-center gap-2 p-2 rounded-xl text-sm font-medium ${
                          dark ? 'text-gray-300 hover:bg-gray-800' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <WIcon name="user-plus" className="w-4 h-4" strokeWidth={2.2} />
                        Adicionar dependente
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Paciente autenticado (real) */
            <div
              className={`flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl border ${
                dark ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'
              }`}
            >
              <div
                className={`h-8 w-8 rounded-lg bg-gradient-to-br ${AVATAR_GRADIENT} text-white text-xs font-bold flex items-center justify-center`}
              >
                {iniciais || '—'}
              </div>
              <div className="text-left leading-tight pr-1">
                <div className={`text-[13px] font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
                  {primeiroNome || 'Paciente'}
                </div>
                <div className="text-[10px] text-gray-400">Titular</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
