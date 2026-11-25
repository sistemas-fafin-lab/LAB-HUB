import { describe, expect, it } from 'vitest'
import { extrairVinculoDoLaudoExterno, lerLaudoExterno } from '../src/laudos/laudoExterno.js'

// Textos SINTÉTICOS no formato que a leitura de PDF devolve para o "Laudo
// EXTERNO" (uma linha por rótulo). Nenhum PDF nem dado real de paciente entra
// no repositório: números, nomes e CPF aqui são inventados.

const CPF = '529.982.247-25'

interface OpcoesDoLaudo {
  os?: string | null
  cpf?: string | null
  rodape?: string
  nome?: string
  /** `null` tira a linha "DN:" da página. */
  nascimento?: string | null
}

const NOME = 'Paciente Exemplo da Silva'

function laudoAtual(opcoes: OpcoesDoLaudo = {}): string {
  const {
    os = '123456789',
    cpf = CPF,
    rodape = 'Álvaro Centro de Análises e Pesquisas Clínicas',
    nome = NOME,
    nascimento = '01/01/1990',
  } = opcoes
  return [
    'GLICOSE',
    'Resultado 92 mg/dL 70 a 99 mg/dL',
    '(Material:soro)',
    'Assinado eletronicamente por: Fulano de Tal CRF-PR 1234 (04/11/2026 - 18:00 BRT)',
    'Hash: 00a111bbb22cc333d44444444e555ff6a7b88c9dd',
    nome,
    ...(nascimento === null ? [] : [`DN: ${nascimento} | 36 anos e 10 meses Sexo: Masculino`]),
    'Solicitante: Dr(a). Sicrano Exemplo CRM: PR-0000',
    'FAP: 000000000001',
    ...(os === null ? [] : [`OS: ${os}`]),
    'OS Lis: 0040000000001',
    ...(cpf === null ? [] : [`CPF: ${cpf}`]),
    'DATA COLETA:',
    '04/11/2026 09:00',
    'DATA EMISSÃO:',
    '04/11/2026 18:00 BRT',
    rodape,
  ].join('\n')
}

const CPF_DIGITOS = '52998224725'
const OUTRO_CPF = '111.444.777-35'

/** Uma O.S. como a extração a devolve, com o nome e o nascimento do fixture. */
const osDoPaciente = (numero: string, cpf: string | null, paginas: number) => ({
  numero,
  cpf,
  nome: NOME,
  nascimento: '1990-01-01',
  paginas,
})

/** Atalho: só os números das O.S., na ordem devolvida. */
const numeros = (paginas: string | string[]): string[] =>
  extrairVinculoDoLaudoExterno(paginas).os.map((o) => o.numero)

