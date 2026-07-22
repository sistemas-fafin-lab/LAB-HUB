import { describe, expect, it } from 'vitest'
import type { AolExam, AplisExam } from '../src/laudos/types.js'
import { analisesClinicasStrategy } from '../src/laudos/strategies/AnalisesClinicasStrategy.js'
import { genericStrategy } from '../src/laudos/strategies/GenericStrategy.js'
import {
  biopsiaGeralStrategy,
  citologiaBaseLiquidaStrategy,
} from '../src/laudos/strategies/LaudoTextoStrategy.js'
import { resolveStrategy } from '../src/laudos/registry.js'
import {
  buildDateStrings,
  buildSummaryQuantitative,
  isOutOfRange,
  normalizeMaterial,
  simplificaReferencia,
} from '../src/laudos/mapperHelpers.js'
import { distribuiReferencias } from '../src/laudos/aol.js'
import {
  parseLaudoTexto,
  parsePaineisMoleculares,
  parseResponsavel,
  stripHtml,
} from '../src/laudos/aplis.js'
import { consolidaLaudosDaOs, fundirPedidosPorColeta, mapAplisResult } from '../src/laudos/mappers.js'
import type { Laudo } from '../src/laudos/types.js'

// Testes do mapeamento LIS → Laudo. Tudo puro: não tocam rede nem banco.

const aolBase: AolExam = {
  codigo_os: 'OS1',
  data_solicitacao: '2026-05-15',
  data_liberacao: '2026-05-15',
  nome_exame: 'Glicose',
  codigo_tipo: '0040',
  status: 'normal',
  material: 'soro',
  metodo: 'Hexoquinase',
  doctor: 'Dr. Teste',
  crm_documento: 'CRM 1234',
  analitos: [{ nome: 'Glicose', valor: '95', unidade: 'mg/dL', referencia: '70 – 99' }],
}

describe('analisesClinicasStrategy', () => {
  it('converte analitos da AOL em marcadores', () => {
    const laudo = analisesClinicasStrategy.map(aolBase, null, 'cpf')

    expect(laudo.panels).toHaveLength(1)
    expect(laudo.panels[0]!.name).toBe('Glicose')
    expect(laudo.panels[0]!.ok).toBe(true)
  })

  it('marca o laudo como parcial quando não há dado do ApLIS', () => {
    const laudo = analisesClinicasStrategy.map(aolBase, null, 'cpf')

    expect(laudo.partial).toBe(true)
    expect(laudo.source).toBe('aol')
  })

  // A AOL é a fonte precisa dos valores; o ApLIS só completa a faixa de
  // referência, que o XML da AOL não traz.
  it('usa o valor da AOL e a referência do ApLIS', () => {
    const aol: AolExam = {
      ...aolBase,
      analitos: [{ nome: 'Glicose', valor: '95', unidade: 'mg/dL', referencia: null }],
    }
    const aplis: AplisExam = {
      codigo_lis: 'LIS1',
      data_solicitacao: null,
      data_liberacao: null,
      tipo_exame: 'Glicose',
      // Valor divergente de propósito: o da AOL é que deve aparecer.
      analitos: [{ nome: 'Glicose', resultado: '999', unidade: 'mg/dL', valor_referencia: '70 – 99' }],
    }

    const laudo = analisesClinicasStrategy.map(aol, aplis, 'cpf')

    expect(laudo.source).toBe('merged')
    expect(laudo.partial).toBe(false)
    expect(laudo.panels[0]!.value).toBe('95')
    expect(laudo.panels[0]!.ref).toBe('70 – 99')
  })

  it('casa o analito mesmo quando a AOL anexa o método ao nome', () => {
    const aol: AolExam = {
      ...aolBase,
      analitos: [{ nome: 'DHT - Ensaio Imunoenzimático', valor: '450', unidade: 'pg/mL', referencia: null }],
    }
    const aplis: AplisExam = {
      codigo_lis: 'LIS1',
      data_solicitacao: null,
      data_liberacao: null,
      tipo_exame: 'DHT',
      analitos: [{ nome: 'DHT', resultado: '450', unidade: 'pg/mL', valor_referencia: '30 - 85' }],
    }

    const laudo = analisesClinicasStrategy.map(aol, aplis, 'cpf')

    expect(laudo.panels[0]!.ref).toBe('30 - 85')
    // 450 está fora de 30–85: a referência do ApLIS é o que permite marcar isso.
    expect(laudo.panels[0]!.ok).toBe(false)
  })

  it('sem analito correspondente no ApLIS, o marcador fica sem referência', () => {
    const aplis: AplisExam = {
      codigo_lis: 'LIS1',
      data_solicitacao: null,
      data_liberacao: null,
      tipo_exame: 'Outro',
      analitos: [{ nome: 'Creatinina', resultado: '1,0', unidade: 'mg/dL', valor_referencia: '0,7 - 1,3' }],
    }

    const laudo = analisesClinicasStrategy.map(aolBase, aplis, 'cpf')

    expect(laudo.panels).toHaveLength(1)
    expect(laudo.panels[0]!.name).toBe('Glicose')
    expect(laudo.panels[0]!.ref).toBe('70 – 99') // veio da própria AOL, não do ApLIS
  })

  it('cai para os analitos do ApLIS quando a AOL não devolve nenhum', () => {
    const aplis: AplisExam = {
      codigo_lis: 'LIS1',
      data_solicitacao: null,
      data_liberacao: null,
      tipo_exame: 'Glicose',
      analitos: [{ nome: 'Glicose', resultado: '95', unidade: 'mg/dL', valor_referencia: '70 – 99' }],
    }

    const laudo = analisesClinicasStrategy.map({ ...aolBase, analitos: [] }, aplis, 'cpf')

    expect(laudo.panels).toHaveLength(1)
    expect(laudo.panels[0]!.value).toBe('95')
  })

  it('separa o hemograma nas três séries', () => {
    const aol: AolExam = {
      ...aolBase,
      nome_exame: 'Hemograma Completo',
      analitos: [
        { nome: 'Hemoglobina', valor: '14', unidade: 'g/dL', referencia: '12 – 16' },
        { nome: 'Leucócitos', valor: '6000', unidade: '/mm³', referencia: '4000 – 11000' },
        { nome: 'Plaquetas', valor: '200000', unidade: '/mm³', referencia: '150000 – 400000' },
      ],
    }

    const laudo = analisesClinicasStrategy.map(aol, null, 'cpf')

    expect(laudo.groups?.map((g) => g.name)).toEqual(['Série Branca', 'Série Vermelha', 'Plaquetas'])
  })

  it('deriva a categoria a partir do nome do exame', () => {
    expect(analisesClinicasStrategy.map(aolBase, null, 'cpf').category).toBe('Bioquímica')
  })
})

