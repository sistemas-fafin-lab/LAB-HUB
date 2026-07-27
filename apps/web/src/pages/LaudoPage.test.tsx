import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { LaudoPage } from './LaudoPage'
import { laudoToExam } from '../lib/mappers'
import type { Laudo, LaudoPainel } from '@lab-hub/shared'

// O laudo é o único artefato do app que sai do app: o paciente imprime e leva
// ao médico. Um campo errado aqui não é um detalhe de layout — é uma afirmação
// sobre o exame dele. Estes testes cobrem o que o papel AFIRMA, não como ele é
// estilizado.

vi.mock('../lib/usePaciente', () => ({
  usePaciente: () => ({
    paciente: { nome: 'Maria Souza', cpf: '52998224725', dataNascimento: '1990-03-14', sexo: 'F' },
  }),
}))
vi.mock('../lib/api', () => ({ api: { declaracao: vi.fn() } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

// `groups` fica FORA da base: com exactOptionalPropertyTypes, sobrescrever para
// `undefined` não é permitido — então a variante com marcadores nasce sem o
// campo em vez de apagá-lo.
function base(): Omit<Laudo, 'groups'> {
  return {
    id: '453da785-aff2-4329-97e7-d41b3abe4f24',
    name: 'COLPOCITOLOGIA ONCÓTICA',
    category: 'Citologia',
    date: '28 Jul 2026',
    fullDate: '28 de julho de 2026',
    data_coleta: '2026-07-24',
    data_registro: '2026-07-24',
    data_emissao: '2026-07-28',
    material: 'Citologia em Meio Líquido',
    metodo: 'Papanicolaou',
    laboratorio: { nome: 'Lab Hub', cnes: '', endereco: '' },
    unit: 'Lab Hub',
    doctor: 'Dra. Larissa Mendes',
    crm: 'CRM-DF 15750',
    status: 'ready',
    summary: '',
    panels: [],
    exam_type: 'COLPOCITOLOGIA',
    codigo_os: '',
    codigo_lis: 'COLP-001',
    source: 'aplis',
    partial: false,
  } as Omit<Laudo, 'groups'>
}

const painel = (over: Partial<LaudoPainel> = {}): LaudoPainel =>
  ({ name: 'Glicose', value: '92', unit: 'mg/dL', ref: '70 a 99', ok: true, trend: [], ...over }) as LaudoPainel

/** Laudo descritivo (citologia/patologia): seções de texto, sem marcadores. */
function laudo(over: Partial<Laudo> = {}): Laudo {
  return {
    ...base(),
    groups: [
      {
        name: 'CONCLUSÃO',
        panels: [{ name: '', value: 'NEGATIVO PARA LESÃO.', unit: '', ref: '', ok: true, trend: [] }],
      },
    ],
    ...over,
  } as Laudo
}

/** Laudo quantitativo: tabela de marcadores, sem seções descritivas. */
function laudoComMarcadores(over: Partial<Laudo> = {}): Laudo {
  return { ...base(), panels: [painel()], ...over } as Laudo
}

/** Renderiza e devolve o texto da folha que sai na impressora. */
function papel(l: Laudo): string {
  const { container } = render(<LaudoPage exam={laudoToExam(l)} onBack={() => {}} dark={false} />)
  return container.querySelector('.laudo-imprimivel')!.textContent ?? ''
}

describe('datas de coleta e liberação', () => {
  it('mostra a data de COLETA no campo Coleta, não a da liberação', () => {
    // O caso real: coleta 24/07, laudo liberado 28/07. O card exibe 28/07
    // (`fullDate` = emissão), e era essa a data que aparecia nos dois campos.
    const texto = papel(laudo())

    expect(texto).toContain('Coleta24 de julho de 2026')
    expect(texto).toContain('Liberação28 de julho de 2026')
  })

  it('não inventa data de coleta quando a fonte não informa', () => {
    // Resultado do FlowLab chega só com a liberação. Repetir a emissão no campo
    // "Coleta" afirmaria um dia de coleta que ninguém registrou.
    const texto = papel(laudo({ data_coleta: '', data_emissao: '2026-07-28' }))

    expect(texto).toContain('Coleta—')
    expect(texto).toContain('Liberação28 de julho de 2026')
  })

  it('formata a data sem deslocar o dia pelo fuso', () => {
    // "2026-07-01" vira meia-noite UTC; formatada em Brasília (UTC-3) daria
    // 30 de junho. Um dia a menos numa data de coleta é erro de laudo.
    const texto = papel(laudo({ data_coleta: '2026-07-01', data_emissao: '2026-07-01' }))

    expect(texto).toContain('01 de julho de 2026')
    expect(texto).not.toContain('junho')
  })
})

describe('subtítulo do exame', () => {
  it('não chama laudo descritivo de "análise quantitativa"', () => {
    // Citologia/biópsia não têm marcador numérico nem faixa de referência.
    const texto = papel(laudo())

    expect(texto).not.toContain('Análise quantitativa')
  })

  it('mantém o subtítulo no laudo de marcadores', () => {
    const texto = papel(laudoComMarcadores())

    expect(texto).toContain('Análise quantitativa dos principais marcadores')
  })

  it('não atribui as faixas de referência à SBAC', () => {
    // As faixas vêm do <valorreferencia> da AOL; citar uma diretriz seria
    // afirmar uma origem que o dado não tem.
    expect(papel(laudoComMarcadores())).not.toContain('SBAC')
  })
})

describe('identificação do documento', () => {
  it('usa o código do laboratório como "Laudo nº", não o UUID interno', () => {
    const texto = papel(laudo())

    expect(texto).toContain('Laudo nºCOLP-001')
    // `exam.id` é sorteado a cada mapeamento: dois carimbos para o mesmo exame.
    expect(texto).not.toContain('453DA785')
  })

  it('cai para a OS da AOL quando o laudo não tem código no ApLIS', () => {
    expect(papel(laudo({ codigo_lis: null, codigo_os: '778899' }))).toContain('Laudo nº778899')
  })

  it('omite o bloco inteiro quando não há número nenhum', () => {
    const texto = papel(laudo({ codigo_lis: null, codigo_os: '' }))

    expect(texto).not.toContain('Laudo nº')
  })

  it('"Gerado em" é a data desta cópia, não a do exame', () => {
    const hoje = new Date()
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const esperado = `${String(hoje.getDate()).padStart(2, '0')} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`

    // O laudo é de julho/2026; a cópia é impressa hoje.
    expect(papel(laudo())).toContain(`Gerado em ${esperado}`)
  })

  it('não imprime CNPJ, endereço nem telefone de mockup', () => {
    // Campos que dizem QUEM RESPONDE pelo exame; ocultos até virem da
    // configuração real do laboratório (MOSTRAR_LAUDO_DADOS_INSTITUICAO).
    const texto = papel(laudo())

    expect(texto).not.toContain('12.345.678/0001-90')
    expect(texto).not.toContain('SGAS 915')
    expect(texto).not.toContain('0800 123 4567')
  })
})

describe('tema escuro', () => {
  it('a barra de ações acompanha o tema', () => {
    // A folha do laudo é sempre branca (é um documento), mas os botões ficam
    // FORA dela, sobre o fundo do app. Em cinza-claro sobre gray-950 o "Voltar"
    // ficava com contraste ~2,5:1.
    const { getByText } = render(
      <LaudoPage exam={laudoToExam(laudo())} onBack={() => {}} dark={true} />,
    )
    const voltar = getByText('Voltar').closest('button')!

    expect(voltar.className).toContain('text-gray-300')
    expect(voltar.className).not.toContain('text-slate-600')
  })
})

describe('laboratório executor', () => {
  it('omite a linha quando o LIS não informa o executor', () => {
    // Antes caía no fallback 'DASA – Diagnósticos da América', nomeando um
    // terceiro como responsável técnico pela análise.
    const texto = papel(
      laudo({ unit: '', laboratorio: { nome: '', cnes: '', endereco: '' } }),
    )

    expect(texto).not.toContain('DASA')
    expect(texto).not.toContain('—')
  })

  it('mostra o executor quando o LIS informa', () => {
    const texto = papel(
      laudo({ laboratorio: { nome: 'Laboratório Central', cnes: '', endereco: '' } }),
    )

    expect(texto).toContain('Laboratório Central')
  })
})

describe('observações clínicas', () => {
  it('separa o texto do LIS do aviso padrão do app', () => {
    const { container } = render(
      <LaudoPage exam={laudoToExam(laudo({ summary: 'Citologia negativa.' }))} onBack={() => {}} dark={false} />,
    )
    const bloco = [...container.querySelectorAll('p')].map((p) => p.textContent)

    // Concatenados, o aviso genérico era lido como parecer do laboratório
    // sobre ESTE exame.
    expect(bloco).toContain('Citologia negativa.')
    expect(bloco.some((t) => t?.startsWith('Este resultado não é um diagnóstico'))).toBe(true)
  })
})