describe('extrairVinculoDoLaudoExterno', () => {
  it('extrai O.S. e CPF (só dígitos) do layout atual com rodapé Álvaro', () => {
    expect(extrairVinculoDoLaudoExterno(laudoAtual())).toEqual({
      os: [osDoPaciente('123456789', CPF_DIGITOS, 1)],
      layout: 'atual',
    })
  })

  it('extrai do mesmo layout com rodapé Dasa', () => {
    const texto = laudoAtual({ os: '987654321', rodape: 'Dasa — Diagnósticos da América S.A.' })
    expect(extrairVinculoDoLaudoExterno(texto)).toEqual({
      os: [osDoPaciente('987654321', CPF_DIGITOS, 1)],
      layout: 'atual',
    })
  })

  it('ignora o campo "OS Lis": ele repete o idOsLis digitado à mão', () => {
    // Sem a linha "OS:", o único número com cara de O.S. é o do "OS Lis".
    expect(extrairVinculoDoLaudoExterno(laudoAtual({ os: null }))).toEqual({ os: [], layout: 'desconhecido' })
  })

  it('a mesma O.S. em várias páginas é uma O.S. só, com as páginas contadas', () => {
    expect(extrairVinculoDoLaudoExterno([laudoAtual(), laudoAtual(), laudoAtual()]).os).toEqual([
      osDoPaciente('123456789', CPF_DIGITOS, 3),
    ])
  })

  describe('várias O.S. no mesmo PDF', () => {
    it('devolve todas, sem repetir', () => {
      const paginas = [laudoAtual({ os: '111111111' }), laudoAtual({ os: '222222222' }), laudoAtual({ os: '333333333' })]
      expect(numeros(paginas)).toEqual(['111111111', '222222222', '333333333'])
    })

    it('ordena pela quantidade de páginas: a que ocupa mais páginas vem primeiro', () => {
      // O caso real: uma remessa pequena abre o arquivo e a maior vem depois.
      const paginas = [
        laudoAtual({ os: '111111111' }),
        laudoAtual({ os: '222222222' }),
        laudoAtual({ os: '333333333' }),
        laudoAtual({ os: '333333333' }),
        laudoAtual({ os: '333333333' }),
        laudoAtual({ os: '222222222' }),
      ]
      expect(numeros(paginas)).toEqual(['333333333', '222222222', '111111111'])
    })

    it('no empate de páginas vale a ordem em que as O.S. aparecem', () => {
      expect(numeros([laudoAtual({ os: '222222222' }), laudoAtual({ os: '111111111' })])).toEqual([
        '222222222',
        '111111111',
      ])
    })

    it('o cabeçalho repetido dentro da mesma página conta uma página só', () => {
      const paginas = [
        `${laudoAtual({ os: '111111111' })}\n${laudoAtual({ os: '111111111' })}\n${laudoAtual({ os: '111111111' })}`,
        laudoAtual({ os: '222222222' }),
        laudoAtual({ os: '222222222' }),
      ]
      expect(numeros(paginas)).toEqual(['222222222', '111111111'])
    })

    it('uma ocorrência ilegível do rótulo, em qualquer página, anula todas as O.S.', () => {
      expect(numeros([laudoAtual({ os: '111111111' }), laudoAtual({ os: '12345-A' })])).toEqual([])
    })
  })

  describe('o CPF é de cada O.S., pelas páginas em que ela aparece', () => {
    it('PDF com O.S. de pessoas diferentes: cada O.S. sai com o seu CPF', () => {
      // O caso real de 25/11/2026: a O.S. maior do arquivo é de outro CPF.
      const paginas = [
        laudoAtual({ os: '111111111' }),
        laudoAtual({ os: '222222222', cpf: OUTRO_CPF }),
        laudoAtual({ os: '222222222', cpf: OUTRO_CPF }),
        laudoAtual({ os: '222222222', cpf: OUTRO_CPF }),
      ]

      expect(extrairVinculoDoLaudoExterno(paginas).os).toEqual([
        osDoPaciente('222222222', '11144477735', 3),
        osDoPaciente('111111111', CPF_DIGITOS, 1),
      ])
    })

    it('páginas da mesma O.S. com CPFs diferentes: essa O.S. fica sem CPF', () => {
      const paginas = [laudoAtual({ os: '111111111' }), laudoAtual({ os: '111111111', cpf: OUTRO_CPF })]
      expect(extrairVinculoDoLaudoExterno(paginas).os).toEqual([osDoPaciente('111111111', null, 2)])
    })

    it('basta uma página da O.S. sem CPF legível para ela ficar sem CPF', () => {
      const semCpf = [laudoAtual({ os: '111111111' }), laudoAtual({ os: '111111111', cpf: null })]
      expect(extrairVinculoDoLaudoExterno(semCpf).os[0]!.cpf).toBeNull()

      const truncado = [laudoAtual({ os: '111111111', cpf: '529.982.247' })]
      expect(extrairVinculoDoLaudoExterno(truncado).os[0]).toEqual(osDoPaciente('111111111', null, 1))
    })

    it('O.S. sem CPF não tira o CPF das outras O.S. do arquivo', () => {
      const paginas = [laudoAtual({ os: '111111111', cpf: null }), laudoAtual({ os: '222222222' })]
      expect(extrairVinculoDoLaudoExterno(paginas).os).toEqual([
        osDoPaciente('111111111', null, 1),
        osDoPaciente('222222222', CPF_DIGITOS, 1),
      ])
    })

    it('página com duas O.S. não diz de qual é o CPF: as duas ficam sem CPF', () => {
      const pagina = `${laudoAtual({ os: '111111111' })}\n${laudoAtual({ os: '222222222' })}`
      expect(extrairVinculoDoLaudoExterno([pagina]).os.map((o) => o.cpf)).toEqual([null, null])
    })

    it('página com dois CPFs diferentes não identifica ninguém', () => {
      const pagina = `${laudoAtual({ os: '111111111' })}\nCPF: ${OUTRO_CPF}`
      expect(extrairVinculoDoLaudoExterno([pagina]).os[0]!.cpf).toBeNull()
    })
  })

  describe('nome e nascimento de cada O.S. (segunda prova de identidade)', () => {
    it('saem da linha "DN:" e da linha logo acima dela, com a data em ISO', () => {
      const [os] = extrairVinculoDoLaudoExterno(laudoAtual({ nome: 'Maria José d\'Ávila', nascimento: '31/12/1985' })).os
      expect(os).toMatchObject({ nome: 'Maria José d\'Ávila', nascimento: '1985-12-31' })
    })

    it('cada O.S. responde pelo nome e nascimento das páginas dela', () => {
      const paginas = [
        laudoAtual({ os: '111111111' }),
        laudoAtual({ os: '222222222', nome: 'Outra Pessoa', nascimento: '02/02/1980' }),
      ]
      expect(extrairVinculoDoLaudoExterno(paginas).os.map((o) => [o.numero, o.nome, o.nascimento])).toEqual([
        ['111111111', NOME, '1990-01-01'],
        ['222222222', 'Outra Pessoa', '1980-02-02'],
      ])
    })

    it('O.S. sem CPF impresso continua trazendo nome e nascimento', () => {
      expect(extrairVinculoDoLaudoExterno(laudoAtual({ cpf: null })).os).toEqual([osDoPaciente('123456789', null, 1)])
    })

    it('página sem a linha "DN:": sem nome e sem nascimento', () => {
      const [os] = extrairVinculoDoLaudoExterno(laudoAtual({ nascimento: null })).os
      expect(os).toMatchObject({ nome: null, nascimento: null, cpf: CPF_DIGITOS })
    })

    it('data impossível ou fora do formato não vira nascimento', () => {
      expect(extrairVinculoDoLaudoExterno(laudoAtual({ nascimento: '31/02/1990' })).os[0]!.nascimento).toBeNull()
      expect(extrairVinculoDoLaudoExterno(laudoAtual({ nascimento: '1/1/90' })).os[0]!.nascimento).toBeNull()
    })

    it('páginas da mesma O.S. com nomes diferentes: fica sem nome', () => {
      const paginas = [laudoAtual({ os: '111111111' }), laudoAtual({ os: '111111111', nome: 'Outra Pessoa' })]
      expect(extrairVinculoDoLaudoExterno(paginas).os[0]).toMatchObject({ nome: null, nascimento: '1990-01-01' })
    })

    it('página com duas pessoas (duas linhas "DN:" diferentes) não identifica ninguém', () => {
      const pagina = `${laudoAtual({ os: '111111111' })}\nOutra Pessoa\nDN: 02/02/1980 | 46 anos`
      expect(extrairVinculoDoLaudoExterno([pagina]).os[0]).toMatchObject({ nome: null, nascimento: null })
    })

    it('página com duas O.S. não diz de qual é o nome', () => {
      const pagina = `${laudoAtual({ os: '111111111' })}\n${laudoAtual({ os: '222222222' })}`
      expect(extrairVinculoDoLaudoExterno([pagina]).os.map((o) => o.nome)).toEqual([null, null])
    })
  })

  describe('recusas', () => {
    it('O.S. que não é só número', () => {
      expect(numeros(laudoAtual({ os: '12345-A' }))).toEqual([])
      expect(numeros(laudoAtual({ os: '' }))).toEqual([])
    })

    it('modelo antigo (jan–fev/2026, "Ordem Serviço") fica fora: sem O.S.', () => {
      const antigo = ['Paciente Exemplo', 'Ordem Serviço', '123456789', `CPF ${CPF}`].join('\n')
      expect(extrairVinculoDoLaudoExterno(antigo)).toEqual({ os: [], layout: 'antigo' })
    })

    it('layout desconhecido resulta em sem O.S.', () => {
      expect(extrairVinculoDoLaudoExterno('Relatório qualquer\nNúmero 123456789')).toEqual({
        os: [],
        layout: 'desconhecido',
      })
    })

    it('texto vazio resulta em sem O.S.', () => {
      expect(extrairVinculoDoLaudoExterno('')).toEqual({ os: [], layout: 'desconhecido' })
    })
  })
})