describe('estratégias de laudo em texto', () => {
  it('citologia vira um marcador único "Laudo"', () => {
    const aol: AolExam = {
      ...aolBase,
      analitos: [{ nome: 'Resultado', valor: 'Negativo', unidade: null, referencia: null }],
    }

    const laudo = citologiaBaseLiquidaStrategy.map(aol, null, 'cpf')

    expect(laudo.category).toBe('Citologia')
    expect(laudo.panels).toHaveLength(1)
    expect(laudo.panels[0]!.name).toBe('Laudo')
    expect(laudo.panels[0]!.value).toContain('Negativo')
  })

  it('sem analitos, cai no texto padrão', () => {
    const laudo = citologiaBaseLiquidaStrategy.map({ ...aolBase, analitos: [] }, null, 'cpf')

    expect(laudo.panels[0]!.value).toContain('Resultado disponível')
  })

  it('biópsia usa a mesma forma, com a categoria própria', () => {
    const laudo = biopsiaGeralStrategy.map(aolBase, null, 'cpf')

    expect(laudo.category).toBe('Biópsia')
    expect(laudo.panels[0]!.name).toBe('Laudo')
  })
})

describe('genericStrategy', () => {
  it('assume que o mapeamento está incompleto', () => {
    const laudo = genericStrategy.map(aolBase, null, 'cpf')

    expect(laudo.partial).toBe(true)
    expect(laudo.status).toBe('partial')
    expect(laudo.panels[0]!.value).toContain('Glicose')
  })
})

describe('resolveStrategy', () => {
  it('resolve pelo código exato', () => {
    expect(resolveStrategy('0085')).toBe(citologiaBaseLiquidaStrategy)
  })

  it('completa zeros à esquerda no código numérico', () => {
    expect(resolveStrategy('40')).toBe(analisesClinicasStrategy)
  })

  it('numérico desconhecido cai em análises clínicas', () => {
    expect(resolveStrategy('9999')).toBe(analisesClinicasStrategy)
  })

  it('resolve por palavra-chave no nome do exame', () => {
    expect(resolveStrategy('Colpocitologia Oncótica').map(aolBase, null, 'c').category).toBe('Citologia')
    expect(resolveStrategy('Biópsia de pele').map(aolBase, null, 'c').category).toBe('Biópsia')
  })

  it('sigla curta é análise clínica', () => {
    expect(resolveStrategy('TSH')).toBe(analisesClinicasStrategy)
  })

  it('nome irreconhecível cai na genérica', () => {
    expect(resolveStrategy('exame sem correspondência alguma')).toBe(genericStrategy)
  })
})

