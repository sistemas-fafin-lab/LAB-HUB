// ---------------------------------------------------------------------------
// CSV para abrir no Excel em pt-BR: separador ";", BOM UTF-8 (sem ele o Excel
// lê os acentos errado) e quebra de linha CRLF.
// ---------------------------------------------------------------------------

const SEPARADOR = ';'

/** Campo com separador, aspas ou quebra de linha vai entre aspas, com as aspas dobradas. */
function campo(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

export function gerarCsv(cabecalho: readonly string[], linhas: readonly (readonly string[])[]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(campo).join(SEPARADOR)).join('\r\n') + '\r\n'
}
