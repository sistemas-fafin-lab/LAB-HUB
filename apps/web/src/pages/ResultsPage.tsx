import { useRef, useState } from 'react'
import type { AdminConsultaResultadosResposta, Paciente } from '@lab-hub/shared'
import { Btn, Chip, EmptyState, FalhaAoCarregar, PageHeader, Panel, SearchField, SelectField, SkeletonRows } from '../components/portal'
import { ExamRow } from '../components/shared/ExamRow'
import type { Exam } from '../lib/exame'
import { atualizaResultados, combinaExams, useResultados } from '../lib/useResultados'
import { ehSessaoAdmin } from '../lib/admin'
import { api, ApiError } from '../lib/api'
import { apenasDigitos, formatarCpf, validarCpf } from '../lib/validators'

type FilterId = 'all' | 'ready' | 'analyzing'

interface FilterOption {
  id: FilterId
  label: string
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all',       label: 'Todos'      },
  { id: 'ready',     label: 'Liberados'  },
  { id: 'analyzing', label: 'Em andamento' },
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

const OPCOES_PERIODO = PERIODO_OPTIONS.map((p) => ({ value: p.id, label: p.label }))

const ehPeriodo = (valor: string): valor is PeriodoId => PERIODO_OPTIONS.some((p) => p.id === valor)

function contaDoFiltro(exams: readonly Exam[], id: FilterId): number {
  return id === 'all' ? exams.length : exams.filter((e) => e.status === id).length
}

/** Mensagem de um campo: tinta com marcador coral (contraste do texto pequeno). */
function ErroDoCampo({ children }: { children: string }) {
  return (
    <p role="alert" className="w-full text-[13px]">
      <span className="lh-bl mr-2" style={{ background: 'var(--lh-coral)' }} />
      {children}
    </p>
  )
}

interface ResultsPageProps {
  onOpenExam: (exam: Exam) => void
  onAgendar: () => void
  /** Paciente da sessão — só usado para decidir se a consulta admin aparece. */
  paciente?: Paciente | null
}

export function ResultsPage({ onOpenExam, onAgendar, paciente }: ResultsPageProps) {
  const { exams, loading, error } = useResultados()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery]   = useState('')
  const [periodo, setPeriodo]         = useState<PeriodoId>('all')
  const [atualizando, setAtualizando] = useState(false)

  // Consulta administrativa (ver .scratch/consulta-admin-cpf-producao): campo só
  // aparece para a sessão autorizada. Em dev, checagem de e-mail sem disjuntor;
  // fora de dev, exige também VITE_ADMIN_RESULTS_ENABLED === 'true'. Falha
  // fechada por padrão — sem VITE_ADMIN_EMAIL configurado, isAdmin é sempre false.
  const isAdmin = ehSessaoAdmin(
    paciente?.email,
    import.meta.env.DEV,
    import.meta.env.VITE_ADMIN_EMAIL,
    import.meta.env.VITE_ADMIN_RESULTS_ENABLED === 'true',
  )
  const [cpfBusca, setCpfBusca] = useState('')
  const [cpfErro, setCpfErro] = useState<string | null>(null)
  const [buscandoCpf, setBuscandoCpf] = useState(false)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [consultaAdmin, setConsultaAdmin] = useState<AdminConsultaResultadosResposta | null>(null)

  // Só a resposta do pedido MAIS RECENTE pode alterar o estado. Sem isso, trocar
  // de CPF rápido (ou um "Voltar" no meio de uma consulta em voo) corre o risco
  // de uma resposta atrasada de um pedido antigo chegar DEPOIS da mais nova e
  // sobrescrever a lista do CPF que o admin está olhando agora.
  const pedidoAdminRef = useRef(0)

  // Compartilhado pela busca por CPF novo e pelo Atualizar em modo admin: os
  // dois só diferem em QUAL cpf consultam — a leitura em si é a mesma (server
  // já é cache-only, nunca dispara ApLIS/AOL).
  const consultarCpf = async (cpfDigitos: string) => {
    const pedidoId = ++pedidoAdminRef.current
    setBuscandoCpf(true)
    try {
      const resposta = await api.adminResultadosPorCpf(cpfDigitos)
      if (pedidoAdminRef.current !== pedidoId) return // resposta obsoleta — ignorada
      setConsultaAdmin(resposta)
      setNaoEncontrado(false)
      setCpfErro(null)
    } catch (err: unknown) {
      if (pedidoAdminRef.current !== pedidoId) return // falha obsoleta — ignorada
      if (err instanceof ApiError && err.status === 404) {
        setConsultaAdmin(null)
        setNaoEncontrado(true)
      } else {
        setCpfErro(err instanceof Error ? err.message : 'Falha ao consultar CPF')
      }
    } finally {
      if (pedidoAdminRef.current === pedidoId) setBuscandoCpf(false)
    }
  }

