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

function folhas(l: Laudo): HTMLElement {
  const { container } = render(<LaudoPage exam={laudoToExam(l)} onBack={() => {}} dark={false} />)
  // `.laudo-medicao` é a cópia escondida que só existe para medir alturas; o
  // que o paciente imprime são as folhas de verdade.
  return container.querySelector<HTMLElement>('.laudo-folhas:not(.laudo-medicao)')!
}

/** Renderiza e devolve o texto das folhas que saem na impressora. */
const papel = (l: Laudo): string => folhas(l).textContent ?? ''

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
    // "Coleta" afirmaria um dia de coleta que ninguém registrou — e o campo
    // some inteiro em vez de imprimir um travessão.
    const texto = papel(laudo({ data_coleta: '', data_emissao: '2026-07-28' }))

    expect(texto).not.toContain('Coleta')
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

describe('formato do corpo do laudo', () => {
  it('laudo descritivo sai como texto, sem tabela de analitos', () => {
    // Citologia/biópsia não têm marcador numérico nem faixa de referência: uma
    // tabela "Analito / Resultado / Intervalo de referência" prometeria colunas
    // que este exame não tem.
    const folha = folhas(laudo())

    expect(folha.querySelector('table')).toBeNull()
    expect(folha.textContent).toContain('NEGATIVO PARA LESÃO.')
  })

  it('laudo de marcadores sai na tabela de analitos', () => {
    const folha = folhas(laudoComMarcadores())

    expect(folha.querySelector('table')).not.toBeNull()
    expect(folha.textContent).toContain('Intervalo de referência')
    expect(folha.textContent).toContain('Glicose')
  })

  it('não atribui as faixas de referência à SBAC', () => {
    // As faixas vêm do <valorreferencia> da AOL; citar uma diretriz seria
    // afirmar uma origem que o dado não tem.
    expect(papel(laudoComMarcadores())).not.toContain('SBAC')
  })
})

describe('contadores do cabeçalho', () => {
  it('conta como "dentro da referência" só o analito que TEM referência', () => {
    // Marcador sem faixa chega com `ok: true` por construção (ver
    // mapperHelpers.ts na API) — contá-lo como normal afirmaria uma
    // normalidade que ninguém verificou.
    const texto = papel(
      laudoComMarcadores({
        panels: [
          painel({ name: 'Glicose', ref: '70 a 99', ok: true }),
          painel({ name: 'Observação', value: 'Amostra lipêmica', ref: '', ok: true }),
        ],
      }),
    )

    expect(texto).toContain('2 analitos')
    expect(texto).toContain('1 dentro da referência')
    expect(texto).toContain('0 alterados')
  })

  it('não mostra contadores quando nenhum analito tem referência', () => {
    const texto = papel(
      laudoComMarcadores({ panels: [painel({ ref: '', ok: true })] }),
    )

    expect(texto).not.toContain('dentro da referência')
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

  it('"Data da geração" é a data desta cópia, não a do exame', () => {
    const hoje = new Date()
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const esperado = `${String(hoje.getDate()).padStart(2, '0')} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`

    // O laudo é de julho/2026; a cópia é impressa hoje.
    expect(papel(laudo())).toContain(`Data da geração${esperado}`)
  })

  it('numera as páginas', () => {
    // Uma folha só nos testes (jsdom não tem layout, então nada transborda),
    // mas o "de Y" precisa existir: página solta sem numeração não dá para
    // conferir se o laudo está completo.
    expect(papel(laudo())).toContain('Pág. 1 de 1')
  })

  it('não imprime CNPJ, endereço, telefone nem assinatura de mockup', () => {
    // Campos que dizem QUEM RESPONDE pelo exame. O documento novo não tem
    // nenhum deles em texto fixo: só voltam como campo do modelo, vindo do LIS.
    const texto = papel(laudo())

    expect(texto).not.toContain('12.345.678/0001-90')
    expect(texto).not.toContain('SGAS 915')
    expect(texto).not.toContain('0800 123 4567')
    expect(texto).not.toContain('Assinado digitalmente')
    expect(texto).not.toContain('Responsável técnico')
    expect(texto).not.toContain('Helena Pacheco')
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

describe('exportar PDF', () => {
  it('exporta a própria folha, sem um segundo layout', () => {
    // A folha da tela É o documento: o PDF sai da impressão dela. Se este
    // botão passasse a baixar outro arquivo, o app teria dois laudos com
    // estruturas diferentes para o mesmo exame.
    const print = vi.fn()
    vi.stubGlobal('print', print)

    const { getByText } = render(
      <LaudoPage exam={laudoToExam(laudo())} onBack={() => {}} dark={false} />,
    )
    getByText('Exportar PDF').closest('button')!.click()

    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
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
  it('separa o parecer do laboratório do aviso padrão do app', () => {
    // Concatenados, o aviso genérico era lido como parecer do laboratório
    // sobre ESTE exame. São autorias diferentes: o parecer fica no corpo, o
    // aviso no rodapé de toda página.
    const folha = folhas(laudo({ summary: 'Citologia negativa.' }))

    expect(folha.querySelector('.exnote')!.textContent).toContain('Citologia negativa.')
    expect(folha.querySelector('.exnote')!.textContent).not.toContain('ato médico')
    expect(folha.querySelector('.disc')!.textContent).toContain('ato médico')
  })
})
