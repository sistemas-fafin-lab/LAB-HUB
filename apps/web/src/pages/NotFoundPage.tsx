import { ConteudoDeSistema } from '../components/sistema/TelaDeSistema'

// ---------------------------------------------------------------------------
// 404 dentro do shell (o menu segue disponível). Serve também para o exame ou
// laudo que não existe mais (link antigo, exame de outra conta): `titulo`,
// `descricao` e a volta mudam; o "404" grande fica só na página inexistente.
// ---------------------------------------------------------------------------

interface NotFoundPageProps {
  titulo?: string
  descricao?: string
  voltarPara?: string
  voltarRotulo?: string
}

export function NotFoundPage({ titulo, descricao, voltarPara = '/', voltarRotulo = 'Voltar ao início' }: NotFoundPageProps) {
  return (
    <ConteudoDeSistema
      tipo="nao-encontrada"
      mostrarCodigo={titulo === undefined}
      {...(titulo !== undefined ? { titulo } : {})}
      {...(descricao !== undefined ? { texto: descricao } : {})}
      acao={{ rotulo: voltarRotulo, href: voltarPara }}
    />
  )
}
