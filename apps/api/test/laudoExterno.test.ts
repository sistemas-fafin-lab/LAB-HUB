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

describe('extrairVinculoDoLaudoExterno', () => {
  it('extrai O.S. e CPF (só dígitos) do layout atual com rodapé Álvaro', () => {
    expect(extrairVinculoDoLaudoExterno(laudoAtual())).toEqual({
      os: ['123456789'],
      cpf: '52998224725',
      layout: 'atual',
    })
  })

  it('extrai do mesmo layout com rodapé Dasa', () => {
    const texto = laudoAtual({ os: '987654321', rodape: 'Dasa — Diagnósticos da América S.A.' })
    expect(extrairVinculoDoLaudoExterno(texto)).toEqual({
      os: ['987654321'],
      cpf: '52998224725',
      layout: 'atual',
    })
  })

  it('ignora o campo "OS Lis": ele repete o idOsLis digitado à mão', () => {
    // Sem a linha "OS:", o único número com cara de O.S. é o do "OS Lis".
    const resultado = extrairVinculoDoLaudoExterno(laudoAtual({ os: null }))
    expect(resultado.os).toEqual([])
    expect(resultado.layout).toBe('desconhecido')
  })

  it('aceita o cabeçalho repetido em várias páginas quando a O.S. é a mesma', () => {
    const texto = `${laudoAtual()}\n${laudoAtual()}`
    expect(extrairVinculoDoLaudoExterno(texto).os).toEqual(['123456789'])
  })

  it('um PDF com várias O.S. (uma por página) devolve todas, sem repetir, na ordem', () => {
    const texto = [
      laudoAtual({ os: '111111111' }),
      laudoAtual({ os: '222222222' }),
      laudoAtual({ os: '222222222' }),
      laudoAtual({ os: '333333333' }),
    ].join('\n')

    expect(extrairVinculoDoLaudoExterno(texto)).toEqual({
      os: ['111111111', '222222222', '333333333'],
      cpf: '52998224725',
      layout: 'atual',
    })
  })

  it('uma ocorrência ilegível do rótulo anula todas as O.S. do PDF', () => {
    const texto = `${laudoAtual({ os: '111111111' })}\n${laudoAtual({ os: '12345-A' })}`
    expect(extrairVinculoDoLaudoExterno(texto).os).toEqual([])
  })

  it('recusa O.S. que não é só número', () => {
    expect(extrairVinculoDoLaudoExterno(laudoAtual({ os: '12345-A' })).os).toEqual([])
    expect(extrairVinculoDoLaudoExterno(laudoAtual({ os: '' })).os).toEqual([])
  })

  it('modelo antigo (jan–fev/2026, "Ordem Serviço") fica fora: sem O.S.', () => {
    const antigo = ['Paciente Exemplo', 'Ordem Serviço', '123456789', `CPF ${CPF}`].join('\n')
    expect(extrairVinculoDoLaudoExterno(antigo)).toMatchObject({ os: [], layout: 'antigo' })
  })

  it('layout desconhecido e texto vazio (PDF sem texto) resultam em sem O.S.', () => {
    expect(extrairVinculoDoLaudoExterno('Relatório qualquer\nNúmero 123456789')).toEqual({
      os: [],
      cpf: null,
      layout: 'desconhecido',
    })
    expect(extrairVinculoDoLaudoExterno('')).toEqual({ os: [], cpf: null, layout: 'desconhecido' })
  })

  it('CPF ausente ou truncado sai null, sem derrubar a O.S.', () => {
    expect(extrairVinculoDoLaudoExterno(laudoAtual({ cpf: null }))).toEqual({
      os: ['123456789'],
      cpf: null,
      layout: 'atual',
    })
    expect(extrairVinculoDoLaudoExterno(laudoAtual({ cpf: '529.982.247' })).cpf).toBeNull()
  })

  it('dois CPFs diferentes no texto: CPF null', () => {
    const texto = `${laudoAtual()}\n${laudoAtual({ cpf: '111.444.777-35' })}`
    expect(extrairVinculoDoLaudoExterno(texto).cpf).toBeNull()
  })
})

// PDF mínimo montado em código, uma linha de texto por item. Serve para provar
// que a biblioteca de leitura devolve o texto no formato que o extrator espera
// (um rótulo por linha) — sem guardar arquivo PDF no repositório.
function pdfSintetico(linhas: string[]): Uint8Array {
  const conteudo = ['BT', '/F1 10 Tf', '50 780 Td', ...linhas.map((l) => `(${l}) Tj 0 -14 Td`), 'ET'].join('\n')
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
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

    expect(await lerLaudoExterno(pdf)).toEqual({ os: ['123456789'], cpf: '52998224725', layout: 'atual' })
  })

  it('não consome os bytes de quem chamou', async () => {
    const pdf = pdfSintetico(['OS: 123456789'])
    const tamanho = pdf.length
    await lerLaudoExterno(pdf)
    expect(pdf.length).toBe(tamanho)
  })

  it('arquivo corrompido resulta em sem O.S., sem lançar', async () => {
    const lixo = new TextEncoder().encode('%PDF-1.4 isto nao e um pdf de verdade')
    expect(await lerLaudoExterno(lixo)).toEqual({ os: [], cpf: null, layout: 'ilegivel' })
  })

  it('PDF sem texto (digitalização) resulta em sem O.S.', async () => {
    expect(await lerLaudoExterno(pdfSintetico([]))).toEqual({ os: [], cpf: null, layout: 'ilegivel' })
  })
})