  const handleBuscarCpf = async () => {
    const erro = validarCpf(cpfBusca)
    setCpfErro(erro)
    setNaoEncontrado(false)
    if (erro) return // CPF inválido não dispara requisição.
    await consultarCpf(apenasDigitos(cpfBusca))
  }

  // Repete a consulta do CPF já exibido, só com dados persistidos (mesmo
  // caminho cache-only do servidor) — nunca a lista PRÓPRIA, que nem está
  // sendo mostrada em modo admin.
  const handleAtualizarAdmin = async () => {
    if (!consultaAdmin) return
    await consultarCpf(consultaAdmin.paciente.cpf)
  }

  const handleLimparConsultaAdmin = () => {
    pedidoAdminRef.current++ // invalida qualquer resposta em voo — não pode repopular depois do Voltar
    setConsultaAdmin(null)
    setNaoEncontrado(false)
    setCpfBusca('')
    setCpfErro(null)
    setBuscandoCpf(false)
  }

  // Em consulta admin, a lista PRÓPRIA é substituída pela do paciente
  // encontrado — nunca as duas misturadas (ver ticket).
  const emConsultaAdmin = consultaAdmin !== null
  // Mesma composição e ordenação da visão normal (combinaExams) — a consulta
  // admin não pode ter uma segunda representação visual do resultado/laudo.
  const examsAtivos = emConsultaAdmin
    ? combinaExams(consultaAdmin.resultados, consultaAdmin.laudos ?? [])
    : exams
  // Em modo admin, `buscandoCpf` é o único sinal de carregamento: enquanto uma
  // nova busca (nova CPF ou Atualizar) está em voo, a lista do paciente ANTERIOR
  // não pode continuar na tela como se já fosse a do CPF recém-submetido.
  const carregando = emConsultaAdmin ? buscandoCpf : loading
  const erroAtivo = emConsultaAdmin ? null : error

  const periodoSel = PERIODO_OPTIONS.find((p) => p.id === periodo)!
  // Corte em ISO (YYYY-MM-DD) comparável por string com Exam.coletadoEm.
  const corte = periodoSel.dias === null
    ? ''
    : new Date(Date.now() - periodoSel.dias * 86_400_000).toISOString().slice(0, 10)

