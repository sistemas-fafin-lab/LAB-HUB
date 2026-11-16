import { describe, expect, it } from 'vitest'
import { eventoDaColeta, nomeDoArquivoIcs } from './calendario'

const coleta = { id: 'ag-1', postoNome: 'Unidade Asa Sul', dataHora: '2026-11-12T10:30:00.000Z' }

describe('evento .ics da coleta', () => {
  const ics = eventoDaColeta(coleta, 'SGAS 915, Bloco A', new Date('2026-11-10T12:00:00Z'))
  const linhas = ics.split('\r\n')

  it('é um VCALENDAR com um VEVENT, em CRLF', () => {
    expect(linhas[0]).toBe('BEGIN:VCALENDAR')
    expect(linhas).toContain('VERSION:2.0')
    expect(linhas).toContain('BEGIN:VEVENT')
    expect(linhas).toContain('END:VEVENT')
    expect(linhas[linhas.length - 2]).toBe('END:VCALENDAR')
  })

  it('UID, início em UTC, 30 minutos e o resumo', () => {
    expect(linhas).toContain('UID:ag-1@labhub')
    expect(linhas).toContain('DTSTART:20261112T103000Z')
    expect(linhas).toContain('DTSTAMP:20261110T120000Z')
    expect(linhas).toContain('DURATION:PT30M')
    expect(linhas).toContain('SUMMARY:Coleta · Lab Hub')
  })

  it('local e descrição, com vírgula e ponto e vírgula escapados', () => {
    expect(linhas).toContain('LOCATION:Unidade Asa Sul\\, SGAS 915\\, Bloco A')
    expect(linhas).toContain('DESCRIPTION:Jejum de 8 a 12 horas. Leve o pedido médico e um documento com foto.')
  })

  it('ponto e vírgula também sai escapado', () => {
    expect(eventoDaColeta(coleta, 'Sala 2; térreo').split('\r\n')).toContain('LOCATION:Unidade Asa Sul\\, Sala 2\\; térreo')
  })

  it('sem endereço, o local é só a unidade', () => {
    expect(eventoDaColeta(coleta, undefined).split('\r\n')).toContain('LOCATION:Unidade Asa Sul')
  })

  it('o arquivo leva o dia da coleta no fuso escolhido', () => {
    expect(nomeDoArquivoIcs('2026-11-12T01:30:00.000Z')).toBe('coleta-2026-11-11.ics') // 22:30 do dia 11 em Brasília
  })
})
