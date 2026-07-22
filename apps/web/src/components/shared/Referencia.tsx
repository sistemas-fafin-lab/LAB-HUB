interface ReferenciaProps {
  texto: string
  dark?: boolean
}

/**
 * Célula de "Referência" de um marcador.
 *
 * Referência de uma linha ("0,70 a 1,30 mg/dL") aparece inteira. As tabelas
 * multilinha da AOL (faixas por idade/sexo) ocupariam a altura de várias
 * linhas da lista, então viram UMA linha truncada (quebras trocadas por " · ",
 * overflow escondido) e a tabela completa aparece num balão ao passar o mouse.
 *
 * Na impressão não existe hover: as regras @media print do index.html
 * (.ref-resumo / .ref-completa) escondem o resumo e imprimem a tabela
 * completa no fluxo normal do documento.
 */
export function Referencia({ texto, dark = false }: ReferenciaProps) {
  if (!texto.includes('\n')) {
    return <div className="text-xs text-gray-500 whitespace-pre-line">{texto}</div>
  }

  return (
    <div className="relative group min-w-0">
      <div className="ref-resumo text-xs text-gray-500 truncate cursor-help">
        {texto.replace(/\n+/g, ' · ')}
      </div>
      {/* pt-1 no wrapper (e não margin no cartão) mantém a área de hover
          contínua: dá para levar o mouse até o balão sem ele sumir. */}
      <div className="ref-completa hidden group-hover:block absolute top-full left-0 z-20 pt-1 w-max">
        <div
          className={`max-w-[24rem] rounded-xl border p-3 text-xs tabular-nums whitespace-pre-line shadow-lg ${
            dark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-600'
          }`}
        >
          {texto}
        </div>
      </div>
    </div>
  )
}
