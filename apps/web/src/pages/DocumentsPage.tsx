import { useState } from 'react'
import { WIcon } from '../components/primitives/WIcon'

interface DocumentsPageProps {
  dark: boolean
}

type DocKind = 'atestado' | 'receita' | 'pedido'
type DocTone = 'blue' | 'violet' | 'amber'
type TabId   = 'all' | DocKind

interface Doc {
  id: string
  kind: DocKind
  title: string
  sub: string
  size: string
  icon: string
  tone: DocTone
}

const DOCS: Doc[] = [
  { id: 'd1', kind: 'atestado', title: 'Atestado médico',                    sub: 'Dr. Carlos Silva · 14 Out 2025',    size: '248 KB', icon: 'file-check-2',   tone: 'blue'   },
  { id: 'd2', kind: 'receita',  title: 'Receita — Vitamina D 50.000UI',      sub: 'Dra. Renata Moura · 02 Out 2025',  size: '112 KB', icon: 'pill',            tone: 'violet' },
  { id: 'd3', kind: 'pedido',   title: 'Pedido de exames laboratoriais',     sub: 'Dr. Carlos Silva · 28 Set 2025',   size: '98 KB',  icon: 'clipboard-list',  tone: 'amber'  },
  { id: 'd4', kind: 'atestado', title: 'Atestado de comparecimento',         sub: 'Lab Hub · 15 Set 2025',            size: '76 KB',  icon: 'file-check-2',   tone: 'blue'   },
  { id: 'd5', kind: 'receita',  title: 'Receita — Sinvastatina 20mg',        sub: 'Dra. Renata Moura · 04 Set 2025',  size: '104 KB', icon: 'pill',            tone: 'violet' },
  { id: 'd6', kind: 'pedido',   title: 'Pedido de ressonância',              sub: 'Dr. Carlos Silva · 22 Ago 2025',   size: '126 KB', icon: 'clipboard-list',  tone: 'amber'  },
]

const TONE_CLASSES: Record<DocTone, string> = {
  blue:   'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  amber:  'bg-amber-100 text-amber-700',
}

const TABS: { id: TabId; l: string }[] = [
  { id: 'all',      l: 'Todos'     },
  { id: 'atestado', l: 'Atestados' },
  { id: 'receita',  l: 'Receitas'  },
  { id: 'pedido',   l: 'Pedidos'   },
]

export function DocumentsPage({ dark }: DocumentsPageProps) {
  const [tab, setTab] = useState<TabId>('all')

  const filtered = tab === 'all' ? DOCS : DOCS.filter((d) => d.kind === tab)

  return (
    <div>
      <div className="mb-5 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1
            className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            Documentos
          </h1>
          <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Atestados, receitas e pedidos médicos guardados num só lugar.
          </p>
        </div>
        <button className="bg-blue-600 text-white text-xs font-semibold h-9 px-3 rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25">
          <WIcon name="upload" className="w-4 h-4" strokeWidth={2.2} />
          Enviar documento
        </button>
      </div>

      <div className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-2 shadow-sm mb-4 inline-flex gap-1`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 h-8 rounded-lg text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : dark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((d) => (
          <div
            key={d.id}
            className={`rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-4 shadow-sm hover:shadow-md transition group`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${TONE_CLASSES[d.tone]}`}>
                <WIcon name={d.icon} className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-900'}`}>{d.title}</div>
                <div className="text-[11px] text-gray-400 truncate">{d.sub}</div>
              </div>
            </div>
            <div className={`aspect-[3/2] rounded-xl border-2 border-dashed flex items-center justify-center mb-3 ${dark ? 'border-gray-800 bg-gray-800/30' : 'border-gray-100 bg-slate-50'}`}>
              <WIcon name="file-text" className={`w-8 h-8 ${dark ? 'text-gray-600' : 'text-gray-300'}`} strokeWidth={1.6} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">PDF · {d.size}</span>
              <div className="flex items-center gap-1">
                <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${dark ? 'hover:bg-gray-800' : 'hover:bg-slate-100'}`}>
                  <WIcon name="eye"      className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.2} />
                </button>
                <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${dark ? 'hover:bg-gray-800' : 'hover:bg-slate-100'}`}>
                  <WIcon name="download" className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.2} />
                </button>
                <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${dark ? 'hover:bg-gray-800' : 'hover:bg-slate-100'}`}>
                  <WIcon name="send"     className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
