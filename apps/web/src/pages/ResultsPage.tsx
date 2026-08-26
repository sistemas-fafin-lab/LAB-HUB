import { useState } from 'react'
import type { AdminConsultaResultadosResposta, Paciente } from '@lab-hub/shared'
import { WIcon } from '../components/primitives/WIcon'
import { ExamRow } from '../components/shared/ExamRow'
import { ExamRowSkeleton } from '../components/shared/ExamRowSkeleton'
import type { Exam } from '../components/shared/WebHero'
import { atualizaResultados, useResultados } from '../lib/useResultados'
import { ehSessaoAdmin } from '../lib/admin'
import { api, ApiError } from '../lib/api'
import { resultadoToExam } from '../lib/mappers'
import { apenasDigitos, formatarCpf, validarCpf } from '../lib/validators'

type FilterId = 'all' | 'ready' | 'analyzing'

interface FilterOption {
  id: FilterId
  label: string
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all',       label: 'Todos'      },
  { id: 'ready',     label: 'Liberados'  },
  { id: 'analyzing', label: 'Em análise' },
]

type PeriodoId = 'all' | '30d' | '90d' | '12m'

interface PeriodoOption {
  id: PeriodoId
  label: string
  dias: number | null // null = sem corte
}

const PERIODO_OPTIONS: PeriodoOption[] = [
  { id: 'all', label: 'Todo o período',   dias: null },
  { id: '30d', label: 'Últimos 30 dias',  dias: 30   },
  { id: '90d', label: 'Últimos 90 dias',  dias: 90   },
  { id: '12m', label: 'Últimos 12 meses', dias: 365  },
]

interface ResultsPageProps {
  dark: boolean
  onOpenExam: (exam: Exam) => void
  /** Paciente da sessão — só usado para decidir se a consulta admin aparece. */
  paciente?: Paciente | null
}

