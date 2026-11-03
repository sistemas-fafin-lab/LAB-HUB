import { WIcon } from '../components/primitives/WIcon'

// ---------------------------------------------------------------------------
// 404 provisória, no visual antigo. A versão no LAB DS chega com as telas de
// sistema (issue 13). Serve também para o exame/laudo que não existe mais
// (link antigo, exame de outra conta): `titulo` e `descricao` mudam, a saída
// é a mesma.
// ---------------------------------------------------------------------------

interface NotFoundPageProps {
  dark: boolean
  titulo?: string
  descricao?: string
  voltarPara?: string
  voltarRotulo?: string
}

export function NotFoundPage({
  dark,
  titulo = 'Página não encontrada',
  descricao = 'O endereço que você abriu não existe ou mudou de lugar.',
  voltarPara = '/',
  voltarRotulo = 'Voltar para a visão geral',
}: NotFoundPageProps) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div
        className={`h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
          dark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-500'
        }`}
      >
        <WIcon name="search-x" className="w-6 h-6" strokeWidth={2.2} />
      </div>
      <h1 className={`text-2xl font-bold mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>{titulo}</h1>
      <p className="text-sm text-gray-500 mb-6">{descricao}</p>
      {/* <a> comum: o router intercepta links internos (lib/router.ts). */}
      <a
        href={voltarPara}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
      >
        <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />
        {voltarRotulo}
      </a>
    </div>
  )
}