describe('buildSummaryQuantitative', () => {
  const painel = (name: string, ref: string, ok: boolean) => ({
    name, ref, ok, value: '1', unit: '', trend: [],
  })

  // Sem referência, `ok` é true por construção — o resumo não pode transformar
  // isso em "está tudo normal".
  it('não afirma normalidade quando nenhum analito tem referência', () => {
    const resumo = buildSummaryQuantitative([painel('Ferritina', '', true), painel('Ferro', '', true)])

    expect(resumo).not.toContain('dentro')
    expect(resumo).toContain('não enviou os valores de referência')
  })

  it('ressalva os analitos sem referência quando só alguns têm', () => {
    const resumo = buildSummaryQuantitative([
      painel('Glicose', '70 – 99', true),
      painel('Ferritina', '', true),
    ])

    expect(resumo).toContain('com referência informada')
    expect(resumo).toContain('1 analito(s) vieram sem valor de referência')
  })

  it('lista os que estão fora da faixa', () => {
    const resumo = buildSummaryQuantitative([
      painel('Glicose', '70 – 99', false),
      painel('Creatinina', '0,7 - 1,3', true),
    ])

    expect(resumo).toContain('1 analito(s) fora da referência: Glicose')
  })
})

describe('helpers de mapeamento', () => {
  it('lê a data no formato brasileiro do ApLIS', () => {
    expect(buildDateStrings('12/05/2026 14:12')).toEqual({
      date: '12 Mai 2026',
      fullDate: '12 de maio de 2026',
      iso: '2026-05-12',
    })
  })

  it('formato desconhecido é repassado cru, sem iso', () => {
    const d = buildDateStrings('data estranha')

    expect(d.date).toBe('data estranha')
    expect(d.iso).toBe('')
  })

  it('detecta valor fora da faixa nos formatos que os LIS usam', () => {
    expect(isOutOfRange('150', '70 – 99')).toBe(true)
    expect(isOutOfRange('95', '70 – 99')).toBe(false)
    expect(isOutOfRange('250', '< 200')).toBe(true)
    expect(isOutOfRange('30', '> 40')).toBe(true)
    // Vírgula decimal, como vem do ApLIS.
    expect(isOutOfRange('3,5', '4,0 - 5,0')).toBe(true)
  })

  it('não acusa nada quando a referência é texto livre', () => {
    expect(isOutOfRange('95', 'conforme método')).toBe(false)
    expect(isOutOfRange('Negativo', '70 – 99')).toBe(false)
    expect(isOutOfRange(null, '70 – 99')).toBe(false)
  })

  it('normaliza as variações de material da AOL', () => {
    expect(normalizeMaterial('soro ria')).toBe('Soro')
    expect(normalizeMaterial('sangue total edta')).toBe('Sangue Total com EDTA')
    // Material desconhecido é repassado como veio.
    expect(normalizeMaterial('líquor')).toBe('líquor')
  })

  it('normaliza o idOsLis digitado à mão na recepção', async () => {
    const { normalizaIdOsLis } = await import('../src/laudos/aol.js')
    // Letra "O" no lugar do zero — erro real visto na medição de 22/07/2026.
    expect(normalizaIdOsLis('OO4OOO1920006')).toBe('0040001920006')
    expect(normalizaIdOsLis('oo40002001001')).toBe('0040002001001')
    // CPF formatado perde os separadores.
    expect(normalizaIdOsLis('179.532.547-00')).toBe('17953254700')
    // Convenções alheias não viram código válido.
    expect(normalizaIdOsLis('SOL-2901101')).toBe('S0L2901101')
    expect(normalizaIdOsLis('')).toBe('')
  })

  it('normaliza por prefixo as instruções internas de bancada', () => {
    // Variações reais vistas na OS de teste em 22/07/2026.
    expect(normalizeMaterial('soro infecciosas')).toBe('Soro')
    expect(normalizeMaterial('soro congelado ambar vitac')).toBe('Soro')
    expect(normalizeMaterial('soro-trace s/aditivo zn')).toBe('Soro')
    expect(normalizeMaterial('soro-trace sem aditivo')).toBe('Soro')
    expect(normalizeMaterial('Sangue Total com EDTA')).toBe('Sangue Total com EDTA')
    // "sangue total" ganha de "sangue" (ordem dos prefixos).
    expect(normalizeMaterial('sangue arterial')).toBe('Sangue')
    // Prefixo genérico não afirma o tipo de coleta ("urina 24h" ≠ jato médio).
    expect(normalizeMaterial('urina 24h')).toBe('Urina')
    expect(normalizeMaterial('urina')).toBe('Urina (Jato Médio)')
  })
})

