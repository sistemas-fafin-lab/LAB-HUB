import { describe, expect, it } from 'vitest'
import type { Agendamento } from '@lab-hub/shared'
import { coletasEmAndamento, diasDeColeta, historicoDeColetas, proximaColeta, situacaoDaColeta } from './coletas'

const AGORA = new Date('2026-11-04T12:00:00')

const ag = (id: string, dataHora: string, status: Agendamento['status'] = 'confirmado'): Agendamento => ({
  id,
  pacienteId: 'p',
  postoFlowlabId: 'x',
  postoNome: 'Asa Sul',
  dataHora,
  status,
  criadoEm: '2026-11-01T10:00:00',
})

const ids = (lista: readonly Agendamento[]) => lista.map((a) => a.id)

describe('situacaoDaColeta', () => {
  it.each([
    ['pendente', 'Pendente', 1, -1],
    ['confirmado', 'Confirmado', 1, -1],
    ['em_coleta', 'Check-in feito', 3, -1],
    ['realizado', 'Realizado', 4, -1],
    ['bloqueado', 'Pendência', 2, 1],
    ['cancelado', 'Cancelado', 0, -1],
  ] as const)('%s é "%s", etapa %i', (status, rotulo, passo, alerta) => {
    expect(situacaoDaColeta(status)).toMatchObject({ rotulo, passo, alerta })
  })

  it('só a pendência usa o tom de atenção', () => {
    expect(situacaoDaColeta('bloqueado').tom).toBe('accent')
    expect(situacaoDaColeta('confirmado').tom).toBe('neutral')
  })
})

describe('separação das coletas', () => {
  const futura = ag('futura', '2026-11-10T08:00:00')
  const maisPerto = ag('perto', '2026-11-05T08:00:00', 'pendente')
  const falta = ag('falta', '2026-11-01T08:00:00')
  const bloqueada = ag('bloq', '2026-11-20T08:00:00', 'bloqueado')
  const checkin = ag('checkin', '2026-11-04T08:00:00', 'em_coleta')
  const realizada = ag('feita', '2026-10-01T08:00:00', 'realizado')
  const cancelada = ag('canc', '2026-10-15T08:00:00', 'cancelado')
  const todas = [futura, maisPerto, falta, bloqueada, checkin, realizada, cancelada]

  it('a próxima é a agendada futura mais perto de agora', () => {
    expect(proximaColeta(todas, AGORA)?.id).toBe('perto')
    expect(proximaColeta([falta, realizada], AGORA)).toBeUndefined()
  })

  it('em andamento: pendência primeiro, depois por data; a falta fica de fora', () => {
    expect(ids(coletasEmAndamento(todas, AGORA))).toEqual(['bloq', 'checkin', 'perto', 'futura'])
  })

  it('histórico: o resto, da mais recente para a mais antiga', () => {
    expect(ids(historicoDeColetas(todas, AGORA))).toEqual(['falta', 'canc', 'feita'])
  })
})

describe('diasDeColeta', () => {
  it('agrupa por dia em ordem cronológica', () => {
    const dias = diasDeColeta(['2026-11-06T08:00:00', '2026-11-05T09:00:00', '2026-11-05T08:00:00'])
    expect(dias.map((d) => d.horarios.length)).toEqual([2, 1])
    expect(dias[0]?.date.getDate()).toBe(5)
  })

  it('marca como indisponível o horário da grade que a unidade não oferece', () => {
    const [dia] = diasDeColeta(['2026-11-05T08:00:00', '2026-11-05T08:30:00', '2026-11-05T10:00:00'])
    expect(dia?.horarios.map((h) => [new Date(h.iso).getHours(), new Date(h.iso).getMinutes(), h.disponivel])).toEqual([
      [8, 0, true],
      [8, 30, true],
      [9, 0, false],
      [9, 30, false],
      [10, 0, true],
    ])
  })

  it('devolve o ISO recebido nos horários disponíveis: é ele que vai para a API', () => {
    const iso = '2026-11-05T08:00:00.000-03:00'
    const [dia] = diasDeColeta([iso])
    expect(dia?.horarios).toEqual([{ iso, disponivel: true }])
  })

  it('o passo é de cada dia: não risca um horário que só existe em outro', () => {
    const dias = diasDeColeta(['2026-11-05T08:00:00', '2026-11-05T08:30:00', '2026-11-06T08:00:00', '2026-11-06T09:00:00'])
    expect(dias[1]?.horarios.map((h) => h.disponivel)).toEqual([true, true])
  })

  it('sem grade reconhecível, não inventa horário indisponível', () => {
    const dias = diasDeColeta(['2026-11-05T08:00:00', '2026-11-05T08:01:00', '2026-11-05T12:00:00'])
    expect(dias[0]?.horarios.every((h) => h.disponivel)).toBe(true)
    expect(dias[0]?.horarios).toHaveLength(3)
  })

  it('nunca esconde um horário livre fora do passo da grade', () => {
    const [dia] = diasDeColeta(['2026-11-05T08:00:00', '2026-11-05T08:30:00', '2026-11-05T09:10:00'])
    const livres = dia?.horarios.filter((h) => h.disponivel).map((h) => h.iso)
    expect(livres).toEqual(['2026-11-05T08:00:00', '2026-11-05T08:30:00', '2026-11-05T09:10:00'])
  })

  it('sem horários, nenhum dia', () => {
    expect(diasDeColeta([])).toEqual([])
  })
})
