import { WIcon } from '../components/primitives/WIcon'

interface BillingPageProps {
  dark: boolean
}

type InvoiceStatus = 'paid' | 'refunded'

interface Invoice {
  id:     string
  date:   string
  desc:   string
  amount: string
  status: InvoiceStatus
}

interface CardInfo {
  brand:   string
  last:    string
  exp:     string
  primary: boolean
}

const INVOICES: Invoice[] = [
  { id: 'INV-2310', date: '15 Out 2025', desc: 'Hemograma + Perfil lipídico',     amount: 'R$ 312,00', status: 'paid'     },
  { id: 'INV-2287', date: '02 Out 2025', desc: 'Consulta Endocrinologia',          amount: 'R$ 480,00', status: 'paid'     },
  { id: 'INV-2241', date: '28 Set 2025', desc: 'Vitamina D · TSH · T4 livre',      amount: 'R$ 198,00', status: 'paid'     },
  { id: 'INV-2198', date: '04 Set 2025', desc: 'Glicemia + Colesterol total',      amount: 'R$ 142,00', status: 'refunded' },
]

const CARDS: CardInfo[] = [
  { brand: 'Visa',       last: '4821', exp: '08/29', primary: true  },
  { brand: 'Mastercard', last: '1192', exp: '11/27', primary: false },
]

export function BillingPage({ dark }: BillingPageProps) {
  const card = `rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm`

  return (
    <div>
      <div className="mb-5">
        <h1
          className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          Faturamento
        </h1>
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Plano, formas de pagamento e histórico de notas fiscais.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Left column */}
        <div className="col-span-12 lg:col-span-7">
          {/* Plan card */}
          <div
            className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg ${dark ? '' : 'shadow-blue-500/20'}`}
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 60%, #7c3aed 100%)' }}
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100 mb-2">Plano atual</div>
              <h2
                className="text-3xl font-black mb-1"
                style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
              >
                Lab Hub Care<span className="text-blue-200">.</span>
              </h2>
              <p className="text-blue-100 text-sm mb-5 max-w-md">
                Coletas em domicílio ilimitadas, prioridade nas unidades, descontos em consultas e laudos compartilháveis com seu time médico.
              </p>
              <div className="flex items-end gap-6 flex-wrap">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Mensalidade</div>
                  <div className="text-2xl font-bold tabular-nums">
                    R$ 89<span className="text-base font-medium text-blue-100">,90</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Próximo débito</div>
                  <div className="text-sm font-semibold">15 Mai 2026</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button className="bg-white/15 backdrop-blur text-white text-xs font-semibold h-9 px-3 rounded-lg hover:bg-white/25">
                    Mudar plano
                  </button>
                  <button className="bg-white text-blue-700 text-xs font-bold h-9 px-3 rounded-lg shadow-md">
                    Gerenciar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice list */}
          <div className={`${card} mt-5`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
                Histórico de cobranças
              </h3>
              <button className="text-xs font-semibold text-blue-600">Exportar CSV</button>
            </div>
            <div className="flex flex-col gap-1">
              {INVOICES.map((inv) => (
                <div
                  key={inv.id}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center px-3 py-2.5 rounded-xl ${dark ? 'hover:bg-gray-800/50' : 'hover:bg-slate-50'} transition`}
                >
                  <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <WIcon name="receipt" className="w-4 h-4" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-800'}`}>
                      {inv.desc}
                    </div>
                    <div className="text-[11px] text-gray-400">{inv.id} · {inv.date}</div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>
                    {inv.amount}
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {inv.status === 'paid' ? 'Pago' : 'Estornado'}
                  </span>
                  <button className="text-blue-600 text-xs font-semibold inline-flex items-center gap-1">
                    <WIcon name="download" className="w-3.5 h-3.5" strokeWidth={2.2} />
                    NFS-e
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">
          {/* Payment methods */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
                Forma de pagamento
              </h3>
              <button className="text-xs font-semibold text-blue-600">+ Adicionar</button>
            </div>
            <div className="flex flex-col gap-2">
              {CARDS.map((c) => (
                <div
                  key={c.last}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    c.primary
                      ? dark ? 'border-blue-500/40 bg-blue-500/5' : 'border-blue-200 bg-blue-50/50'
                      : dark ? 'border-gray-800' : 'border-gray-100'
                  }`}
                >
                  <div className="h-9 w-12 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-[10px] font-black tracking-wider">
                    {c.brand.slice(0, 4).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>
                      {c.brand} ···· {c.last}
                    </div>
                    <div className="text-[11px] text-gray-400">Validade {c.exp}</div>
                  </div>
                  {c.primary && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      Principal
                    </span>
                  )}
                </div>
              ))}
              {/* PIX */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
                <div className="h-9 w-12 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-black">
                  PIX
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Pagar via PIX</div>
                  <div className="text-[11px] text-gray-400">Aprovação imediata</div>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly summary */}
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-800'}`}>
              Resumo do mês
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Gasto até hoje</span>
                <span className={`text-sm font-bold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>
                  R$ 312,00
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Reembolsado pelo plano</span>
                <span className="text-sm font-bold tabular-nums text-emerald-600">− R$ 124,80</span>
              </div>
              <div className={`pt-3 border-t ${dark ? 'border-gray-800' : 'border-gray-100'} flex items-center justify-between`}>
                <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>
                  Custo líquido
                </span>
                <span className={`text-base font-black tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>
                  R$ 187,20
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
