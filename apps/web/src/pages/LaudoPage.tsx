import { WIcon } from '../components/primitives/WIcon'
import type { Exam } from '../components/shared/WebHero'

interface LaudoPageProps {
  exam: Exam
  onBack: () => void
  dark: boolean
}

export function LaudoPage({ exam, onBack }: LaudoPageProps) {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />Voltar
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="text-xs font-medium px-3 h-9 rounded-lg border inline-flex items-center gap-1.5 border-gray-200 text-gray-600 bg-white"
          >
            <WIcon name="printer" className="w-4 h-4" strokeWidth={2.2} />Imprimir
          </button>
          <button className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-50 text-blue-700 inline-flex items-center gap-1.5">
            <WIcon name="send" className="w-4 h-4" strokeWidth={2.2} />Enviar ao médico
          </button>
          <button className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25">
            <WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF
          </button>
        </div>
      </div>

      {/* Printable document */}
      <div className="bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-200 overflow-hidden">

        {/* Document header */}
        <div className="px-10 pt-10 pb-6 border-b border-gray-200 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/25">
              L
            </div>
            <div>
              <div className="font-black text-xl tracking-tight text-slate-900">
                Lab Hub<span className="text-blue-500">.</span>
              </div>
              <div className="text-[11px] text-gray-500">Diagnósticos clínicos · CNPJ 12.345.678/0001-90</div>
              <div className="text-[11px] text-gray-500">SGAS 915, Bloco B · Asa Sul · Brasília · DF</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Laudo nº</div>
            <div className="text-base font-bold tabular-nums text-slate-900">#{exam.id.toUpperCase()}</div>
            <div className="text-[10px] text-gray-500 mt-2 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Assinado digitalmente
            </div>
          </div>
        </div>

        {/* Patient / doctor meta */}
        <div className="px-10 py-6 grid grid-cols-2 gap-x-10 gap-y-4 border-b border-gray-100">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Paciente</div>
            <div className="text-base font-semibold text-slate-900">João Madeiro</div>
            <div className="text-xs text-gray-600">CPF •••.•••.123-45 · Nasc. 12/03/1989 · Sexo M</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Médico solicitante</div>
            <div className="text-base font-semibold text-slate-900">{exam.doctor}</div>
            <div className="text-xs text-gray-600">{exam.crm}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Coleta</div>
            <div className="text-sm font-medium text-slate-900">{exam.fullDate} · 07:42</div>
            <div className="text-xs text-gray-600">{exam.unit}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Liberação</div>
            <div className="text-sm font-medium text-slate-900">{exam.fullDate} · 14:08</div>
            <div className="text-xs text-gray-600">Material: Sangue total</div>
          </div>
        </div>

        {/* Exam title */}
        <div className="px-10 pt-6">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">{exam.category}</div>
          <h1
            className="text-2xl font-bold text-slate-900 mb-1"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            {exam.name}
          </h1>
          <p className="text-sm text-gray-600">
            Análise quantitativa dos principais marcadores. Valores de referência conforme diretrizes da SBAC.
          </p>
        </div>

        {/* Panels table */}
        <div className="px-10 py-6">
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b-2 border-slate-300">
            <span>Marcador</span>
            <span>Resultado</span>
            <span>Referência</span>
            <span>Status</span>
          </div>
          {exam.panels.map((p, i) => (
            <div
              key={p.name}
              className={`grid grid-cols-[2fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 ${
                i !== exam.panels.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-900">{p.name}</div>
              <div className={`text-sm font-bold tabular-nums ${p.ok ? 'text-slate-900' : 'text-amber-700'}`}>
                {p.value}{' '}
                <span className="text-[11px] font-medium text-gray-500">{p.unit}</span>
              </div>
              <div className="text-xs text-gray-600 tabular-nums">{p.ref}</div>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded ${
                  p.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {p.ok ? 'NORMAL' : 'ATENÇÃO'}
              </span>
            </div>
          ))}
        </div>

        {/* Clinical observations */}
        {exam.summary && (
          <div className="px-10 pb-2">
            <div className="rounded-xl border border-gray-200 bg-slate-50 p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Observações clínicas</div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {exam.summary} Recomenda-se correlação com quadro clínico. Em caso de dúvida, consulte o médico responsável.
              </p>
            </div>
          </div>
        )}

        {/* Signature + QR */}
        <div className="px-10 py-8 border-t border-gray-100 grid grid-cols-2 gap-10 items-end">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Responsável técnico</div>
            <div className="font-mono text-[11px] text-slate-700 mb-3 italic">_assinado digitalmente_</div>
            <div className="border-t border-slate-300 pt-2">
              <div className="text-sm font-semibold text-slate-900">Dra. Helena Pacheco</div>
              <div className="text-[11px] text-gray-600">Bioquímica · CRBM/DF 4.821</div>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block bg-white border border-gray-200 rounded-lg p-3">
              <div className="h-20 w-20 grid grid-cols-8 grid-rows-8 gap-px">
                {Array.from({ length: 64 }).map((_, i) => (
                  <div key={i} className={(i * 7 + 3) % 5 < 2 ? 'bg-slate-900' : 'bg-white'} />
                ))}
              </div>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">Verifique em labhub.com.br/v</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-10 py-4 bg-slate-50 border-t border-gray-100 text-[10px] text-gray-500 flex items-center justify-between">
          <span>Lab Hub · labhub.com.br · 0800 123 4567</span>
          <span>Página 1 de 1 · Gerado em {exam.fullDate}</span>
        </div>
      </div>
    </div>
  )
}
