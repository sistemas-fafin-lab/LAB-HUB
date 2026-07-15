// Detecta o tipo REAL de um arquivo pelo cabeçalho binário (magic bytes).
//
// Não confiamos no Content-Type nem na extensão: os dois são texto livre do
// cliente — um executável renomeado p/ .jpg com Content-Type: image/jpeg passa
// por qualquer checagem de nome, inclusive pelo allowed_mime_types do bucket
// (que confere contra o content-type que MANDAMOS, não contra os bytes).
//
// Só os 4 formatos aceitos em `documentos`. SVG fica de fora de propósito: é XML
// executável — arquivo hospedado com SVG vira XSS no domínio que o serve.
// HEIC também fica de fora: o painel de check-in roda em Chrome desktop, que não
// o renderiza. O `accept` do input no web faz o iOS converter p/ JPEG na seleção.

export interface FormatoArquivo {
  mimeType: string
  extensao: string
}

const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Menor buffer analisável: o WEBP só se confirma no offset 8..12.
const BYTES_MINIMOS = 12

const ASSINATURAS: (FormatoArquivo & { casa: (b: Buffer) => boolean })[] = [
  {
    mimeType: 'application/pdf',
    extensao: 'pdf',
    casa: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    mimeType: 'image/jpeg',
    extensao: 'jpg',
    casa: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extensao: 'png',
    casa: (b) => b.subarray(0, 8).equals(PNG_ASSINATURA),
  },
  {
    mimeType: 'image/webp',
    extensao: 'webp',
    // Container RIFF genérico: só é WEBP se o form-type no offset 8 confirmar.
    casa: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
]

// Devolve null p/ qualquer coisa fora dos 4 formatos aceitos (o chamador
// responde 400). Falha fechada: na dúvida, não é suportado.
export function detectarTipoArquivo(buffer: Buffer): FormatoArquivo | null {
  if (buffer.length < BYTES_MINIMOS) return null
  const achado = ASSINATURAS.find((a) => a.casa(buffer))
  return achado ? { mimeType: achado.mimeType, extensao: achado.extensao } : null
}