describe('distribuiReferencias', () => {
  const linhas = (nomes: string[]) =>
    new Map(nomes.map((n, i) => [`L${i}`, { descricao: n, unidade: '' }]))

  it('reparte os blocos rotulados entre os analitos', () => {
    const texto =
      'BILIRRUBINA TOTAL: \n1 mês e acima\tInferior a 1,20\tmg/dL\n\nBILIRRUBINA DIRETA: \nInferior a 0,30\tmg/dL\n'
    const refs = distribuiReferencias(texto, linhas(['BILIRRUBINA TOTAL', 'BILIRRUBINA DIRETA']))

    expect(refs.get('L0')).toBe('1 mês e acima\tInferior a 1,20\tmg/dL')
    expect(refs.get('L1')).toBe('Inferior a 0,30\tmg/dL')
  })

  it('tolera as variações de grafia da própria AOL no rótulo', () => {
    // O rótulo diz "Anti-T.Pallidum", a linha diz "Anti-T. pallidum".
    const texto = 'Anticorpos totais específicos Anti-T.Pallidum (CMIA): \nNão Reagente\n'
    const refs = distribuiReferencias(
      texto,
      linhas(['Anticorpos totais específicos Anti-T. pallidum (CMIA)']),
    )
    expect(refs.get('L0')).toBe('Não Reagente')
  })

  it('bloco sem rótulo continua o anterior (linha em branco dentro da referência)', () => {
    const texto = 'SHBG: \nEstágio V\t18,0\t10-57\n\nHomens\t10-57 nmol/L\n'
    const refs = distribuiReferencias(texto, linhas(['SHBG']))
    expect(refs.get('L0')).toBe('Estágio V\t18,0\t10-57\nHomens\t10-57 nmol/L')
  })

  it('rótulo repetido: o primeiro vence', () => {
    const texto = 'Índice de HOMA-IR: \n<2,70\n\nÍndice de HOMA-IR: \n<9,99\n'
    const refs = distribuiReferencias(texto, linhas(['Índice de HOMA-IR']))
    expect(refs.get('L0')).toBe('<2,70')
  })

  it('exame de uma linha sem rótulo recebe o texto inteiro', () => {
    const refs = distribuiReferencias('70 a 99\tmg/dL', linhas(['GLICOSE']))
    expect(refs.get('L0')).toBe('70 a 99\tmg/dL')
  })

  it('multi-analito sem rótulo nenhum descarta tudo (caso hemograma)', () => {
    const refs = distribuiReferencias(
      '0,0 a 0,0\n0,0 a 0,0 %\n12,2 a 17,7%',
      linhas(['Leucócitos', 'Hemoglobina']),
    )
    expect(refs.size).toBe(0)
  })
})

describe('simplificaReferencia', () => {
  const homem25 = { idadeAnos: 25.5, sexo: 'M' as const }

  it('escolhe a faixa etária do paciente', () => {
    const texto = '0 - 19 anos\t2,6 a 24,9\tµUI/mL\n19 anos e acima\t2,5 a 13,1\tµUI/mL'
    expect(simplificaReferencia(texto, homem25)).toBe('2,5 a 13,1 µUI/mL')
  })

  it('resolve sub-linhas de sexo dentro da faixa', () => {
    const texto =
      '12 anos - 15 anos\t0,57 a 0,80\tmg/dL\n19 anos e acima\n Feminino\t0,50 a 1,00\tmg/dL\n Masculino\t0,70 a 1,30\tmg/dL'
    expect(simplificaReferencia(texto, homem25)).toBe('0,70 a 1,30 mg/dL')
    expect(simplificaReferencia(texto, { idadeAnos: 30, sexo: 'F' })).toBe('0,50 a 1,00 mg/dL')
  })

  it('entende faixas em dias e meses (idade fracionária)', () => {
    const texto = '0 - 15 dias\t0,42 a 1,05\tmg/dL\n15 dias - 1 ano\t0,31 a 0,53\tmg/dL\n1 ano e acima\t0,39\tmg/dL'
    expect(simplificaReferencia(texto, { idadeAnos: 100 / 365.25, sexo: 'M' })).toBe('0,31 a 0,53 mg/dL')
  })

  it('tabela só por sexo, sem faixa etária (caso GGT)', () => {
    const texto = 'Feminino\tInferior a 40 U/L\nMasculino\tInferior a 60 U/L'
    expect(simplificaReferencia(texto, homem25)).toBe('Inferior a 60 U/L')
    expect(simplificaReferencia(texto, { idadeAnos: 30, sexo: 'F' })).toBe('Inferior a 40 U/L')
  })

  it('linha sem prefixo continua o sexo corrente (caso progesterona)', () => {
    const texto =
      '1 mês e acima\n Feminino\tFase Folicular: Inferior a 0,19 ng/mL\nFase Lútea: 4,11 - 14,50 ng/mL\n Masculino\tPré Púberes: inferior a 0,9 ng/mL\nAdultos: inferior a 0,15 ng/mL'
    expect(simplificaReferencia(texto, homem25)).toBe(
      'Pré Púberes: inferior a 0,9 ng/mL\nAdultos: inferior a 0,15 ng/mL',
    )
  })

  it('qualquer linha não reconhecida devolve null — nunca uma faixa possivelmente errada', () => {
    const comLixo = '0 - 1 mês\tInferior a 5,8 mg/dL\nDe 1 a 2 dias Inferior a 8,2 mg/dL'
    expect(simplificaReferencia(comLixo, homem25)).toBeNull()
    expect(simplificaReferencia('Normal: inferior a 5,7%\nDiabetes: superior a 6,5%', homem25)).toBeNull()
    // Caso TSH real: tabela perfeita que termina numa seção "Gestantes*" que
    // não sabemos aplicar — melhor a tabela inteira do que ignorar a gestação.
    const tsh = '19 anos - 61 anos\n Feminino\t0,40 a 4,30\tµUI/mL\n Masculino\t0,40 a 4,30\tµUI/mL\nGestantes*\nPrimeiro Trimestre: 0,10 a 3,60 µUI/mL'
    expect(simplificaReferencia(tsh, homem25)).toBeNull()
  })

  it('texto de linha única não é tabela — passa reto', () => {
    expect(simplificaReferencia('70 a 99\tmg/dL', homem25)).toBeNull()
  })
})

