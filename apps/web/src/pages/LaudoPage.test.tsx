import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { LaudoPage } from './LaudoPage'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { avisar } from '../lib/avisos'
import { laudoToExam } from '../lib/mappers'
import type { Laudo, LaudoPainel } from '@lab-hub/shared'

// O laudo é o único artefato do app que sai do app: o paciente imprime e leva
// ao médico. Um campo errado aqui não é um detalhe de layout — é uma afirmação
// sobre o exame dele. Estes testes cobrem o que o papel AFIRMA, não como ele é
// estilizado.

const MARIA = { nome: 'Maria Souza', cpf: '52998224725', dataNascimento: '1990-03-14', sexo: 'F' }
const sessao = vi.hoisted(() => ({
  paciente: null as object | null,
  loading: false,
  error: null as string | null,
}))
const flags = vi.hoisted(() => ({ enviarAoMedico: false }))

vi.mock('../lib/usePaciente', () => ({ usePaciente: () => sessao }))
vi.mock('../lib/api', () => ({ api: { declaracao: vi.fn() } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../lib/avisos', () => ({ avisar: vi.fn() }))
vi.mock('../lib/flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/flags')>()),
  get MOSTRAR_ENVIAR_AO_MEDICO() {
    return flags.enviarAoMedico
  },
}))

sessao.paciente = MARIA

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.assign(sessao, { paciente: MARIA, loading: false, error: null })
  flags.enviarAoMedico = false
})

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
  const { container } = render(<LaudoPage exam={laudoToExam(l)} onBack={() => {}} />)
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
  it('laudo descritivo sai como texto, sem tabela de marcadores', () => {
    // Citologia/biópsia não têm marcador numérico nem faixa de referência: uma
    // tabela "Analito / Resultado / Intervalo de referência" prometeria colunas
    // que este exame não tem.
    const folha = folhas(laudo())

    expect(folha.querySelector('table')).toBeNull()
    expect(folha.textContent).toContain('NEGATIVO PARA LESÃO.')
  })

  it('laudo de marcadores sai na tabela de marcadores', () => {
    const folha = folhas(laudoComMarcadores())

    expect(folha.querySelector('table')).not.toBeNull()
    expect(folha.textContent).toContain('Referência')
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

    expect(texto).toContain('2 marcadores')
    expect(texto).toContain('1 dentro da referência')
    expect(texto).toContain('0 alterados')
  })

  it('explica na legenda o marcador alterado sem lado definido', () => {
    // Sem a cor, o "•" sozinho na tabela não diria nada no papel.
    const alterado = painel({ value: 'Reagente', ref: 'Não reagente', ok: false })

    expect(papel(laudoComMarcadores({ panels: [alterado] }))).toContain('•Fora da referência')
    cleanup()
    expect(papel(laudoComMarcadores())).not.toContain('Fora da referência')
  })

  it('não mostra contadores quando nenhum analito tem referência', () => {
    const texto = papel(
      laudoComMarcadores({ panels: [painel({ ref: '', ok: true })] }),
    )

    expect(texto).not.toContain('dentro da referência')
  })
})

