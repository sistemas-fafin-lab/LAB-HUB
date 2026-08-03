import { isIP } from 'node:net'
import type { FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'

// Trilha de auditoria de ACESSO a dado de saúde (S-08 / LGPD arts. 37 e 38).
// Grava metadado de quem leu o quê, quando e de onde — NUNCA o conteúdo lido.
// Ver a migration 20260803140000 para o desenho da tabela.

/**
 * Canal por onde o acesso entrou.
 *
 * `'paciente'` = portal, JWT validado por middlewares/auth.ts.
 * `'flowlab'`  = integração server-to-server, API key (middlewares/apiKey.ts).
 *
 * São canais de autorização diferentes, não papéis de usuário: quem se
 * apresenta como FlowLab tem uma chave, não uma identidade. Distinguir os dois
 * na trilha é o que permite responder "isto saiu pelo portal ou pela
 * integração?" sem inferir pela rota.
 */
export type AtorTipo = 'paciente' | 'flowlab'

/** Uma leitura de dado sensível que foi de fato entregue ao cliente. */
export interface RegistroAcesso {
  atorTipo: AtorTipo
  /** `pacientes.id` no canal do portal. Ausente no canal do FlowLab: é um sistema. */
  atorId?: string
  /** Paciente dono do dado lido. Diferente de `atorId` num acesso de portal = anomalia. */
  titularId?: string
  /** Verbo canônico, no formato `recurso.operação` — ver ACOES abaixo. */
  acao: Acao
  recursoTipo?: 'exam_result' | 'documento' | 'resultado' | 'agendamento' | 'paciente'
  /** Id do recurso quando a leitura é de UM. Em listagem use `quantidade`. */
  recursoId?: string
  /** Quantos registros a resposta expôs. Só faz sentido em listagem. */
  quantidade?: number
}

/**
 * Vocabulário fechado das ações.
 *
 * String livre aqui envelheceria mal do jeito mais chato possível: a consulta de
 * incidente é escrita meses depois, contra `acao = '...'`, e não existe erro
 * nenhum quando o valor gravado é `'laudo.ler'` num lugar e `'laudos.ler'` em
 * outro — a consulta simplesmente devolve menos linhas do que houve. O union
 * transforma essa divergência em erro de compilação.
 */
export const ACOES = [
  'laudos.listar',
  'laudos.ler',
  'resultados.listar',
  'resultado.declaracao',
  'documento.url',
  'integracao.documentos.listar',
  'integracao.pacientes.buscar',
] as const

export type Acao = (typeof ACOES)[number]

/**
 * Endereço de origem da requisição, ou `null` quando não é possível determinar.
 *
 * `request.ip` já vem resolvido pelo X-Forwarded-For (o `trustProxy` do
 * server.ts), mas ele NÃO é validado pelo Fastify: com um número de saltos
 * configurado a mais — ou numa topologia sem proxy — o valor passa a vir de um
 * header que o cliente escreve, e "'; drop" chegaria aqui como se fosse um
 * endereço. A coluna é `inet` e recusaria, o que transformaria uma requisição
 * comum num buraco na trilha. Validar antes é o que faz o campo degradar para
 * nulo em vez de derrubar a linha inteira.
 */
export function ipDaRequisicao(request: Pick<FastifyRequest, 'ip'>): string | null {
  const bruto = request.ip?.trim()
  if (!bruto) return null
  // `::ffff:187.0.0.1` é o mesmo IPv4 escrito em forma mapeada; o Postgres
  // aceita e normaliza, então não desmontamos aqui.
  return isIP(bruto) ? bruto : null
}

/**
 * Grava a linha da trilha. Nunca lança.
 *
 * **Por que é aguardado e não fire-and-forget.** A tentação é `void`: a trilha
 * não deveria custar latência ao paciente. Mas um insert solto some quando o
 * processo reinicia entre a resposta e a escrita, e o modo de falha de uma
 * trilha incompleta é traiçoeiro — ela não fica vazia (o que alguém notaria),
 * fica com buracos que só aparecem no dia em que se procura uma linha
 * específica e ela não está lá. Sem uma trilha em que se confie, a resposta à
 * ANPD volta a ser "não sabemos" com passos extras. O custo é uma ida ao banco
 * por leitura sensível — irrelevante ao lado do próprio SELECT que a rota
 * acabou de fazer, e ruído no GET /laudos, que fala com dois LIS.
 *
 * **Por que a falha não derruba a leitura.** A leitura estrita da LGPD diria que
 * sem trilha não pode haver acesso. Na prática isso amarra a disponibilidade do
 * portal à da trilha: uma indisponibilidade do banco de auditoria tiraria do ar
 * o laudo de todo mundo, e negar cuidado de saúde é o dano maior. A escolha é
 * registrar o que der e gritar quando não der — o `log.error` abaixo carrega o
 * registro INTEIRO, então a linha perdida não some: ela cai no log da API, que é
 * a trilha de reserva. Só o `err` é assunto de operação; o resto é a evidência.
 */
export async function registrarAcesso(
  request: Pick<FastifyRequest, 'ip' | 'log'>,
  registro: RegistroAcesso,
): Promise<void> {
  const linha = {
    ator_tipo: registro.atorTipo,
    ator_id: registro.atorId ?? null,
    titular_id: registro.titularId ?? null,
    acao: registro.acao,
    recurso_tipo: registro.recursoTipo ?? null,
    recurso_id: registro.recursoId ?? null,
    quantidade: registro.quantidade ?? null,
    ip: ipDaRequisicao(request),
  }

  try {
    const { error } = await supabase.from('auditoria_acesso').insert(linha)
    if (error) {
      request.log.error({ err: error, auditoria: linha }, 'Trilha de auditoria não gravada (S-08)')
    }
  } catch (err) {
    // O catch cobre o que o `error` do PostgREST não cobre: rede caída, DNS,
    // qualquer throw do client. Sem ele, a rejeição derrubaria a rota — o
    // oposto exato do que o parágrafo acima decidiu.
    request.log.error({ err, auditoria: linha }, 'Trilha de auditoria não gravada (S-08)')
  }
}