describe('isOutOfRange — formatos da AOL', () => {
  it('faixa com "a" por extenso', () => {
    expect(isOutOfRange('95', '70 a 99 mg/dL')).toBe(false)
    expect(isOutOfRange('105', '70 a 99 mg/dL')).toBe(true)
  })

  it('limites por extenso, estritos e inclusivos', () => {
    expect(isOutOfRange('1,10', 'Inferior a 1,20 mg/dL')).toBe(false)
    expect(isOutOfRange('1,20', 'Inferior a 1,20 mg/dL')).toBe(true)
    expect(isOutOfRange('25', 'Inferior ou igual a 25 U/L')).toBe(false)
    expect(isOutOfRange('26', 'Inferior ou igual a 25 U/L')).toBe(true)
    expect(isOutOfRange('91', 'Superior a 90 mL/min/1,73m²')).toBe(false)
    expect(isOutOfRange('90', 'Superior a 90 mL/min/1,73m²')).toBe(true)
  })

  it('valor qualitativo com referência textual não alarma', () => {
    expect(isOutOfRange('Não Reagente', 'Não Reagente')).toBe(false)
  })

  it('tabela multilinha NUNCA é avaliada — a primeira faixa etária não é a referência', () => {
    // Sem esta guarda, "0 - 2 anos" casaria como faixa e o colesterol 122 de um
    // adulto sairia marcado como fora da referência.
    const tabela = '0 - 2 anos\tNão existem valores\n19 anos e acima\tInferior a 190 mg/dL'
    expect(isOutOfRange('122', tabela)).toBe(false)
  })

  it('variantes sem o "a": "Inferior ou igual 40 U/L"', () => {
    expect(isOutOfRange('40', 'Inferior ou igual 40 U/L')).toBe(false)
    expect(isOutOfRange('41', 'Inferior ou igual 40 U/L')).toBe(true)
  })
})

