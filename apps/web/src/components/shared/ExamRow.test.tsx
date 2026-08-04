import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ExamRow } from './ExamRow'
import { laudoToExam, resultadoToExam } from '../../lib/mappers'
import type { Laudo, Resultado } from '@lab-hub/shared'

// A linha da lista é o primeiro contato do paciente com o resultado. O que ela
// afirma — quando foi coletado, onde — precisa bater com o laudo e com a ordem
// em que a lista aparece.

function laudo(over: Partial<Laudo> = {}): Laudo {
  return {
    id: 'l-1',
    name: 'Hemograma Completo',
    category: 'Hematologia',
    date: '28 Jul 2026',
    fullDate: '28 de julho de 2026',
    data_coleta: '2026-07-24',
    data_registro: '2026-07-24',
    data_emissao: '2026-07-28',
    material: '',
    metodo: '',
    laboratorio: { nome: '', cnes: '', endereco: '' },
    unit: '',
    doctor: 'Dra. Ana Lima',
    crm: 'CRM/DF 12345',
    status: 'ready',
    summary: '',
    panels: [],
    exam_type: 'Hemograma',
    codigo_os: '',
    codigo_lis: 'REQ-1',
    source: 'aplis',
    partial: false,
    ...over,
  } as Laudo
}

const render1 = (exam: Parameters<typeof ExamRow>[0]['exam']) =>
  render(<ExamRow exam={exam} onClick={() => {}} dark={false} />)

// O contexto (unidade · data) aparece DUAS vezes no DOM: uma célula para o
// layout de celular e outra para o de desktop, alternadas por CSS. Em jsdom as
// classes do Tailwind não se aplicam, então as duas contam — daí asserções
// sobre o texto do container em vez de queries que exigem nó único.
describe('data exibida na lista', () => {
  it('mostra a COLETA, que é a chave por que a lista é ordenada', () => {
    // Exibir a emissão (28/07) numa lista ordenada por coleta (24/07) faz as
    // linhas parecerem fora de ordem cronológica.
    const { container } = render1(laudoToExam(laudo()))

    expect(container.textContent).toContain('Coleta 24 Jul 2026')
    expect(container.textContent).not.toContain('28 Jul 2026')
  })

  it('cai para a data de exibição quando não há coleta', () => {
    const resultado = { id: 'r-1', exameNome: 'Colesterol', categoria: 'Bioquímica', status: 'ready', liberadoEm: '2026-05-10T00:00:00.000Z', resumo: '', paineis: [] } as unknown as Resultado
    const { container } = render1(resultadoToExam(resultado))

    // Sem coleta não há rótulo "Coleta" — a data mostrada é a de liberação.
    expect(container.textContent).not.toContain('Coleta')
    expect(container.textContent).toMatch(/de \w+\.? de 2026/)
  })
})

describe('versão anterior', () => {
  const resultado = (over: Partial<Resultado> = {}): Resultado =>
    ({
      id: 'r-1',
      exameNome: 'Hemograma completo',
      categoria: 'Hematologia',
      status: 'ready',
      liberadoEm: '2026-08-01T00:00:00.000Z',
      resumo: '',
      paineis: [],
      ...over,
    }) as unknown as Resultado

  it('marca a linha quando o resultado foi substituído', () => {
    const { container } = render1(resultadoToExam(resultado({ retificadoPor: 'r-2' })))

    expect(container.textContent).toContain('Versão anterior')
  })

  it('não marca o resultado vigente', () => {
    const { container } = render1(resultadoToExam(resultado()))

    expect(container.textContent).not.toContain('Versão anterior')
  })

  // O selo diz qual das duas linhas é a antiga; o status continua sendo sobre a
  // liberação do laudo. Um laudo substituído foi liberado de verdade — trocar o
  // status por "Versão anterior" apagaria essa informação e deixaria a linha
  // parecendo que nunca ficou pronta.
  it('não substitui o status do laudo', () => {
    const { container } = render1(resultadoToExam(resultado({ retificadoPor: 'r-2' })))

    expect(container.textContent).toContain('Liberado')
  })
})

describe('unidade', () => {
  it('não escreve travessão quando a unidade é desconhecida', () => {
    // O LIS deixou de mandar 'DASA'/'ApLIS' chutados; sem unidade real a linha
    // mostra só a data em vez de "— · 24 Jul 2026".
    const { container } = render1(laudoToExam(laudo({ unit: '' })))

    expect(container.textContent).not.toContain('—')
    expect(container.textContent).toContain('Coleta 24 Jul 2026')
  })

  it('mostra a unidade quando existe', () => {
    const { container } = render1(laudoToExam(laudo({ unit: 'Unidade Centro' })))

    expect(container.textContent).toContain('Unidade Centro · Coleta 24 Jul 2026')
  })
})
