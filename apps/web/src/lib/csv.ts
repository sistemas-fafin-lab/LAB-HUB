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

/** Baixa `conteudo` como `nomeArquivo` e libera a URL temporária. */
export function baixarArquivo(nomeArquivo: string, conteudo: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