describe('mapAplisResult', () => {
  it('marca como pendente enquanto nenhum procedimento tem resultado', () => {
    const laudo = mapAplisResult(
      {
        cod_requisicao: 'REQ-1',
        data_solicitacao: '12/05/2026',
        data_liberacao: null,
        tipo_exame: 'PCR',
        paciente: { nome: 'Fulano', cpf: '52998224725', data_nascimento: null, sexo: null },
        procedimentos: [{ codigo: '1', nome: 'PCR', resultado: null, unidade: null, valor_referencia: null }],
        local: { nome: 'CLAF', endereco: null, numero: null },
      },
      '52998224725',
    )

    expect(laudo.status).toBe('pending')
    expect(laudo.partial).toBe(true)
    expect(laudo.source).toBe('aplis')
    expect(laudo.codigo_lis).toBe('REQ-1')
    // Sem OS na AOL: material e método não existem neste caminho.
    expect(laudo.material).toBe('')
  })

  it('fica pronto assim que um procedimento é liberado', () => {
    const laudo = mapAplisResult(
      {
        cod_requisicao: 'REQ-2',
        data_solicitacao: '12/05/2026',
        data_liberacao: '18/05/2026',
        tipo_exame: 'PCR',
        paciente: { nome: 'Fulano', cpf: '52998224725', data_nascimento: null, sexo: null },
        procedimentos: [
          { codigo: '1', nome: 'PCR', resultado: '3,1', unidade: 'mg/L', valor_referencia: '0 - 5' },
        ],
        local: { nome: 'CLAF', endereco: null, numero: null },
      },
      '52998224725',
    )

    expect(laudo.status).toBe('ready')
    expect(laudo.partial).toBe(false)
    expect(laudo.date).toBe('18 Mai 2026')
    expect(laudo.panels[0]!.ok).toBe(true)
  })

  it('biologia molecular: um grupo por painel, alvo Positivo marca atenção', () => {
    const laudo = mapAplisResult(
      {
        cod_requisicao: 'REQ-3',
        data_solicitacao: '15/05/2026',
        data_liberacao: '27/05/2026',
        tipo_exame: 'PCR',
        paciente: { nome: 'Fulano', cpf: '52998224725', data_nascimento: null, sexo: null },
        procedimentos: [],
        local: { nome: 'CLAF', endereco: null, numero: null },
        paineis: [
          {
            nome: 'GENOTIPAGEM HPV 28 TIPOS',
            metodo: 'PCR TEMPO REAL',
            referencia: 'NEGATIVO',
            resultados: [
              { nome: 'ALTO RISCO HPV 16', conclusao: 'Negativo' },
              { nome: 'ALTO RISCO HPV 33', conclusao: 'Positivo' },
            ],
          },
          {
            nome: 'PAINEL DE IST I',
            metodo: 'PCR TEMPO REAL',
            referencia: 'NEGATIVO',
            resultados: [{ nome: 'Chlamydia trachomatis (CT)', conclusao: 'Positivo' }],
          },
        ],
        responsavel: { nome: 'Paulo Vitor', crm: 'CRBM 18530' },
      },
      '52998224725',
    )

    expect(laudo.status).toBe('ready')
    expect(laudo.partial).toBe(false)
    expect(laudo.groups?.map((g) => g.name)).toEqual(['GENOTIPAGEM HPV 28 TIPOS', 'PAINEL DE IST I'])
    expect(laudo.panels).toHaveLength(3)
    // "Negativo" bate com a referência NEGATIVO do painel; "Positivo" não.
    expect(laudo.panels.map((p) => p.ok)).toEqual([true, false, false])
    expect(laudo.metodo).toBe('PCR TEMPO REAL')
    expect(laudo.doctor).toBe('Paulo Vitor')
    expect(laudo.summary).toContain('fora da referência')
  })

  it('patologia: o laudo descritivo vira o marcador "Laudo" e a conclusão vira o resumo', () => {
    const texto =
      'MACROSCOPIA:\nUm frasco contendo 5 ml de líquido.\n\nDIAGNÓSTICO DESCRITIVO: Células escamosas.\n\nCONCLUSÃO\nNEGATIVO PARA LESÃO INTRAEPITELIAL OU MALIGNIDADE NESTA AMOSTRA:\nInflamação moderada.'
    const laudo = mapAplisResult(
      {
        cod_requisicao: 'REQ-4',
        data_solicitacao: '15/05/2026',
        data_liberacao: '21/05/2026',
        tipo_exame: 'COLPOCITOLOGIA ONCÓTICA EM MEIO LÍQUIDO',
        paciente: { nome: 'Fulana', cpf: '52998224725', data_nascimento: null, sexo: null },
        procedimentos: [
          { codigo: '1', nome: 'Citologia em meio liquido', resultado: null, unidade: null, valor_referencia: null },
        ],
        local: { nome: 'CLAF', endereco: null, numero: null },
        laudo_texto: texto,
        responsavel: { nome: 'Décio Fausto Gorini', crm: 'CRM-DF 1768 RQE 925 DF' },
      },
      '52998224725',
    )

    expect(laudo.status).toBe('ready')
    expect(laudo.panels).toHaveLength(1)
    expect(laudo.panels[0]!.name).toBe('Laudo')
    expect(laudo.panels[0]!.value).toBe(texto)
    expect(laudo.summary).toContain('NEGATIVO PARA LESÃO INTRAEPITELIAL')
    expect(laudo.doctor).toBe('Décio Fausto Gorini')
  })
})

describe('parsers de patologia do ApLIS', () => {
  it('stripHtml preserva quebras de linha e remove as tags', () => {
    expect(stripHtml('<b>CONCLUSÃO</b><br>NEGATIVO.<br><br><i>Obs</i>: nada. &amp; fim')).toBe(
      'CONCLUSÃO\nNEGATIVO.\n\nObs: nada. & fim',
    )
  })

  it('parsePaineisMoleculares lê dat.exames com títulos e conclusões', () => {
    const paineis = parsePaineisMoleculares({
      exames: [
        {
          titulo: 'PAINEL DE IST I',
          metodo: 'PCR TEMPO REAL',
          referencias: 'NEGATIVO',
          resultados: [
            // Nome com espaço no fim, como o ApLIS manda; Ct em `resultado` é ignorado.
            { tituloResultado: 'Gardnerella vaginalis ', desConclusao: 'Positivo', resultado: '6.6100' },
            { tituloResultado: 'Mycoplasma hominis (MH)', textoConclusao: 'Negativo', resultado: null },
          ],
        },
        // Exame sem resultados não vira painel.
        { titulo: 'VAZIO', resultados: [] },
      ],
    })

    expect(paineis).toHaveLength(1)
    expect(paineis[0]!.resultados).toEqual([
      { nome: 'Gardnerella vaginalis', conclusao: 'Positivo' },
      { nome: 'Mycoplasma hominis (MH)', conclusao: 'Negativo' },
    ])
  })

  it('parseLaudoTexto junta macroscopia e laudoMicro das topografias', () => {
    const texto = parseLaudoTexto({
      procedimentos: [
        {
          nome: 'Citologia',
          topografias: [
            {
              laudoMacro: 'Um frasco contendo 5 ml.',
              diagnosticos: [{ laudoMicro: '<b>CONCLUSÃO</b><br>NEGATIVO.' }],
            },
          ],
        },
      ],
    })

    expect(texto).toBe('MACROSCOPIA:\nUm frasco contendo 5 ml.\n\nCONCLUSÃO\nNEGATIVO.')
  })

  it('parseResponsavel prefere o patologista e cai para o primeiro assinante', () => {
    expect(
      parseResponsavel({ patologista1: { nome: 'Décio Gorini', crm: 'CRM-DF 1768', uf: 'DF' } }),
    ).toEqual({ nome: 'Décio Gorini', crm: 'CRM-DF 1768 DF' })

    expect(
      parseResponsavel({ exames: [{ assinatura1: { nome: 'Paulo Vitor', crm: 'CRBM 18530 ', uf: '' } }] }),
    ).toEqual({ nome: 'Paulo Vitor', crm: 'CRBM 18530' })

    expect(parseResponsavel({})).toBeNull()
  })
})

