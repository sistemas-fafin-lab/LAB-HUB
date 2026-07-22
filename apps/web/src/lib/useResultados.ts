import { useEffect, useSyncExternalStore } from 'react'
import type { Laudo, RespostaLaudos, Resultado } from '@lab-hub/shared'
import { api } from './api'
import { supabase } from './supabase'
import { laudoToExam, resultadoToExam } from './mappers'
import type { Exam } from '../components/shared/WebHero'

interface UseResultados {
  exams: Exam[]
  loading: boolean
  error: string | null
}

// Chaves de ordenação em ISO — saem do dado CRU porque o Exam só guarda a data
// já formatada ("12 Mai 2026"), que não ordena. A lista fica do mais novo para
// o mais antigo pela data da COLETA (o dia em que o paciente fez o exame, a
// ordem que ele lembra), com a emissão como desempate — coletas do mesmo dia
// aparecem com o laudo liberado por último primeiro.
interface ExamOrdenavel {
  exam: Exam
  coletadoEm: string
  liberadoEm: string
}

function ordenaveisDeResultados(resultados: Resultado[]): ExamOrdenavel[] {
  // O Resultado do FlowLab não tem data de coleta — a liberação faz as vezes.
  return resultados.map((r) => ({
    exam: resultadoToExam(r),
    coletadoEm: r.liberadoEm ?? '',
    liberadoEm: r.liberadoEm ?? '',
  }))
}

function ordenaveisDeLaudos(laudos: Laudo[]): ExamOrdenavel[] {
  return laudos.map((l) => ({
    exam: laudoToExam(l),
    coletadoEm: l.data_coleta || l.data_emissao,
    liberadoEm: l.data_emissao || l.data_coleta,
  }))
}

// ---------------------------------------------------------------------------
// Cache de módulo (stale-while-revalidate no cliente)
//
// O estado vive FORA do React: todos os consumidores (ResultsPage, HomePage,
// TopbarSearch, Sidebar) observam o mesmo snapshot, então trocar de tela mostra
// a lista já carregada na hora — o "Carregando resultados…" só existe na
// primeira busca da sessão. Montar um consumidor só dispara busca nova se o
// cache passou do TTL, e mesmo então a revalidação é silenciosa: a lista antiga
// fica na tela até a nova chegar (a mesma estratégia SWR que a API usa com o
// LIS, agora também entre o navegador e a API).
// ---------------------------------------------------------------------------
const TTL_MS = 60_000

interface EstadoResultados {
  exams: Exam[]
  loading: boolean
  error: string | null
}

let estado: EstadoResultados = { exams: [], loading: true, error: null }
let buscadoEm = 0 // epoch ms da última busca BOA; 0 = nunca buscou
let buscando: Promise<void> | null = null
const ouvintes = new Set<() => void>()

function notifica() {
  for (const avisa of ouvintes) avisa()
}

function inscreve(avisa: () => void) {
  ouvintes.add(avisa)
  return () => {
    ouvintes.delete(avisa)
  }
}

// Troca de conta acontece na MESMA aba (signOut → outro login, sem reload da
// página), e a lista do usuário anterior não pode vazar para o seguinte:
// qualquer mudança de usuário descarta o cache. Token renovado do mesmo
// usuário não conta como mudança.
let usuarioDoCache: string | null = null
supabase.auth.onAuthStateChange((_evento, sessao) => {
  const usuario = sessao?.user?.id ?? null
  if (usuario === usuarioDoCache) return
  usuarioDoCache = usuario
  estado = { exams: [], loading: true, error: null }
  buscadoEm = 0
  notifica()
})

async function busca(): Promise<void> {
  const [resResultados, resLaudos] = await Promise.allSettled([
    api.get<Resultado[]>('/resultados'),
    api.get<RespostaLaudos>('/laudos'),
  ])

  const ordenaveis: ExamOrdenavel[] = []
  if (resResultados.status === 'fulfilled') {
    ordenaveis.push(...ordenaveisDeResultados(resResultados.value))
  }
  if (resLaudos.status === 'fulfilled') {
    ordenaveis.push(...ordenaveisDeLaudos(resLaudos.value.exams))
  }

  if (resResultados.status === 'rejected' && resLaudos.status === 'rejected') {
    if (buscadoEm === 0) {
      const motivo: unknown = resResultados.reason
      estado = {
        exams: [],
        loading: false,
        error: motivo instanceof Error ? motivo.message : 'Erro ao carregar resultados',
      }
    } else {
      // Revalidação falhou com cache em mãos: a lista antiga continua na tela
      // (e buscadoEm fica como está, então a próxima montagem tenta de novo).
      console.warn('Falha ao revalidar resultados', resResultados.reason, resLaudos.reason)
    }
  } else {
    // Uma fonte só falhou: registra e segue com o que veio.
    if (resResultados.status === 'rejected') console.warn('Falha ao carregar resultados do FlowLab', resResultados.reason)
    if (resLaudos.status === 'rejected') console.warn('Falha ao carregar laudos dos LIS', resLaudos.reason)

    ordenaveis.sort(
      (a, b) =>
        b.coletadoEm.localeCompare(a.coletadoEm) ||
        b.liberadoEm.localeCompare(a.liberadoEm),
    )
    estado = { exams: ordenaveis.map((o) => o.exam), loading: false, error: null }
    buscadoEm = Date.now()
  }

  notifica()
}

function garanteFrescor() {
  if (buscando) return
  if (Date.now() - buscadoEm < TTL_MS) return
  buscando = busca().finally(() => {
    buscando = null
  })
}

/**
 * Força uma busca nova AGORA, ignorando o TTL (botão "Atualizar" da
 * ResultsPage). Se já houver busca em andamento, adere a ela em vez de
 * disparar outra. A promise resolve quando a lista estiver atualizada.
 */
export function atualizaResultados(): Promise<void> {
  buscando ??= busca().finally(() => {
    buscando = null
  })
  return buscando
}

/**
 * Exames do paciente, unindo as DUAS fontes:
 *   GET /resultados → o que o FlowLab empurrou pelo webhook
 *   GET /laudos     → o que a API buscou nos LIS (ApLIS/AOL)
 *
 * A união acontece aqui, e não na API, porque as fontes são independentes e têm
 * ciclos de vida próprios — assim as telas que consomem este hook ganham as
 * duas sem saber que existem.
 *
 * Uma fonte que falha não derruba a outra: a tela mostra o que chegou. O erro
 * só aparece quando NADA chegou nunca, porque na ResultsPage ele substitui a
 * lista.
 */
export function useResultados(): UseResultados {
  const atual = useSyncExternalStore(inscreve, () => estado)
  useEffect(() => {
    garanteFrescor()
  }, [])
  return atual
}

/** Total de exames (FlowLab + LIS) da última busca concluída; null antes dela. */
export function useContagemResultados(): number | null {
  return useSyncExternalStore(inscreve, () =>
    buscadoEm === 0 ? null : estado.exams.length,
  )
}
