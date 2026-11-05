import { describe, expect, it } from 'vitest'
import { nomeDoExame } from './nomeDoExame'

describe('nomeDoExame', () => {
  it.each([
    // Nomes reais do cadastro de exames do laboratório.
    ['BACTERIOSCOPIA', 'Bacterioscopia'],
    ['COLPOCITOLOGIA ONCÓTICA EM MEIO LÍQUIDO', 'Colpocitologia oncótica em meio líquido'],
    ['PCR EM TEMPO REAL DE HPV BAIXO/ALTO RISCO', 'PCR em tempo real de HPV baixo/alto risco'],
    ['BIÓPSIA  SOE', 'Biópsia  SOE'],
    ['IMUNOISTOQUÍMICA EXTERNA (BLOCO+LÂMINA)', 'Imunoistoquímica externa (bloco+lâmina)'],
    ['PCR', 'PCR'],
    // Termos com número ficam como vieram.
    ['TSH E T4 LIVRE', 'TSH e T4 livre'],
    ['VITAMINA B12', 'Vitamina B12'],
    ['COLESTEROL HDL', 'Colesterol HDL'],
  ])('"%s" → "%s"', (nome, esperado) => {
    expect(nomeDoExame(nome)).toBe(esperado)
  })

  it('nome que já vem em maiúsculas e minúsculas fica como está', () => {
    expect(nomeDoExame('Hemograma completo')).toBe('Hemograma completo')
    expect(nomeDoExame('PAAF - Procedimento Lâmina de PAAF até 5 Lâminas.')).toBe(
      'PAAF - Procedimento Lâmina de PAAF até 5 Lâminas.',
    )
  })

  it('vazio continua vazio', () => {
    expect(nomeDoExame('')).toBe('')
  })
})