// Fixture mínimo de Laudo para os testes de consolidação por pedido.
function laudoDeExame(overrides: Partial<Laudo>): Laudo {
  return {
    id: 'fixo',
    name: 'GLICOSE',
    category: 'Bioquímica',
    date: '15 Mai 2026',
    fullDate: '15 de maio de 2026',
    data_coleta: '2026-05-15',
    data_registro: '2026-05-15',
    data_emissao: '2026-05-15',
    material: 'Soro',
    metodo: 'Hexoquinase',
    laboratorio: { nome: 'CLAF', cnes: '123', endereco: '' },
    unit: 'CLAF',
    doctor: 'Dr. Sandro',
    crm: 'CRM-DF 12388',
    status: 'ready',
    summary: 'ok',
    panels: [{ name: 'Glicose', value: '95', unit: 'mg/dL', ref: '70 – 99', ok: true, trend: [] }],
    exam_type: '0040',
    codigo_os: 'OS1',
    codigo_lis: 'REQ-1',
    source: 'merged',
    partial: false,
    ...overrides,
  }
}

describe('consolidaLaudosDaOs', () => {
  it('compila o pedido num laudo só, com um grupo por exame', () => {
    const laudo = consolidaLaudosDaOs(
      [
        laudoDeExame({ name: 'GLICOSE' }),
        laudoDeExame({
          name: 'TSH',
          panels: [{ name: 'TSH', value: '2,1', unit: 'µUI/mL', ref: '0,4 – 4,0', ok: true, trend: [] }],
        }),
      ],
      'MEDICINA LABORATORIAL',
    )

    expect(laudo.name).toBe('MEDICINA LABORATORIAL')
    expect(laudo.category).toBe('Análises Clínicas')
    expect(laudo.groups?.map((g) => g.name)).toEqual(['GLICOSE', 'TSH'])
    expect(laudo.panels).toHaveLength(2)
    expect(laudo.summary).toContain('2 exames no pedido.')
  })

  it('prefixa as séries do hemograma com o nome do exame', () => {
    const serie = { name: 'Hemácias', value: '4,8', unit: 'milhões/µL', ref: '', ok: true, trend: [] }
    const laudo = consolidaLaudosDaOs([
      laudoDeExame({
        name: 'HEMOGRAMA',
        groups: [
          { name: 'Série Vermelha', panels: [serie] },
          { name: 'Série Branca', panels: [serie] },
        ],
      }),
      laudoDeExame({ name: 'TSH' }),
    ])

    expect(laudo.name).toBe('Exames Laboratoriais') // sem capa do ApLIS
    expect(laudo.groups?.map((g) => g.name)).toEqual([
      'HEMOGRAMA — Série Vermelha',
      'HEMOGRAMA — Série Branca',
      'TSH',
    ])
  })

  it('só mantém médico/material/método no cabeçalho quando são unânimes', () => {
    const laudo = consolidaLaudosDaOs([
      laudoDeExame({ doctor: 'Dr. Sandro', material: 'Soro' }),
      laudoDeExame({ name: 'TSH', doctor: 'Dra. Sheila', crm: 'CRF-RJ 4469', material: 'Soro' }),
    ])

    expect(laudo.material).toBe('Soro')
    expect(laudo.doctor).toBe('')
    expect(laudo.crm).toBe('')
  })

  it('status misto vira partial e a emissão é a do exame liberado por último', () => {
    const laudo = consolidaLaudosDaOs([
      laudoDeExame({ data_emissao: '2026-05-20', date: '20 Mai 2026' }),
      laudoDeExame({ name: 'PCR', status: 'pending', partial: true }),
    ])

    expect(laudo.status).toBe('partial')
    expect(laudo.partial).toBe(true)
    expect(laudo.data_emissao).toBe('2026-05-20')
    expect(laudo.date).toBe('20 Mai 2026')
  })

  it('pedido de um exame só passa direto, sem renomear', () => {
    const unico = laudoDeExame({ name: 'GLICOSE' })
    expect(consolidaLaudosDaOs([unico], 'MEDICINA LABORATORIAL')).toBe(unico)
  })

  it('registra a coleta da requisição como data_coleta_pedido, no formato do ApLIS', () => {
    const laudo = consolidaLaudosDaOs(
      [laudoDeExame(), laudoDeExame({ name: 'TSH' })],
      'MEDICINA LABORATORIAL',
      '20/05/2026',
    )
    expect(laudo.data_coleta_pedido).toBe('2026-05-20')

    // Também no caminho de exame único — o card ainda é o do pedido.
    const unico = consolidaLaudosDaOs([laudoDeExame()], 'MEDICINA LABORATORIAL', '20/05/2026')
    expect(unico.data_coleta_pedido).toBe('2026-05-20')
  })
})