export function ResultsPage({ dark, onOpenExam, paciente }: ResultsPageProps) {
  const { exams, loading, error } = useResultados()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery]   = useState('')
  const [periodo, setPeriodo]         = useState<PeriodoId>('all')
  const [periodoAberto, setPeriodoAberto] = useState(false)
  const [atualizando, setAtualizando] = useState(false)

  // Consulta administrativa de dev (ver .scratch/consulta-dev-resultados-por-cpf):
  // campo só aparece para a sessão autorizada, e só fora de produção. Falha
  // fechada por padrão — sem VITE_ADMIN_EMAIL configurado, isAdmin é sempre false.
  const isAdmin = ehSessaoAdmin(paciente?.email, import.meta.env.DEV, import.meta.env.VITE_ADMIN_EMAIL)
  const [cpfBusca, setCpfBusca] = useState('')
  const [cpfErro, setCpfErro] = useState<string | null>(null)
  const [buscandoCpf, setBuscandoCpf] = useState(false)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [consultaAdmin, setConsultaAdmin] = useState<AdminConsultaResultadosResposta | null>(null)

  const handleBuscarCpf = async () => {
    const erro = validarCpf(cpfBusca)
    setCpfErro(erro)
    setNaoEncontrado(false)
    if (erro) return // CPF inválido não dispara requisição.

    setBuscandoCpf(true)
    try {
      const resposta = await api.adminResultadosPorCpf(apenasDigitos(cpfBusca))
      setConsultaAdmin(resposta)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        setConsultaAdmin(null)
        setNaoEncontrado(true)
      } else {
        setCpfErro(err instanceof Error ? err.message : 'Falha ao consultar CPF')
      }
    } finally {
      setBuscandoCpf(false)
    }
  }

  const handleLimparConsultaAdmin = () => {
    setConsultaAdmin(null)
    setNaoEncontrado(false)
    setCpfBusca('')
    setCpfErro(null)
  }

  // Em consulta admin, a lista PRÓPRIA é substituída pela do paciente
  // encontrado — nunca as duas misturadas (ver ticket).
  const emConsultaAdmin = consultaAdmin !== null
  const examsAtivos = emConsultaAdmin ? consultaAdmin.resultados.map(resultadoToExam) : exams
  const carregando = emConsultaAdmin ? false : loading
  const erroAtivo = emConsultaAdmin ? null : error

  const periodoSel = PERIODO_OPTIONS.find((p) => p.id === periodo)!
  // Corte em ISO (YYYY-MM-DD) comparável por string com Exam.coletadoEm.
  const corte = periodoSel.dias === null
    ? ''
    : new Date(Date.now() - periodoSel.dias * 86_400_000).toISOString().slice(0, 10)

  const filtered = examsAtivos.filter((e) =>
    (filter === 'all' || e.status === filter) &&
    (!corte || (e.coletadoEm ?? '') >= corte) &&
    (
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.category.toLowerCase().includes(query.toLowerCase())
    )
  )

  // Estado vazio tem TRÊS mensagens distintas: sem exame nenhum (paciente da
  // sessão), sem exame nenhum (paciente consultado pelo admin) e "filtro não
  // casou" — misturar a primeira com a segunda faria o admin ler "ainda não
  // há resultados" como se fosse sobre a PRÓPRIA conta dele.
  const mensagemVazia = examsAtivos.length > 0
    ? 'Nenhum exame corresponde à busca ou aos filtros selecionados.'
    : emConsultaAdmin
      ? `Nenhum resultado encontrado para ${consultaAdmin.paciente.nome}.`
      : 'Nenhum resultado disponível ainda. Assim que o laboratório liberar, ele aparece aqui.'

  const handleAtualizar = async () => {
    setAtualizando(true)
    try {
      await atualizaResultados()
    } finally {
      setAtualizando(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1
          className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          Seus resultados
        </h1>
        {/* Não prometer "histórico completo": a busca nos LIS cobre uma janela
            de dias (APLIS_PERIODO_DIAS), então exames antigos podem não estar
            aqui. Dizer o contrário faz o paciente concluir que não fez exame
            num período em que fez. */}
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Exames realizados nas nossas unidades. Resultados mais antigos podem não aparecer aqui —
          nesse caso, procure a unidade onde fez a coleta.
        </p>
      </div>

      {/* Consulta administrativa de dev — só aparece para a sessão autorizada
          (ver lib/admin.ts). Read-only: nunca edita nada, e nunca mistura a
          lista encontrada com a do titular da sessão. */}
      {isAdmin && (
        <div
          className={`rounded-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } p-4 shadow-sm mb-4`}
        >
          {emConsultaAdmin ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className={`text-sm ${dark ? 'text-gray-200' : 'text-slate-700'}`}>
                Consultando resultados de{' '}
                <span className="font-semibold">{consultaAdmin.paciente.nome}</span>
                {' — CPF '}
                <span className="font-semibold">{formatarCpf(consultaAdmin.paciente.cpf)}</span>
              </div>
              <button
                onClick={handleLimparConsultaAdmin}
                className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
                  dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
                }`}
              >
                <WIcon name="x" className="w-3.5 h-3.5" strokeWidth={2.2} />
                Voltar aos meus resultados
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className={`flex items-center gap-2 min-w-[220px] ${
                  dark ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-100'
                } border rounded-xl px-3 h-10`}
              >
                <WIcon name="id-card" className="w-4 h-4 text-gray-400" strokeWidth={2.2} />
                <input
                  inputMode="numeric"
                  value={cpfBusca}
                  onChange={(e) => setCpfBusca(formatarCpf(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleBuscarCpf() }}
                  placeholder="Consultar por CPF (dev)"
                  className={`bg-transparent outline-none text-sm flex-1 ${
                    dark ? 'text-white placeholder:text-gray-400' : 'text-slate-800 placeholder:text-gray-500'
                  }`}
                />
              </div>
              <button
                onClick={() => void handleBuscarCpf()}
                disabled={buscandoCpf}
                className="h-9 px-3 rounded-lg text-xs font-medium bg-blue-600 text-white inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <WIcon name="search" className="w-3.5 h-3.5" strokeWidth={2.2} />
                {buscandoCpf ? 'Buscando…' : 'Buscar'}
              </button>
              {cpfErro && <span className="text-xs text-red-500">{cpfErro}</span>}
              {naoEncontrado && (
                <span className="text-xs text-red-500">Nenhum paciente encontrado com este CPF.</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-4 shadow-sm mb-4 flex items-center gap-3 flex-wrap`}
      >
        {/* Search */}
        <div
          className={`flex items-center gap-2 flex-1 min-w-[260px] ${
            dark ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-100'
          } border rounded-xl px-3 h-10`}
        >
          <WIcon name="search" className="w-4 h-4 text-gray-400" strokeWidth={2.2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou categoria…"
            className={`bg-transparent outline-none text-sm flex-1 ${
              dark ? 'text-white placeholder:text-gray-400' : 'text-slate-800 placeholder:text-gray-500'
            }`}
          />
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-1.5">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 h-9 rounded-lg text-xs font-semibold transition ${
                filter === f.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : dark
                  ? 'bg-gray-800 text-gray-300'
                  : 'bg-slate-50 text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Período / Atualizar — antes `hidden md:flex`, o que deixava quem está
            no celular sem filtro de período E sem como recarregar a lista. */}
        <div className="flex items-center gap-1.5 md:ml-auto">
          <div className="relative">
            <button
              onClick={() => setPeriodoAberto((v) => !v)}
              className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${
                periodo !== 'all'
                  ? 'border-blue-200 text-blue-700 bg-blue-50'
                  : dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
              }`}
            >
              <WIcon name="calendar" className="w-3.5 h-3.5" strokeWidth={2.2} />
              {periodo === 'all' ? 'Período' : periodoSel.label}
            </button>
            {periodoAberto && (
              <>
                {/* Backdrop invisível: clicar fora fecha o menu. */}
                <div className="fixed inset-0 z-10" onClick={() => setPeriodoAberto(false)} />
                <div
                  className={`absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border shadow-lg p-1 ${
                    dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                  }`}
                >
                  {PERIODO_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setPeriodo(p.id); setPeriodoAberto(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                        periodo === p.id
                          ? 'bg-blue-600 text-white'
                          : dark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Sem sentido em consulta admin: recarregaria a lista PRÓPRIA, que
              nem está sendo exibida. */}
          {!emConsultaAdmin && (
            <button
              onClick={handleAtualizar}
              disabled={atualizando}
              className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 disabled:opacity-60 ${
                dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
              }`}
            >
              <WIcon
                name="refresh-cw"
                className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`}
                strokeWidth={2.2}
              />
              {atualizando ? 'Atualizando…' : 'Atualizar'}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-2 shadow-sm flex flex-col gap-1`}
      >
        {carregando && <ExamRowSkeleton dark={dark} />}
        {erroAtivo && !carregando && (
          <div className="text-center text-sm text-red-500 py-10">{erroAtivo}</div>
        )}
        {!carregando && !erroAtivo && filtered.map((e) => (
          // Em consulta admin as linhas são só leitura: sem navegação para
          // detalhe, laudo ou declaração (fora do escopo desta fatia).
          <ExamRow key={e.id} exam={e} onClick={() => { if (!emConsultaAdmin) onOpenExam(e) }} dark={dark} />
        ))}
        {!carregando && !erroAtivo && filtered.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-10">{mensagemVazia}</div>
        )}
      </div>
    </div>
  )
}
