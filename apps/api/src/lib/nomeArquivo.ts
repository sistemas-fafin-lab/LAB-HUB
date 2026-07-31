// Nome de arquivo para exibição/download.
//
// Estava duplicado em routes/documentos.ts e routes/integracao.ts, com o
// comentário de que ficava local "para não acoplar os dois arquivos de rota".
// O argumento não se sustenta contra um módulo de lib — nenhuma rota passa a
// depender da outra —, e o custo da cópia é real: a remoção de `\r\n` existe
// para impedir injeção de header no `Content-Disposition`, e essa é justamente
// a linha que não pode enfraquecer numa cópia e continuar forte na outra.

// Teto de caracteres do nome guardado/exibido.
const NOME_MAX_CHARS = 120

/**
 * Corta o nome, remove quebras de linha e garante algo não-vazio.
 *
 * As quebras de linha não são cosmética: o nome vai para o `Content-Disposition`
 * da signed URL de download, e um `\r\n` ali permitiria escrever um header novo.
 */
export function sanitizarNome(original: string | undefined, extensao: string): string {
  const limpo = (original ?? '')
    .replace(/[\r\n\t]/g, '')
    .trim()
    .slice(0, NOME_MAX_CHARS)
  return limpo || `documento.${extensao}`
}
