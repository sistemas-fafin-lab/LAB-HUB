import { describe, expect, it } from 'vitest'
import { detectarTipoArquivo } from '../src/lib/fileType.js'

// Preenche até 12 bytes: o detector exige o mínimo do WEBP para analisar.
function comCabecalho(bytes: number[]): Buffer {
  return Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)])
}

describe('detectarTipoArquivo', () => {
  it('reconhece PDF', () => {
    expect(detectarTipoArquivo(comCabecalho([0x25, 0x50, 0x44, 0x46, 0x2d]))).toEqual({
      mimeType: 'application/pdf',
      extensao: 'pdf',
    })
  })

  it('reconhece JPEG', () => {
    expect(detectarTipoArquivo(comCabecalho([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      mimeType: 'image/jpeg',
      extensao: 'jpg',
    })
  })

  it('reconhece PNG', () => {
    expect(
      detectarTipoArquivo(comCabecalho([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toEqual({ mimeType: 'image/png', extensao: 'png' })
  })

  it('reconhece WEBP', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // tamanho
      Buffer.from('WEBP', 'latin1'),
    ])
    expect(detectarTipoArquivo(webp)).toEqual({ mimeType: 'image/webp', extensao: 'webp' })
  })

  // O ponto central da validação: executável renomeado não passa.
  it('rejeita executável (MZ)', () => {
    expect(detectarTipoArquivo(comCabecalho([0x4d, 0x5a, 0x90, 0x00]))).toBeNull()
  })

  it('rejeita RIFF que não é WEBP (ex.: WAV)', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'latin1'),
    ])
    expect(detectarTipoArquivo(wav)).toBeNull()
  })

  it('rejeita buffer vazio e buffer curto demais (guarda do length < 12)', () => {
    expect(detectarTipoArquivo(Buffer.alloc(0))).toBeNull()
    // %PDF- válido, mas com menos de 12 bytes: não dá p/ analisar com segurança.
    expect(detectarTipoArquivo(Buffer.from('%PDF-', 'latin1'))).toBeNull()
  })
})
