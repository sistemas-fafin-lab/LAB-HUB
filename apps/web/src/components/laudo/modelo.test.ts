import { describe, expect, it } from 'vitest'
import { direcaoDoDesvio, documentoDoExame, idadePorExtenso, secoesDoTexto } from './modelo'
import type { Exam, ExamPanel } from '../shared/WebHero'
import type { Paciente } from '@lab-hub/shared'

const painel = (over: Partial<ExamPanel> = {}): ExamPanel => ({
  name: 'Glicose', value: '92', unit: 'mg/dL', ref: '70 a 99', ok: true, trend: [], ...over,
})

const exame = (over: Partial<Exam> = {}): Exam => ({
  id: 'e1',
  name: 'HEMOGRAMA',
  category: 'Análises clínicas',
  date: '28 Jul 2026',
  fullDate: '28 de julho de 2026',
  unit: '—',
  doctor: '—',
  crm: '—',
  status: 'ready',
  summary: '',
  panels: [],
  ...over,
})

const paciente = (over: Partial<Paciente> = {}): Paciente =>
  ({
    id: 'p1', authUserId: 'a1', nome: 'Maria Souza', email: 'm@ex.com',
    cpf: '52998224725', sexo: 'F', dataNascimento: '1990-03-14', ...over,
  }) as Paciente

describe('direção do desvio', () => {
  // A seta ▼/▲ é uma AFIRMAÇÃO sobre o resultado do paciente. Ela só aparece
  // quando dá para provar o lado a partir da faixa que o laboratório mandou.
  it('aponta o lado nas faixas "a a b" e "a - b"', () => {
    expect(direcaoDoDesvio('120', '70 a 99')).toBe('hi')
    expect(direcaoDoDesvio('60', '70 a 99')).toBe('lo')
    expect(direcaoDoDesvio('5,9', '3,5 - 5,1')).toBe('hi')
  })

  it('aponta o lado nos limites abertos', () => {
    expect(direcaoDoDesvio('240', '< 200')).toBe('hi')
    expect(direcaoDoDesvio('1,50', 'Inferior a 1,20')).toBe('hi')
    expect(direcaoDoDesvio('30', '> 40')).toBe('lo')
    expect(direcaoDoDesvio('30', 'Superior ou igual a 40')).toBe('lo')
  })

  it('não opina sobre referência multilinha nem sobre valor não numérico', () => {
    // Tabela estratificada por idade/sexo que não foi reduzida à linha do
    // paciente: comparar com ela casaria a faixa errada.
    expect(direcaoDoDesvio('120', '0 - 1 mês: 10 a 20\n1 - 5 anos: 20 a 30')).toBeNull()
    expect(direcaoDoDesvio('Reagente', 'Não reagente')).toBeNull()
    expect(direcaoDoDesvio('120', '')).toBeNull()
  })
})

describe('estado do analito na folha', () => {
  it('respeita o `ok` da API e só escolhe a seta', () => {
    const doc = documentoDoExame(
      exame({
        panels: [
          painel({ name: 'Glicose', value: '120', ref: '70 a 99', ok: false }),
          painel({ name: 'Sódio', value: '130', ref: '135 a 145', ok: false }),
          painel({ name: 'Ureia', value: '30', ref: '15 a 40', ok: true }),
        ],
      }),
      null,
    )
    const linhas = doc.grupos[0]!.linhas

    expect(linhas.map((l) => l.estado)).toEqual(['hi', 'lo', 'ok'])
  })

  it('marca como alterado sem apontar lado quando a faixa não é legível', () => {
    // A API afirmou que está fora; nós não conseguimos provar de que lado.
    // Inventar ▲ aqui seria dizer ao paciente algo que ninguém verificou.
    const doc = documentoDoExame(
      exame({ panels: [painel({ value: 'Reagente', ref: 'Não reagente', ok: false })] }),
      null,
    )

    expect(doc.grupos[0]!.linhas[0]!.estado).toBe('alt')
  })
})

