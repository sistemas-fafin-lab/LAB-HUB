import { describe, expect, it } from 'vitest'
import { extrairVinculoDoLaudoExterno, lerLaudoExterno } from '../src/laudos/laudoExterno.js'

// Textos SINTÉTICOS no formato que a leitura de PDF devolve para o "Laudo
// EXTERNO" (uma linha por rótulo). Nenhum PDF nem dado real de paciente entra
// no repositório: números, nomes e CPF aqui são inventados.

const CPF = '529.982.247-25'

function laudoAtual(opcoes: { os?: string | null; cpf?: string | null; rodape?: string } = {}): string {
  const { os = '123456789', cpf = CPF, rodape = 'Álvaro Centro de Análises e Pesquisas Clínicas' } = opcoes
  return [
    'GLICOSE',
    'Resultado 92 mg/dL 70 a 99 mg/dL',
    '(Material:soro)',
    'Assinado eletronicamente por: Fulano de Tal CRF-PR 1234 (04/11/2026 - 18:00 BRT)',
    'Hash: 00a111bbb22cc333d44444444e555ff6a7b88c9dd',
    'Paciente Exemplo da Silva',
    'DN: 01/01/1990 | 36 anos e 10 meses Sexo: Masculino',
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

/** Atalho: só os números das O.S., na ordem devolvida. */
const numeros = (paginas: string | string[]): string[] =>
  extrairVinculoDoLaudoExterno(paginas).os.map((o) => o.numero)

describe('extrairVinculoDoLaudoExterno', () => {
  it('extrai O.S. e CPF (só dígitos) do layout atual com rodapé Álvaro', () => {
    expect(extrairVinculoDoLaudoExterno(laudoAtual())).toEqual({
      os: [{ numero: '123456789', cpf: CPF_DIGITOS, paginas: 1 }],
      layout: 'atual',
    })
  })

  it('extrai do mesmo layout com rodapé Dasa', () => {
    const texto = laudoAtual({ os: '987654321', rodape: 'Dasa — Diagnósticos da América S.A.' })
    expect(extrairVinculoDoLaudoExterno(texto)).toEqual({
      os: [{ numero: '987654321', cpf: CPF_DIGITOS, paginas: 1 }],
      layout: 'atual',
    })
  })

  it('ignora o campo "OS Lis": ele repete o idOsLis digitado à mão', () => {
    // Sem a linha "OS:", o único número com cara de O.S. é o do "OS Lis".
    expect(extrairVinculoDoLaudoExterno(laudoAtual({ os: null }))).toEqual({ os: [], layout: 'desconhecido' })
  })

  it('a mesma O.S. em várias páginas é uma O.S. só, com as páginas contadas', () => {
    expect(extrairVinculoDoLaudoExterno([laudoAtual(), laudoAtual(), laudoAtual()]).os).toEqual([
      { numero: '123456789', cpf: CPF_DIGITOS, paginas: 3 },
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
        { numero: '222222222', cpf: '11144477735', paginas: 3 },
        { numero: '111111111', cpf: CPF_DIGITOS, paginas: 1 },
      ])
    })

    it('páginas da mesma O.S. com CPFs diferentes: essa O.S. fica sem CPF', () => {
      const paginas = [laudoAtual({ os: '111111111' }), laudoAtual({ os: '111111111', cpf: OUTRO_CPF })]
      expect(extrairVinculoDoLaudoExterno(paginas).os).toEqual([{ numero: '111111111', cpf: null, paginas: 2 }])
    })

    it('basta uma página da O.S. sem CPF legível para ela ficar sem CPF', () => {
      const semCpf = [laudoAtual({ os: '111111111' }), laudoAtual({ os: '111111111', cpf: null })]
      expect(extrairVinculoDoLaudoExterno(semCpf).os[0]!.cpf).toBeNull()

      const truncado = [laudoAtual({ os: '111111111', cpf: '529.982.247' })]
      expect(extrairVinculoDoLaudoExterno(truncado).os[0]).toEqual({ numero: '111111111', cpf: null, paginas: 1 })
    })

    it('O.S. sem CPF não tira o CPF das outras O.S. do arquivo', () => {
      const paginas = [laudoAtual({ os: '111111111', cpf: null }), laudoAtual({ os: '222222222' })]
      expect(extrairVinculoDoLaudoExterno(paginas).os).toEqual([
        { numero: '111111111', cpf: null, paginas: 1 },
        { numero: '222222222', cpf: CPF_DIGITOS, paginas: 1 },
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
    const pdf = pdfSintetico(['FAP: 000000000001', 'OS: 123456789', 'OS Lis: 0040000000001', 'CPF: 529.982.247-25'])

    expect(await lerLaudoExterno(pdf)).toEqual({
      os: [{ numero: '123456789', cpf: '52998224725', paginas: 1 }],
      layout: 'atual',
    })
  })

  it('separa as páginas: cada O.S. sai com o CPF e a contagem das páginas dela', async () => {
    // É da divisão por página que depende a identidade por O.S.
    const doPaciente = ['OS: 111111101', 'CPF: 529.982.247-25']
    const deOutro = ['OS: 222222202', 'CPF: 111.444.777-35']

    expect(await lerLaudoExterno(pdfSintetico(doPaciente, deOutro, deOutro))).toEqual({
      os: [
        { numero: '222222202', cpf: '11144477735', paginas: 2 },
        { numero: '111111101', cpf: '52998224725', paginas: 1 },
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
