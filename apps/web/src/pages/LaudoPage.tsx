import { WIcon } from '../components/primitives/WIcon'
import { Referencia } from '../components/shared/Referencia'
import { LaudoTexto } from '../components/shared/LaudoTexto'
import type { Exam, ExamPanel } from '../components/shared/WebHero'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { MOSTRAR_ENVIAR_AO_MEDICO, MOSTRAR_LAUDO_ASSINATURA_MOCK } from '../lib/flags'
import { usePaciente } from '../lib/usePaciente'
import { formatarCpf, formatarData } from '../lib/validators'

interface LaudoPageProps {
  exam: Exam
  onBack: () => void
  dark: boolean
}

export function LaudoPage({ exam, onBack }: LaudoPageProps) {
  const { paciente } = usePaciente()

  const handleDownload = async () => {
    // Só a origem do clique — `exam.id`/nome do exame são dados do paciente.
    track('laudo_download', { origem: 'laudo' })
    try {
      const { url } = await api.declaracao(exam.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      /* sem declaração disponível */
    }
  }

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
            onClick={() => {
              track('laudo_imprimir')
              window.print()
            }}
            className="text-xs font-medium px-3 h-9 rounded-lg border inline-flex items-center gap-1.5 border-gray-200 text-gray-600 bg-white"
          >
            <WIcon name="printer" className="w-4 h-4" strokeWidth={2.2} />Imprimir
          </button>
          {MOSTRAR_ENVIAR_AO_MEDICO && (
            <button className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-50 text-blue-700 inline-flex items-center gap-1.5">
              <WIcon name="send" className="w-4 h-4" strokeWidth={2.2} />Enviar ao médico
            </button>
          )}
          {exam.declaracaoUrl && (
            <button
              onClick={() => void handleDownload()}
              className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25"
            >
              <WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF
            </button>
          )}
        </div>
      </div>

      {/* Printable document — .laudo-imprimivel é o que sai no papel (ver o
          @media print no index.html). */}
      {/* Sem overflow-hidden no card: ele decaparia o balão de referência
          completa (Referencia.tsx) nas últimas linhas; o rodapé cuida dos
          próprios cantos com rounded-b-2xl. */}
      <div className="laudo-imprimivel bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-200">

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
            {MOSTRAR_LAUDO_ASSINATURA_MOCK && (
              <div className="text-[10px] text-gray-500 mt-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Assinado digitalmente
              </div>
            )}
          </div>
        </div>

        {/* Patient / doctor meta */}
        <div className="px-10 py-6 grid grid-cols-2 gap-x-10 gap-y-4 border-b border-gray-100">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Paciente</div>
            <div className="text-base font-semibold text-slate-900">{paciente?.nome ?? '—'}</div>
            <div className="text-xs text-gray-600">
              CPF {paciente ? formatarCpf(paciente.cpf) : '—'} · Nasc.{' '}
              {paciente ? formatarData(paciente.dataNascimento) : '—'} · Sexo {paciente?.sexo ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Médico solicitante</div>
            <div className="text-base font-semibold text-slate-900">{exam.doctor}</div>
            <div className="text-xs text-gray-600">{exam.crm}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Coleta</div>
            {/* O horário era fixo no código; sem ele o laudo mostra só a data,
                que essa sim vem do LIS. */}
            <div className="text-sm font-medium text-slate-900">
              {exam.fullDate}{MOSTRAR_LAUDO_ASSINATURA_MOCK && ' · 07:42'}
            </div>
            <div className="text-xs text-gray-600">{exam.laboratorio ?? exam.unit}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Liberação</div>
            <div className="text-sm font-medium text-slate-900">
              {exam.fullDate}{MOSTRAR_LAUDO_ASSINATURA_MOCK && ' · 14:08'}
            </div>
            {/* Material e método vêm do laudo dos LIS. O resultado do FlowLab não
                os tem — e num laudo impresso é melhor omitir a linha do que
                afirmar um material errado. */}
            {exam.material && <div className="text-xs text-gray-600">Material: {exam.material}</div>}
            {exam.metodo && <div className="text-xs text-gray-600">Método: {exam.metodo}</div>}
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

        {/* Laudo descritivo (citologia/patologia): texto corrido, sem tabela */}
        {exam.panels.length === 1 && exam.panels[0]?.name === 'Laudo' && !exam.groups?.length ? (
          <div className="px-10 py-6">
            <LaudoTexto texto={exam.panels[0].value} />
          </div>
        ) : (
        <>
        {/* Panels table */}
        <div className="px-10 py-6">
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b-2 border-slate-300">
            <span>Marcador</span>
            <span>Resultado</span>
            <span>Referência</span>
            <span>Status</span>
          </div>
          {/* Laudo compilado por pedido tem um grupo (seção) por exame — no
              impresso os marcadores genéricos ("Resultado", "Conclusão")
              precisam do cabeçalho do exame para fazer sentido. Exame avulso
              não tem grupos e sai na lista simples. */}
          {exam.groups?.length
            ? exam.groups.map((g, gi) => (
                <div key={`${g.name}-${gi}`} className="imprime-junto">
                  <div className="px-4 pt-5 pb-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    {g.name}
                  </div>
                  {g.panels.map((p, i) => (
                    <LinhaMarcador key={`${p.name}-${i}`} p={p} ultima={i === g.panels.length - 1} />
                  ))}
                </div>
              ))
            : exam.panels.map((p, i) => (
                <LinhaMarcador key={`${p.name}-${i}`} p={p} ultima={i === exam.panels.length - 1} />
              ))}
        </div>
        </>
        )}

        {/* Clinical observations */}
        {exam.summary && (
          <div className="imprime-junto px-10 pb-2">
            <div className="rounded-xl border border-gray-200 bg-slate-50 p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Observações clínicas</div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {exam.summary} Recomenda-se correlação com quadro clínico. Em caso de dúvida, consulte o médico responsável.
              </p>
            </div>
          </div>
        )}

        {/* Signature + QR — mock: a bioquímica nomeada abaixo não assinou nada e
            o QR não leva a lugar nenhum. Ver MOSTRAR_LAUDO_ASSINATURA_MOCK. */}
        {MOSTRAR_LAUDO_ASSINATURA_MOCK && (
        <div className="imprime-junto px-10 py-8 border-t border-gray-100 grid grid-cols-2 gap-10 items-end">
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
        )}

        {/* Footer */}
        <div className="px-10 py-4 bg-slate-50 border-t border-gray-100 rounded-b-2xl text-[10px] text-gray-500 flex items-center justify-between">
          <span>Lab Hub · labhub.com.br · 0800 123 4567</span>
          {/* Sem "Página X de Y": o laudo compilado quebra em N páginas e o
              número aqui seria mentira — o navegador já numera no cabeçalho. */}
          <span>Gerado em {exam.fullDate}</span>
        </div>
      </div>
    </div>
  )
}

function LinhaMarcador({ p, ultima }: { p: ExamPanel; ultima: boolean }) {
  return (
    <div
      className={`imprime-junto grid grid-cols-[2fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 ${
        !ultima ? 'border-b border-gray-200' : ''
      }`}
    >
      <div className="text-sm font-medium text-slate-900">{p.name}</div>
      <div className={`text-sm font-bold tabular-nums ${p.ok ? 'text-slate-900' : 'text-amber-700'}`}>
        {p.value}{' '}
        <span className="text-[11px] font-medium text-gray-500">{p.unit}</span>
      </div>
      <Referencia texto={p.ref} />
      <span
        className={`text-[10px] font-bold px-2 py-1 rounded ${
          p.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {p.ok ? 'NORMAL' : 'ATENÇÃO'}
      </span>
    </div>
  )
}
