import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BillingPage } from './BillingPage'

// Conteúdo estático, como hoje (a tela está atrás de MOSTRAR_FATURAMENTO): não
// há hook nem API para dublar.

const secao = (titulo: string) => within(screen.getByRole('region', { name: titulo }))

/** Valor que acompanha o rótulo `rotulo` numa lista de termos e definições. */
function valorDe(escopo: ReturnType<typeof secao>, rotulo: string): string {
  const termos = escopo.getAllByRole('term').map((t) => t.textContent)
  const definicoes = escopo.getAllByRole('definition').map((d) => d.textContent)
  return definicoes[termos.indexOf(rotulo)] ?? ''
}

describe('cabeçalho', () => {
  it('mostra o título e a descrição', () => {
    render(<BillingPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Faturamento' })).toBeTruthy()
    expect(screen.getByText('Plano, formas de pagamento e histórico de notas fiscais.')).toBeTruthy()
  })
})

describe('plano atual', () => {
  it('traz o plano, a descrição, a mensalidade e o próximo débito de hoje', () => {
    render(<BillingPage />)
    const plano = secao('Plano atual')
    expect(plano.getByRole('heading', { name: 'Lab Hub Care' })).toBeTruthy()
    expect(plano.getByText(/Coletas em domicílio ilimitadas/)).toBeTruthy()
    expect(valorDe(plano, 'Mensalidade')).toBe('R$ 89,90')
    expect(valorDe(plano, 'Próximo débito')).toBe('15 mai 2026')
  })
})

describe('histórico de cobranças', () => {
  it('lista as quatro cobranças de hoje, com descrição, nota, data, valor e situação', () => {
    render(<BillingPage />)
    const itens = secao('Histórico de cobranças').getAllByRole('listitem')
    expect(itens).toHaveLength(4)

    const [primeira, , , estornada] = itens.map((li) => within(li))
    expect(primeira?.getByText('Hemograma + Perfil lipídico')).toBeTruthy()
    expect(primeira?.getByText('INV-2310 · 15 out 2025')).toBeTruthy()
    expect(primeira?.getByText('R$ 312,00')).toBeTruthy()
    expect(primeira?.getByText('Pago')).toBeTruthy()

    expect(estornada?.getByText('Glicemia + Colesterol total')).toBeTruthy()
    expect(estornada?.getByText('R$ 142,00')).toBeTruthy()
    expect(estornada?.getByText('Estornado')).toBeTruthy()
  })
})

describe('formas de pagamento', () => {
  it('mostra os cartões de hoje, com o principal marcado, e o PIX', () => {
    render(<BillingPage />)
    const formas = secao('Formas de pagamento')
    const itens = formas.getAllByRole('listitem').map((li) => within(li))
    expect(itens).toHaveLength(3)

    expect(itens[0]?.getByText('Visa ···· 4821')).toBeTruthy()
    expect(itens[0]?.getByText('Validade 08/29')).toBeTruthy()
    expect(itens[0]?.getByText('Principal')).toBeTruthy()

    expect(itens[1]?.getByText('Mastercard ···· 1192')).toBeTruthy()
    expect(itens[1]?.getByText('Validade 11/27')).toBeTruthy()
    expect(itens[1]?.queryByText('Principal')).toBeNull()

    expect(itens[2]?.getAllByText('PIX').length).toBeGreaterThan(0)
    expect(itens[2]?.getByText('Aprovação imediata')).toBeTruthy()
  })
})

describe('resumo do mês', () => {
  it('traz os mesmos valores de hoje', () => {
    render(<BillingPage />)
    const resumo = secao('Resumo do mês')
    expect(valorDe(resumo, 'Gasto até hoje')).toBe('R$ 312,00')
    expect(valorDe(resumo, 'Reembolsado pelo plano')).toBe('− R$ 124,80')
    expect(valorDe(resumo, 'Custo líquido')).toBe('R$ 187,20')
  })
})

describe('sem controles sem backend', () => {
  it('não há trocar plano, gerenciar, adicionar cartão, tornar principal, exportar nem baixar NFS-e', () => {
    render(<BillingPage />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
