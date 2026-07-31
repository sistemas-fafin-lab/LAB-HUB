import { describe, expect, it } from 'vitest'
import { sanitizarNome } from '../src/lib/nomeArquivo.js'

describe('sanitizarNome', () => {
  it('mantém o nome comum intacto', () => {
    expect(sanitizarNome('exame de sangue.pdf', 'pdf')).toBe('exame de sangue.pdf')
  })

  it('remove CR/LF — o nome vai para o header Content-Disposition', () => {
    // Sem isto, um upload com `\r\n` no filename escreve um header novo na
    // resposta da signed URL de download.
    expect(sanitizarNome('rg.jpg\r\nX-Injetado: sim', 'jpg')).toBe('rg.jpgX-Injetado: sim')
    expect(sanitizarNome('a\tb.pdf', 'pdf')).toBe('ab.pdf')
  })

  it('corta em 120 caracteres', () => {
    expect(sanitizarNome('a'.repeat(500), 'pdf')).toHaveLength(120)
  })

  it('cai no padrão quando sobra vazio', () => {
    // Nome só com espaços, só com quebras de linha, ou ausente: o registro
    // precisa de algo exibível, não de string vazia.
    expect(sanitizarNome('   ', 'pdf')).toBe('documento.pdf')
    expect(sanitizarNome('\r\n', 'jpg')).toBe('documento.jpg')
    expect(sanitizarNome(undefined, 'png')).toBe('documento.png')
  })
})