  // Filtros de status/período/texto são só da visão normal (fora de escopo da
  // consulta admin, ver spec) — em modo admin a lista aparece inteira, mesmo
  // que filter/query/período tenham ficado com um valor não-padrão de antes.
  const filtered = emConsultaAdmin
    ? examsAtivos
    : examsAtivos.filter((e) =>
        (filter === 'all' || e.status === filter) &&
        (!corte || (e.coletadoEm ?? '') >= corte) &&
        (
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase())
        )
      )

  const limparFiltros = () => {
    setQuery('')
    setFilter('all')
    setPeriodo('all')
  }

  // Estado vazio tem TRÊS mensagens distintas: sem exame nenhum (paciente da
  // sessão), sem exame nenhum (paciente consultado pelo admin) e "filtro não
  // casou" — misturar a primeira com a segunda faria o admin ler "ainda não
  // há resultados" como se fosse sobre a PRÓPRIA conta dele.
  const vazio = examsAtivos.length > 0 ? (
    <EmptyState
      icon="search"
      title="Nenhum exame encontrado"
      text="Tente outro termo ou limpe os filtros."
      action={
        <Btn variant="secondary" onClick={limparFiltros}>
          Limpar filtros
        </Btn>
      }
    />
  ) : emConsultaAdmin ? (
    <EmptyState icon="file-text" title={`Nenhum resultado encontrado para ${consultaAdmin.paciente.nome}.`} />
  ) : (
    <EmptyState
      icon="file-text"
      title="Nenhum resultado ainda"
      text="Os resultados aparecem aqui assim que forem liberados."
      action={
        <Btn icon="calendar-plus" onClick={onAgendar}>
          Agendar coleta
        </Btn>
      }
    />
  )

  const handleAtualizar = async () => {
    setAtualizando(true)
    try {
      await atualizaResultados()
    } finally {
      setAtualizando(false)
    }
  }

  const prontoParaListar = !carregando && !erroAtivo

  return (
    <div className="lh-alvos">
      {/* Não prometer "histórico completo": a busca nos LIS cobre uma janela de
          dias (APLIS_PERIODO_DIAS), então exames antigos podem não estar aqui.
          Dizer o contrário faz o paciente concluir que não fez exame num
          período em que fez. */}
      <PageHeader
        title="Seus resultados"
        sub="Exames realizados nas nossas unidades. Resultados mais antigos podem não aparecer aqui — nesse caso, procure a unidade onde fez a coleta."
      />

      {/* Consulta administrativa de dev — só aparece para a sessão autorizada
          (ver lib/admin.ts). Read-only: nunca edita nada, e nunca mistura a
          lista encontrada com a do titular da sessão. O campo de CPF fica
          sempre visível (mesmo já em consulta) para o admin poder trocar de
          paciente sem sair da aba; o banner com nome/CPF/Atualizar/Voltar só
          aparece quando há uma consulta ativa. */}
      {isAdmin && (
        <Panel pad={14} className="flex flex-col gap-3" style={{ marginBottom: 16 }}>
          {emConsultaAdmin && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[14px] min-w-0">
                Consultando resultados de{' '}
                <span className="font-semibold">{consultaAdmin.paciente.nome}</span>
                {' — CPF '}
                <span className="font-semibold tabular-nums">{formatarCpf(consultaAdmin.paciente.cpf)}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Em consulta admin, Atualizar repete o CPF exibido — só leitura do
                    cache já persistido (resultado + laudo), nunca a lista PRÓPRIA. */}
                <Btn variant="secondary" size="sm" icon="refresh-cw" loading={buscandoCpf} onClick={() => void handleAtualizarAdmin()}>
                  {buscandoCpf ? 'Atualizando…' : 'Atualizar'}
                </Btn>
                <Btn variant="ghost" size="sm" icon="x" onClick={handleLimparConsultaAdmin}>
                  Voltar aos meus resultados
                </Btn>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <SearchField
              icon="id-card"
              inputMode="numeric"
              value={cpfBusca}
              onChange={(valor) => setCpfBusca(formatarCpf(valor))}
              onEnter={() => void handleBuscarCpf()}
              placeholder="Consultar por CPF"
              rotuloLimpar="Limpar CPF"
            />
            <Btn icon="search" loading={buscandoCpf} onClick={() => void handleBuscarCpf()}>
              {buscandoCpf ? 'Buscando…' : 'Buscar'}
            </Btn>
            {cpfErro && <ErroDoCampo>{cpfErro}</ErroDoCampo>}
            {naoEncontrado && <ErroDoCampo>Nenhum paciente encontrado com este CPF.</ErroDoCampo>}
          </div>
        </Panel>
      )}

      {/* Toolbar — busca por nome/categoria, filtros de status/período e
          Atualizar da visão NORMAL. Fica oculta em consulta admin: esses
          filtros não têm sentido para a lista de terceiro, e aplicá-los sem
          a UI visível esconderia resultados do admin sem explicação (ver
          ticket 03). */}
      {!emConsultaAdmin && (
        <Panel pad={14} className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 16 }}>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar por nome ou categoria…" />
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_OPTIONS.map((f) => (
              <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span className="tabular-nums opacity-80">{contaDoFiltro(exams, f.id)}</span>
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap md:ml-auto">
            <SelectField
              className="w-[190px]"
              ariaLabel="Período"
              value={periodo}
              onChange={(valor) => {
                if (ehPeriodo(valor)) setPeriodo(valor)
              }}
              options={OPCOES_PERIODO}
            />
            <Btn variant="secondary" icon="refresh-cw" loading={atualizando} onClick={() => void handleAtualizar()}>
              {atualizando ? 'Atualizando…' : 'Atualizar'}
            </Btn>
          </div>
        </Panel>
      )}

      <Panel pad={0}>
        {carregando && <SkeletonRows n={5} />}
        {erroAtivo && !carregando && (
          <FalhaAoCarregar titulo="Não foi possível carregar seus exames" erro={erroAtivo} onTentar={() => void handleAtualizar()} />
        )}
        {prontoParaListar && filtered.length === 0 && vazio}
        {prontoParaListar && filtered.length > 0 && (
          <div className="divide-y divide-line">
            {filtered.map((e) => (
              // Em consulta admin o detalhe abre normalmente (só os valores já
              // vêm na resposta, sem chamada nova) — a marca somenteLeituraAdmin
              // é quem faz o detalhe esconder "Ver laudo"/declaração, que exigem
              // a sessão do PRÓPRIO paciente (ver o campo em lib/exame.ts).
              <ExamRow key={e.id} exam={e} onClick={() => onOpenExam(emConsultaAdmin ? { ...e, somenteLeituraAdmin: true } : e)} />
            ))}
          </div>
        )}
      </Panel>
      {prontoParaListar && filtered.length > 0 && (
        <p className="text-[12px] text-muted mt-3 tabular-nums">
          {filtered.length} de {examsAtivos.length} {examsAtivos.length === 1 ? 'exame' : 'exames'}
        </p>
      )}
    </div>
  )
}