describe('contadores', () => {
  it('só conta analito COM faixa de referência em dentro/alterados', () => {
    const doc = documentoDoExame(
      exame({
        panels: [
          painel({ ref: '70 a 99', ok: true }),
          painel({ ref: '70 a 99', ok: false, value: '120' }),
          painel({ ref: '', ok: true, value: 'Amostra lipêmica' }),
        ],
      }),
      null,
    )

    expect(doc.resumo).toEqual({ total: 3, comReferencia: 2, dentro: 1, alterados: 1 })
  })
})

describe('campos ausentes', () => {
  it('não vira placeholder: o campo some da folha', () => {
    // '—' é o placeholder dos mappers para "a fonte não informou". Num
    // documento impresso ele é lido como afirmação sobre o exame.
    const doc = documentoDoExame(exame({ unit: '—', doctor: '—', crm: '—' }), null)

    expect(doc.medico).toBeUndefined()
    expect(doc.crm).toBeUndefined()
    expect(doc.laboratorio).toBeUndefined()
  })

  it('prefere o laboratório executor à unidade de coleta', () => {
    const doc = documentoDoExame(exame({ laboratorio: 'Lab Central', unit: 'Unidade Asa Sul' }), null)

    expect(doc.laboratorio).toBe('Lab Central')
  })
})

describe('idade por extenso', () => {
  it('conta anos e meses completos', () => {
    expect(idadePorExtenso('2004-03-07', new Date('2024-04-10T12:00:00'))).toBe('20 anos e 1 mês')
    expect(idadePorExtenso('1990-03-14', new Date('2026-07-29T12:00:00'))).toBe('36 anos e 4 meses')
  })

  it('omite os meses quando o aniversário é hoje', () => {
    expect(idadePorExtenso('1990-07-29', new Date('2026-07-29T12:00:00'))).toBe('36 anos')
  })

  it('não devolve idade a partir de data inválida', () => {
    expect(idadePorExtenso('')).toBeUndefined()
  })
})

describe('laudo descritivo', () => {
  it('quebra o texto corrido em seções, destacando a CONCLUSÃO', () => {
    const secoes = secoesDoTexto(
      'MACROSCOPIA:\nMaterial em meio líquido.\nCONCLUSÃO\nNEGATIVO PARA LESÃO INTRAEPITELIAL OU MALIGNIDADE',
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['MACROSCOPIA', 'CONCLUSÃO'])
    expect(secoes[1]!.destaque).toBe(true)
    // Linha longa em CAIXA ALTA é o achado principal — vai em negrito, mas
    // continua parágrafo (não vira título de seção).
    expect(secoes[1]!.paragrafos[0]).toEqual({
      texto: 'NEGATIVO PARA LESÃO INTRAEPITELIAL OU MALIGNIDADE',
      forte: true,
    })
  })

  it('linha em caixa alta com ponto final é texto corrido, não achado', () => {
    // Mesma regra do LaudoTexto: "HEMORRÁGICO." é descrição, não conclusão.
    const secoes = secoesDoTexto('MACROSCOPIA\nHEMORRÁGICO.')

    expect(secoes[0]!.paragrafos[0]).toEqual({ texto: 'HEMORRÁGICO.', forte: false })
  })

  it('não gera tabela de analitos para laudo em seções', () => {
    const doc = documentoDoExame(
      exame({
        groups: [{ name: 'CONCLUSÃO', panels: [{ name: '', value: 'NEGATIVO.', unit: '', ref: '', ok: true, trend: [] }] }],
      }),
      null,
    )

    expect(doc.grupos).toEqual([])
    expect(doc.secoes).toHaveLength(1)
  })
})

describe('paciente', () => {
  it('formata CPF e nascimento e deriva a idade', () => {
    const doc = documentoDoExame(exame(), paciente(), new Date('2026-07-29T12:00:00'))

    expect(doc.paciente.cpf).toBe('529.982.247-25')
    expect(doc.paciente.nascimento).toBe('14/03/1990')
    expect(doc.paciente.idade).toBe('36 anos e 4 meses')
  })

  it('sem paciente carregado, os campos ficam ausentes em vez de vazios', () => {
    const doc = documentoDoExame(exame(), null)

    expect(doc.paciente).toEqual({})
  })
})
