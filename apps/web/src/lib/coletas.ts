import type { Agendamento, AgendamentoStatus } from '@lab-hub/shared'
import type { PillTone } from '../components/portal'
import { formatDia } from './datetime'
import { diaNoFuso } from './regiao'

// ---------------------------------------------------------------------------
// Regras das coletas no portal: o que cada status significa para o paciente e
// como a lista e a grade de horários se organizam. A Visão geral e as telas de
// coleta leem daqui, para a mesma coleta dizer a mesma coisa em qualquer tela.
// ---------------------------------------------------------------------------

export interface SituacaoColeta {
  rotulo: string
  tom: PillTone
  /** Etapas alcançadas, no modelo do nó (Agendamento → … → Liberação). */
  passo: number
  /** Índice da etapa em atenção, ou -1. */
  alerta: number
}

// 'em_coleta': a recepção conferiu e liberou, então a etapa atual é a Coleta.
// 'realizado': a coleta acabou, a etapa atual é a Análise. O portal não recebe
// o aviso de liberação, por isso nenhum status chega à etapa 5.
const SITUACAO: Record<AgendamentoStatus, SituacaoColeta> = {
  pendente: { rotulo: 'Pendente', tom: 'neutral', passo: 1, alerta: -1 },
  confirmado: { rotulo: 'Confirmado', tom: 'neutral', passo: 1, alerta: -1 },
  em_coleta: { rotulo: 'Check-in feito', tom: 'neutral', passo: 3, alerta: -1 },
  realizado: { rotulo: 'Realizado', tom: 'neutral', passo: 4, alerta: -1 },
  bloqueado: { rotulo: 'Pendência', tom: 'accent', passo: 2, alerta: 1 },
  cancelado: { rotulo: 'Cancelado', tom: 'neutral', passo: 0, alerta: -1 },
}

export function situacaoDaColeta(status: AgendamentoStatus): SituacaoColeta {
  return SITUACAO[status]
}

/** Cancelável enquanto está só agendada: depois do check-in, não mais. */
export const podeCancelar = (status: AgendamentoStatus) => status === 'pendente' || status === 'confirmado'

const instante = (a: Agendamento) => new Date(a.dataHora).getTime()
const agendada = (a: Agendamento) => a.status === 'pendente' || a.status === 'confirmado'

/** Coleta futura ainda de pé mais próxima de agora. */
export function proximaColeta(agendamentos: readonly Agendamento[], agora: Date = new Date()): Agendamento | undefined {
  return agendamentos
    .filter((a) => agendada(a) && instante(a) > agora.getTime())
    .sort((a, b) => instante(a) - instante(b))[0]
}

/**
 * Coletas em andamento, as com pendência primeiro e depois por data. Fora:
 * cancelada; realizada (o portal não recebe o aviso de liberação, ela ficaria
 * aqui para sempre); e agendada cuja hora passou sem check-in, porque ninguém
 * avisa a falta e o relógio é o único juiz (ver preparoAplicavel).
 */
export function coletasEmAndamento(agendamentos: readonly Agendamento[], agora: Date = new Date()): Agendamento[] {
  return agendamentos
    .filter((a) => a.status === 'em_coleta' || a.status === 'bloqueado' || (agendada(a) && instante(a) > agora.getTime()))
    .sort((a, b) => Number(b.status === 'bloqueado') - Number(a.status === 'bloqueado') || instante(a) - instante(b))
}

/** O que não está em andamento, da coleta mais recente para a mais antiga. */
export function historicoDeColetas(agendamentos: readonly Agendamento[], agora: Date = new Date()): Agendamento[] {
  const ativas = new Set(coletasEmAndamento(agendamentos, agora))
  return agendamentos.filter((a) => !ativas.has(a)).sort((a, b) => instante(b) - instante(a))
}

export interface HorarioDoDia {
  iso: string
  disponivel: boolean
}

export interface DiaDeColeta {
  /** Id estável do dia. */
  key: string
  /** Primeiro horário do dia. */
  date: Date
  /** "quarta, 01 de julho" */
  label: string
  horarios: HorarioDoDia[]
}

const MINUTO_MS = 60_000
// Abaixo disto o intervalo entre dois horários não é grade de agenda, é dado
// irregular: melhor não marcar nada do que riscar dezenas de horários que
// nunca existiram.
const MENOR_PASSO_MS = 5 * MINUTO_MS

/** Menor intervalo entre dois horários seguidos do dia, ou null. */
function passoDaGrade(dia: readonly number[]): number | null {
  let passo: number | null = null
  for (let i = 1; i < dia.length; i++) {
    const intervalo = dia[i]! - dia[i - 1]!
    if (passo === null || intervalo < passo) passo = intervalo
  }
  return passo !== null && passo >= MENOR_PASSO_MS ? passo : null
}

/**
 * Agrupa os horários por dia e marca os indisponíveis. O FlowLab só informa os
 * horários livres, então os indisponíveis são deduzidos: o menor intervalo
 * entre horários do dia é o passo da grade, e o que falta entre o primeiro e o
 * último não está disponível (ocupado ou fora de atendimento, a API não diz
 * qual). O passo é do próprio dia para não riscar um horário que só existe em
 * outro. O que não dá para ver: horário ocupado nas pontas do dia, ou num dia em
 * que sobrou um horário só.
 */
export function diasDeColeta(slots: readonly string[]): DiaDeColeta[] {
  const porDia = new Map<string, { date: Date; livres: Map<number, string> }>()
  for (const iso of slots) {
    const date = new Date(iso)
    // Agrupa pelo dia no fuso escolhido nas Configurações.
    const key = String(diaNoFuso(date))
    const dia = porDia.get(key) ?? { date, livres: new Map<number, string>() }
    if (date < dia.date) dia.date = date
    dia.livres.set(date.getTime(), iso)
    porDia.set(key, dia)
  }

  const ordenados = [...porDia.entries()].sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
  return ordenados.map(([key, { date, livres }]) => {
    const doDia = [...livres.keys()].sort((a, b) => a - b)
    const passo = passoDaGrade(doDia)
    const primeiro = doDia[0] ?? date.getTime()
    const ultimo = doDia[doDia.length - 1] ?? primeiro
    // A grade só acrescenta os buracos: horário livre fora do passo continua lá.
    const instantesDoDia = new Set(doDia)
    if (passo !== null) for (let t = primeiro; t <= ultimo; t += passo) instantesDoDia.add(t)
    const horarios = [...instantesDoDia]
      .sort((x, y) => x - y)
      .map((t): HorarioDoDia => {
        const iso = livres.get(t)
        return iso !== undefined ? { iso, disponivel: true } : { iso: new Date(t).toISOString(), disponivel: false }
      })
    return { key, date, label: formatDia(date), horarios }
  })
}