// PDF mínimo montado em código, uma linha de texto por item. Serve para provar
// que a biblioteca de leitura devolve o texto no formato que o extrator espera
// (um rótulo por linha) — sem guardar arquivo PDF no repositório.
function pdfSintetico(...paginas: string[][]): Uint8Array {
  // Objetos 1 (catálogo), 2 (árvore de páginas) e 3 (fonte); depois, para cada
  // página, um objeto de página e um de conteúdo.
  const conteudos = paginas.map((linhas) =>
    ['BT', '/F1 10 Tf', '50 780 Td', ...linhas.map((l) => `(${l}) Tj 0 -14 Td`), 'ET'].join('\n'),
  )
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${conteudos.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${conteudos.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...conteudos.flatMap((conteudo, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    ]),
  ]
  let corpo = '%PDF-1.4\n'
  const posicoes: number[] = []
  objetos.forEach((objeto, i) => {
    posicoes.push(corpo.length)
    corpo += `${i + 1} 0 obj\n${objeto}\nendobj\n`
  })
  const inicioXref = corpo.length
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (const posicao of posicoes) corpo += `${String(posicao).padStart(10, '0')} 00000 n \n`
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`
  return new TextEncoder().encode(corpo)
}

describe('lerLaudoExterno', () => {
  it('lê O.S. e CPF de um PDF com texto no layout atual', async () => {
    const pdf = pdfSintetico([
      NOME,
      'DN: 01/01/1990 | 36 anos e 10 meses Sexo: Masculino',
      'FAP: 000000000001',
      'OS: 123456789',
      'OS Lis: 0040000000001',
      'CPF: 529.982.247-25',
    ])

    expect(await lerLaudoExterno(pdf)).toEqual({
      os: [osDoPaciente('123456789', '52998224725', 1)],
      layout: 'atual',
    })
  })

  it('separa as páginas: cada O.S. sai com o CPF e a contagem das páginas dela', async () => {
    // É da divisão por página que depende a identidade por O.S.
    const doPaciente = ['OS: 111111101', 'CPF: 529.982.247-25']
    const deOutro = ['OS: 222222202', 'CPF: 111.444.777-35']

    expect(await lerLaudoExterno(pdfSintetico(doPaciente, deOutro, deOutro))).toEqual({
      os: [
        { numero: '222222202', cpf: '11144477735', nome: null, nascimento: null, paginas: 2 },
        { numero: '111111101', cpf: '52998224725', nome: null, nascimento: null, paginas: 1 },
      ],
      layout: 'atual',
    })
  })

  it('não consome os bytes de quem chamou', async () => {
    const pdf = pdfSintetico(['OS: 123456789'])
    const tamanho = pdf.length
    await lerLaudoExterno(pdf)
    expect(pdf.length).toBe(tamanho)
  })

  it('arquivo corrompido resulta em sem O.S., sem lançar', async () => {
    const lixo = new TextEncoder().encode('%PDF-1.4 isto nao e um pdf de verdade')
    expect(await lerLaudoExterno(lixo)).toEqual({ os: [], layout: 'ilegivel' })
  })

  it('PDF sem texto (digitalização) resulta em sem O.S.', async () => {
    expect(await lerLaudoExterno(pdfSintetico([], []))).toEqual({ os: [], layout: 'ilegivel' })
  })
})
