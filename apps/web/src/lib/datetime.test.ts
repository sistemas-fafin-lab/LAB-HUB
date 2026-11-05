import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDataHora, formatDiaRelativo, relDia, timeFmt } from './datetime'
import { fusoAtual, salvarFuso } from './regiao'

// Os testes rodam com TZ=America/Sao_Paulo (vitest.config): o fuso escolhido
// nas Configurações tem de valer mesmo quando difere do fuso do aparelho.

function armazenamentoEmMemoria() {
  // O localStorage do jsdom fica encoberto pelo do Node; um em memória basta.
  const dados = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  })
}

beforeEach(armazenamentoEmMemoria)
afterEach(() => {
  salvarFuso('America/Sao_Paulo')
  vi.unstubAllGlobals()
})

describe('datas e horas no fuso escolhido', () => {
  const coleta = new Date('2026-07-24T10:30:00Z')

  it('padrão é Brasília', () => {
    expect(fusoAtual()).toBe('America/Sao_Paulo')
    expect(timeFmt.format(coleta)).toBe('07:30')
  })

  it('em Manaus a mesma coleta é uma hora mais cedo; em Noronha, uma mais tarde', () => {
    salvarFuso('America/Manaus')
    expect(timeFmt.format(coleta)).toBe('06:30')
    expect(formatDataHora(coleta.toISOString())).toBe('sexta, 24 de julho às 06:30')
    salvarFuso('America/Noronha')
    expect(timeFmt.format(coleta)).toBe('08:30')
  })

  it('o dia ("Hoje"/"Amanhã") também é o do fuso escolhido', () => {
    // 02:30 UTC do dia 25 = 23:30 do dia 24 em Brasília, 22:30 em Manaus.
    const agora = new Date('2026-07-25T02:30:00Z')
    const umaHoraDepois = new Date('2026-07-25T03:30:00Z') // 00:30 do 25 em Brasília
    expect(relDia(umaHoraDepois, agora)).toBe('Amanhã')
    salvarFuso('America/Manaus') // 23:30 do 24 em Manaus
    expect(relDia(umaHoraDepois, agora)).toBe('Hoje')
    expect(formatDiaRelativo('2026-07-20T12:00:00Z')).toBe('20 Jul')
  })
})
