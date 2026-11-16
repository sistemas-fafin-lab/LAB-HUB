import { describe, expect, it } from 'vitest'
import { gerarCsv } from './csv'

describe('gerarCsv', () => {
  it('BOM, ";" como separador, CRLF e aspas escapadas', () => {
    const csv = gerarCsv(
      ['Exame', 'Categoria'],
      [
        ['Hemácias; série vermelha', 'Hematologia'],
        ['Glicose "jejum"', 'Bioquímica'],
      ],
    )
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1)).toBe(
      'Exame;Categoria\r\n"Hemácias; série vermelha";Hematologia\r\n"Glicose ""jejum""";Bioquímica\r\n',
    )
  })
})