describe('todos os campos no papel', () => {
  it('imprime identificação, datas, responsáveis, material, método e rodapé', () => {
    const texto = papel(
      laudoComMarcadores({
        summary: 'Amostra adequada.',
        laboratorio: { nome: 'Laboratório Central', cnes: '', endereco: '' },
      }),
    )

    for (const trecho of [
      'Medicina diagnóstica',
      'Laudo nºCOLP-001',
      'Maria Souza',
      'Laudo · Citologia',
      'SexoF',
      'Data de nascimento14/03/1990 · ',
      'CPF529.982.247-25',
      'Médico solicitanteDra. Larissa Mendes · CRM-DF 15750',
      'Coleta24 de julho de 2026',
      'Liberação28 de julho de 2026',
      'Laboratório executorLaboratório Central',
      'Data da geração',
      'COLPOCITOLOGIA ONCÓTICA',
      'Material: Citologia em Meio Líquido',
      'Método: Papanicolaou',
      'Observações do laboratório',
      'Amostra adequada.',
      'A interpretação deste resultado é ato médico',
      'Lab Hub · labhub.com.br',
      '92',
      'mg/dL',
      '70 a 99',
    ]) {
      expect(texto).toContain(trecho)
    }
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

describe('barra de ações', () => {
  const abre = (l: Laudo = laudo(), extra: { declaracaoUrl?: string } = {}, onBack = () => {}) =>
    render(<LaudoPage exam={{ ...laudoToExam(l), ...extra }} onBack={onBack} />)

  it('fica fora da folha: nenhum botão sai no papel', () => {
    // A folha é papel e segue branca no tema escuro; só a barra acompanha o tema.
    abre(laudo(), { declaracaoUrl: 'decl/1.pdf' })
    const folha = document.querySelector<HTMLElement>('.laudo-folhas:not(.laudo-medicao)')!

    expect(within(folha).queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: 'Exame' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeTruthy()
  })

  it('volta para o exame', () => {
    const onBack = vi.fn()
    abre(laudo(), {}, onBack)

    fireEvent.click(screen.getByRole('button', { name: 'Exame' }))

    expect(onBack).toHaveBeenCalledOnce()
  })

  it('exporta a própria folha, sem um segundo layout', () => {
    // A folha da tela É o documento: o PDF sai da impressão dela. Se este
    // botão passasse a baixar outro arquivo, o app teria dois laudos com
    // estruturas diferentes para o mesmo exame.
    const print = vi.fn()
    vi.stubGlobal('print', print)
    abre()

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }))

    expect(print).toHaveBeenCalledOnce()
    expect(track).toHaveBeenCalledWith('laudo_imprimir')
  })

  it('sem declaração, não oferece o laudo original', () => {
    abre()

    expect(screen.queryByRole('button', { name: 'Laudo original' })).toBeNull()
    expect(api.declaracao).not.toHaveBeenCalled()
  })

  it('abre o laudo original com a URL assinada buscada na hora', async () => {
    vi.mocked(api.declaracao).mockResolvedValue({ url: 'https://assinada/1' } as never)
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const exam = { ...laudoToExam(laudo()), declaracaoUrl: 'decl/1.pdf' }
    render(<LaudoPage exam={exam} onBack={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Laudo original' }))

    expect(track).toHaveBeenCalledWith('laudo_download', { origem: 'laudo' })
    expect(api.declaracao).toHaveBeenCalledWith(exam.id)
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://assinada/1', '_blank', 'noopener'))
  })

  it('avisa quando o laudo original falha, em vez de não fazer nada', async () => {
    vi.mocked(api.declaracao).mockRejectedValue(new Error('expirou'))
    abre(laudo(), { declaracaoUrl: 'decl/1.pdf' })

    fireEvent.click(screen.getByRole('button', { name: 'Laudo original' }))

    await waitFor(() =>
      expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível baixar o PDF' })),
    )
  })

  it('"Enviar ao médico" só aparece com a flag ligada', () => {
    abre()
    expect(screen.queryByRole('button', { name: 'Enviar ao médico' })).toBeNull()
    cleanup()

    flags.enviarAoMedico = true
    abre()
    expect(screen.getByRole('button', { name: 'Enviar ao médico' })).toBeTruthy()
  })
})

describe('estados da tela', () => {
  const abre = (l: Laudo = laudo(), onBack = () => {}) =>
    render(<LaudoPage exam={laudoToExam(l)} onBack={onBack} />)

  it('laudo sem conteúdo e ainda não liberado não vira folha em branco', () => {
    const onBack = vi.fn()
    abre(laudo({ status: 'pending', groups: [], panels: [] }), onBack)

    expect(screen.getByText('Laudo ainda não liberado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull()
    expect(screen.queryByText(/^Pág\./)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao exame' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('resultado parcial que já tem marcadores continua saindo no papel', () => {
    // O bloqueio é da folha vazia: quem já tem marcadores hoje vê e imprime.
    expect(papel(laudoComMarcadores({ status: 'partial' }))).toContain('Glicose')
    expect(screen.queryByText('Laudo ainda não liberado')).toBeNull()
  })

  it('não oferece imprimir enquanto os dados do paciente carregam', () => {
    // Sem isso, a folha sairia sem nome nem CPF de quem é o exame.
    Object.assign(sessao, { paciente: null, loading: true })
    abre()

    expect(screen.getByRole('status').textContent).toContain('Carregando laudo')
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Exame' })).toBeTruthy()
  })

  it('sem os dados do paciente, mostra o erro em vez de um laudo sem identificação', () => {
    Object.assign(sessao, { paciente: null, error: 'Falha na rede' })
    abre()

    expect(screen.getByText('Não foi possível carregar o laudo')).toBeTruthy()
    expect(screen.getByText('Falha na rede')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
  })
})

describe('declaração sem a folha', () => {
  it('o laudo original continua disponível quando a folha não pode ser montada', () => {
    Object.assign(sessao, { paciente: null, error: 'Falha na rede' })
    render(<LaudoPage exam={{ ...laudoToExam(laudo()), declaracaoUrl: 'decl/1.pdf' }} onBack={() => {}} />)

    expect(screen.getByRole('button', { name: 'Laudo original' })).toBeTruthy()
  })
})

describe('paginação', () => {
  // O jsdom não tem layout: a altura de cada elemento é dublada pelo conteúdo
  // (100 px por parágrafo ou linha de tabela, 20 px pelo resto). A folha A4 tem
  // 1122 px de altura, então cabem cerca de 10 desses blocos em cada uma.
  function alturasDubladas() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const proprio = this.matches('p') || this.matches('tbody tr') ? 1 : 0
      const blocos = this.querySelectorAll('p, tbody tr').length + proprio
      return { height: blocos * 100 + (proprio ? 0 : 20) } as DOMRect
    })
  }
  const sheets = () =>
    [...document.querySelectorAll('.laudo-folhas:not(.laudo-medicao) .sheet')] as HTMLElement[]

  it('seção maior que uma folha continua na seguinte, sem perder parágrafo', () => {
    // A folha corta o que transborda: uma seção indivisível perderia o final
    // do texto no papel, sem aviso nenhum.
    alturasDubladas()
    const paragrafos = Array.from({ length: 25 }, (_, i) => ({
      name: '', value: `Parágrafo ${i + 1} da microscopia.`, unit: '', ref: '', ok: true, trend: [],
    }))
    render(
      <LaudoPage
        exam={laudoToExam(laudo({ groups: [{ name: 'MICROSCOPIA', panels: paragrafos }] }))}
        onBack={() => {}}
      />,
    )

    const folhas = sheets()
    expect(folhas.length).toBeGreaterThan(1)
    expect(folhas[0]!.textContent).toContain(`Pág. 1 de ${folhas.length}`)
    for (const folha of folhas) {
      expect(folha.textContent!.match(/Parágrafo \d+/g)!.length).toBeLessThanOrEqual(10)
    }
    const texto = folhas.map((f) => f.textContent).join('\n')
    for (let i = 1; i <= 25; i++) {
      expect(texto.split(`Parágrafo ${i} da microscopia.`)).toHaveLength(2)
    }
  })

  it('tabela grande quebra por linha e reabre com o cabeçalho na folha seguinte', () => {
    alturasDubladas()
    const panels = Array.from({ length: 25 }, (_, i) => painel({ name: `Marcador ${i + 1}` }))
    render(<LaudoPage exam={laudoToExam(laudoComMarcadores({ panels }))} onBack={() => {}} />)

    const folhas = sheets()
    expect(folhas.length).toBeGreaterThan(1)
    for (const folha of folhas) {
      expect(within(folha).getByRole('columnheader', { name: 'Marcador' })).toBeTruthy()
    }
    const texto = folhas.map((f) => f.textContent).join('\n')
    for (let i = 1; i <= 25; i++) {
      expect(texto).toContain(`Marcador ${i}92mg/dL70 a 99`)
    }
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
