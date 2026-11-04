import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TrendsPage } from './TrendsPage'

// Conteúdo estático, como hoje (a tela está atrás de MOSTRAR_TENDENCIAS): não
// há hook nem API para dublar.

const cartao = (marcador: string) => screen.getByRole('region', { name: marcador })

describe('cabeçalho', () => {
  it('mostra o título e a descrição', () => {
    render(<TrendsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Como você está evoluindo' })).toBeTruthy()
    expect(
      screen.getByText('Comparação dos seus principais marcadores ao longo do tempo, em linguagem simples.'),
    ).toBeTruthy()
  })
})

describe('resumo', () => {
  it('traz o mesmo resumo de hoje', () => {
    render(<TrendsPage />)
    const resumo = screen.getByRole('region', { name: 'Em resumo' })
    expect(resumo.textContent).toContain('De 4 marcadores acompanhados, 3 estão na faixa ideal e 1 precisa de atenção (LDL).')
    expect(resumo.textContent).toContain('Considere agendar retorno com a Dra. Renata.')
  })
})

describe('marcadores', () => {
  it.each([
    ['Colesterol LDL', '138', 'mg/dL', '+12 nos últimos 6 meses', 'Está acima do valor recomendado (até 130 mg/dL).'],
    ['Vitamina D', '42', 'ng/mL', '+18 desde a suplementação', 'Você está dentro da faixa ideal (30–60).'],
    ['Glicemia em jejum', '92', 'mg/dL', 'Estável há 3 coletas', 'Continue mantendo a rotina de exames anuais.'],
    ['Hemoglobina', '14,2', 'g/dL', '+0,3 desde a última coleta', 'Dentro da referência (13,0–17,5).'],
  ])('%s: valor, unidade, variação e nota de hoje', (marcador, valor, unidade, variacao, nota) => {
    render(<TrendsPage />)
    const c = within(cartao(marcador))
    expect(c.getByText(valor)).toBeTruthy()
    expect(c.getByText(unidade)).toBeTruthy()
    expect(c.getByText(variacao)).toBeTruthy()
    expect(c.getByText(nota, { exact: false })).toBeTruthy()
  })

  it('mostra o resumo e os quatro marcadores, nesta ordem', () => {
    render(<TrendsPage />)
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Em resumo', 'Colesterol LDL', 'Vitamina D', 'Glicemia em jejum', 'Hemoglobina'])
  })
})

describe('sem controles sem backend', () => {
  it('a tela não tem botões nem links', () => {
    render(<TrendsPage />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
