import { WIcon } from '../components/primitives/WIcon'
import { WStatus } from '../components/primitives/WStatus'
import { Sparkline } from '../components/primitives/Sparkline'
import { Referencia } from '../components/shared/Referencia'
import { LaudoTexto } from '../components/shared/LaudoTexto'
import type { Exam, ExamPanel } from '../components/shared/WebHero'
import { api } from '../lib/api'
import { track } from '../lib/analytics'

interface ExamDetailPageProps {
  exam: Exam
  onBack: () => void
  dark: boolean
  onViewLaudo: () => void
}

const PLACEHOLDER = '—'

// O resultado do FlowLab não tem médico/CRM e chega como '—'. Melhor omitir o
// trecho inteiro do que imprimir "— (—)" ao lado da data.
function preenchido(valor: string | undefined): boolean {
  return Boolean(valor) && valor !== PLACEHOLDER
}

const CELULA = 'grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 px-4'

function PanelRow({ p, dark, last }: { p: ExamPanel; dark: boolean; last: boolean }) {
  return (
    <div
      className={`${CELULA} items-center py-3 ${
        last ? '' : `border-b ${dark ? 'border-gray-700' : 'border-gray-200'}`
      }`}
    >
      <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{p.name}</div>
      <div
        className={`text-sm font-bold tabular-nums ${
          p.ok ? (dark ? 'text-white' : 'text-slate-900') : 'text-amber-600'
        }`}
      >
        {p.value} <span className="text-[11px] font-medium text-gray-400">{p.unit}</span>
      </div>
      <Referencia texto={p.ref} dark={dark} />
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${p.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
        <span
          className={`text-xs font-medium ${
            p.ok ? (dark ? 'text-emerald-400' : 'text-emerald-700') : 'text-amber-700'
          }`}
        >
          {p.ok ? 'Normal' : 'Atenção'}
        </span>
      </div>
      <Sparkline data={p.trend} ok={p.ok} width={90} height={26} />
    </div>
  )
}

// Laudo descritivo (citologia, biópsia, patologia): o resultado é UM marcador
// "Laudo" com o texto inteiro. Tabela de marcadores não faz sentido para ele —
// vira um bloco de texto corrido.
function laudoDescritivo(exam: Exam): string | null {
  if (exam.groups?.length) return null
  const unico = exam.panels.length === 1 ? exam.panels[0] : null
  return unico?.name === 'Laudo' ? unico.value : null
}

export function ExamDetailPage({ exam, onBack, dark, onViewLaudo }: ExamDetailPageProps) {
  const laudoTexto = laudoDescritivo(exam)

  const handleDownload = async () => {
    // Só a origem do clique — `exam.id`/nome do exame são dados do paciente.
    track('laudo_download', { origem: 'exame' })
    try {
      const { url } = await api.declaracao(exam.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      /* sem declaração disponível */
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 text-sm font-medium mb-4 ${
          dark ? 'text-gray-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />Voltar para resultados
      </button>

      {/* Header card */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-6 shadow-sm mb-5`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <WStatus status={exam.status} />
              <span className="text-xs text-gray-400">#{exam.id.toUpperCase()}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-400">{exam.category}</span>
            </div>
            <h1
              className={`text-2xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
            >
              {exam.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {[
                exam.fullDate,
                preenchido(exam.laboratorio) ? exam.laboratorio : exam.unit,
                preenchido(exam.doctor)
                  ? `${exam.doctor}${preenchido(exam.crm) ? ` (${exam.crm})` : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onViewLaudo}
              className="bg-blue-50 text-blue-600 rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-blue-100"
            >
              <WIcon name="file-text" className="w-4 h-4" strokeWidth={2.2} />Ver laudo
            </button>
            {exam.declaracaoUrl && (
              <button
                onClick={() => void handleDownload()}
                className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700"
              >
                <WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        {exam.summary && (
          <div
            className={`rounded-xl border ${
              dark ? 'border-blue-500/20 bg-blue-500/5' : 'border-blue-100 bg-blue-50/60'
            } p-4 flex gap-3`}
          >
            <div className="h-8 w-8 rounded-lg bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <WIcon name="sparkles" className="w-4 h-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Resumo</div>
              <p className={`text-sm leading-snug ${dark ? 'text-gray-200' : 'text-slate-700'}`}>{exam.summary}</p>
            </div>
          </div>
        )}

        {/* Ficha técnica — só o laudo dos LIS traz material e método. */}
        {(preenchido(exam.material) || preenchido(exam.metodo)) && (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-4 px-1">
            {preenchido(exam.material) && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Material</dt>
                <dd className={`text-sm ${dark ? 'text-gray-200' : 'text-slate-700'}`}>{exam.material}</dd>
              </div>
            )}
            {preenchido(exam.metodo) && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Método</dt>
                <dd className={`text-sm ${dark ? 'text-gray-200' : 'text-slate-700'}`}>{exam.metodo}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Laudo descritivo — texto corrido no lugar da tabela de marcadores */}
      {laudoTexto && (
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-6 shadow-sm`}
        >
          <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-800'}`}>Laudo</h3>
          <LaudoTexto texto={laudoTexto} dark={dark} />
        </div>
      )}

      {/* Panels table */}
      {!laudoTexto && exam.panels.length > 0 && (
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-5 shadow-sm`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Marcadores</h3>
            <span className="text-xs text-gray-400">{exam.panels.length} marcadores</span>
          </div>

          {/* Column headers */}
          <div
            className={`${CELULA} py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b ${
              dark ? 'border-gray-800' : 'border-gray-100'
            }`}
          >
            <span>Marcador</span>
            <span>Resultado</span>
            <span>Referência</span>
            <span>Status</span>
            <span>Tendência</span>
          </div>

          {/* Laudo compilado por pedido traz um grupo por exame (e o hemograma,
              um por série) — sem isso são dezenas de marcadores numa lista só.
              Exame avulso não tem grupos e cai na lista simples. */}
          {exam.groups?.length
            ? exam.groups.map((g, gi) => (
                <div key={`${g.name}-${gi}`}>
                  <div className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-blue-600">
                    {g.name}
                  </div>
                  {/* key composta com o índice: laudos de OS multiexame repetem
                      nomes genéricos ("Resultado", "Conclusão"). */}
                  {g.panels.map((p, i) => (
                    <PanelRow key={`${p.name}-${i}`} p={p} dark={dark} last={i === g.panels.length - 1} />
                  ))}
                </div>
              ))
            : exam.panels.map((p, i) => (
                <PanelRow key={`${p.name}-${i}`} p={p} dark={dark} last={i === exam.panels.length - 1} />
              ))}
        </div>
      )}
    </div>
  )
}
