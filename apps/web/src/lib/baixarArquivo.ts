// Entrega um arquivo gerado no navegador (CSV, .ics) como download.

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