describe('fundirPedidosPorColeta', () => {
  // O cenário real que motivou a fusão: pedido despachado em duas remessas — a
  // OS de fezes/urina ganhou o codRequisicao no idOsLis (card do pedido) e a de
  // sangue ganhou o CPF (card órfão "Exames Laboratoriais").
  const pedido = () =>
    laudoDeExame({
      name: 'MEDICINA LABORATORIAL',
      exam_type: 'pedido',
      codigo_os: 'OS-FEZES',
      codigo_lis: 'REQ-1',
      source: 'merged',
      data_coleta: '2026-05-25',
      data_coleta_pedido: '2026-05-20',
      data_emissao: '2026-05-26',
      date: '26 Mai 2026',
      groups: [{ name: 'Urina Tipo I', panels: [] }],
    })

  const orfa = () =>
    laudoDeExame({
      name: 'Exames Laboratoriais',
      exam_type: 'pedido',
      codigo_os: 'OS-SANGUE',
      codigo_lis: null,
      source: 'aol',
      data_coleta: '2026-05-20',
      data_emissao: '2026-05-28',
      date: '28 Mai 2026',
      groups: [{ name: 'TSH', panels: [] }, { name: 'GLICOSE', panels: [] }],
    })

  it('funde a OS órfã no pedido cuja coleta da requisição tem a mesma data', () => {
    const fundidos = fundirPedidosPorColeta([pedido(), orfa()])

    expect(fundidos).toHaveLength(1)
    const card = fundidos[0]!
    expect(card.name).toBe('MEDICINA LABORATORIAL')
    // Remessas em ordem de coleta: sangue (20/05) antes de fezes/urina (25/05).
    expect(card.groups?.map((g) => g.name)).toEqual(['TSH', 'GLICOSE', 'Urina Tipo I'])
    // Emissão do card = a da remessa liberada por último; coleta = a primeira.
    expect(card.data_emissao).toBe('2026-05-28')
    expect(card.date).toBe('28 Mai 2026')
    expect(card.data_coleta).toBe('2026-05-20')
    expect(card.codigo_os).toBe('OS-SANGUE,OS-FEZES')
    expect(card.codigo_lis).toBe('REQ-1')
    expect(card.source).toBe('merged')
    expect(card.summary).toContain('3 exames no pedido.')
  })

  it('não funde quando duas requisições têm a mesma data de coleta (ambíguo)', () => {
    const gemeo = { ...pedido(), codigo_lis: 'REQ-2', codigo_os: 'OS-OUTRA' }
    const fundidos = fundirPedidosPorColeta([pedido(), gemeo, orfa()])
    expect(fundidos).toHaveLength(3)
  })

  it('órfã sem pedido correspondente continua como card próprio', () => {
    const sozinha = orfa()
    const outroPedido = { ...pedido(), data_coleta_pedido: '2026-04-01' }
    const fundidos = fundirPedidosPorColeta([outroPedido, sozinha])
    expect(fundidos).toHaveLength(2)
    expect(fundidos).toContain(sozinha)
  })

  it('funde várias remessas órfãs no mesmo pedido', () => {
    const segunda = {
      ...orfa(),
      codigo_os: 'OS-URINA24H',
      data_emissao: '2026-05-27',
      groups: [{ name: 'Urina 24h', panels: [] }],
    }
    const fundidos = fundirPedidosPorColeta([pedido(), orfa(), segunda])

    expect(fundidos).toHaveLength(1)
    expect(fundidos[0]!.codigo_os).toBe('OS-SANGUE,OS-URINA24H,OS-FEZES')
    expect(fundidos[0]!.data_emissao).toBe('2026-05-28')
  })
})
