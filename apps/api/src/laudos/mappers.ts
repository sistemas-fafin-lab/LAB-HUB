import { randomUUID } from 'node:crypto'
import type { AolExam, AplisExam, AplisRequisicao, Laudo, LaudoLaboratorio } from './types.js'
import { resolveStrategy } from './registry.js'
import {
  buildDateStrings,
  buildSummaryQuantitative,
  DEFAULT_LABORATORIO,
  isOutOfRange,
  toTrend,
  type PerfilPaciente,
} from './mapperHelpers.js'

export { resolveStrategy, STRATEGIES } from './registry.js'

/**
 * Mapeia AOL (+ ApLIS, quando existe) para o Laudo canônico, delegando à
 * estratégia do tipo de exame. `perfil` (idade/sexo) reduz a referência
 * estratificada da AOL à linha do paciente.
 */
export function mapExamResult(
  aol: AolExam,
  aplis: AplisExam | null,
  examType: string,
  cpf: string,
  perfil?: PerfilPaciente,
): Laudo {
  return resolveStrategy(examType).map(aol, aplis, cpf, perfil)
}

// Médico, material e método variam por exame — só sobrevivem no cabeçalho se
// forem unânimes; senão a tela omite a linha (melhor do que afirmar que um
// responsável assinou o pedido inteiro quando assinou um exame).
function campoUnanime(laudos: Laudo[], de: (e: Laudo) => string): string {
  const valores = new Set(laudos.map(de))
  return valores.size === 1 ? (valores.values().next().value as string) : ''
}

// Todos iguais → o status comum; misto com algum pronto → partial.
function statusCombinado(laudos: Laudo[]): Laudo['status'] {
  const statuses = new Set(laudos.map((e) => e.status))
  return statuses.size === 1 ? laudos[0]!.status : statuses.has('ready') ? 'partial' : 'pending'
}

/**
 * Compila os laudos individuais de uma OS num único laudo por PEDIDO.
 *
 * A granularidade da tela é a coleta, não o exame: 36 exames numa OS viram UM
 * card, e cada exame entra como um grupo de marcadores com o próprio nome como
 * título de seção — a mesma estrutura que o hemograma já usa para as séries
 * (que aqui entram prefixadas pelo nome do exame). Isso evita o defeito do
 * formato consolidado original, que concatenava todos os analitos numa lista
 * única sob o nome do primeiro exame.
 *
 * `dataColetaPedido` (dtaColeta da requisição, formato do ApLIS) vira a chave
 * `data_coleta_pedido` — é ela que permite fundir depois uma OS órfã da mesma
 * coleta (ver fundirPedidosPorColeta).
 */
export function consolidaLaudosDaOs(
  porExame: Laudo[],
  nomePedido?: string | null,
  dataColetaPedido?: string | null,
): Laudo {
  const coletaPedido = buildDateStrings(dataColetaPedido ?? null).iso
  const primeiro = porExame[0]!
  if (porExame.length === 1) {
    return coletaPedido ? { ...primeiro, data_coleta_pedido: coletaPedido } : primeiro
  }

  const groups = porExame.flatMap((exame) =>
    exame.groups?.length
      ? exame.groups.map((g) => ({ name: `${exame.name} — ${g.name}`, panels: g.panels }))
      : [{ name: exame.name, panels: exame.panels }],
  )
  const panels = porExame.flatMap((e) => e.panels)
  const results = porExame.flatMap((e) => e.results ?? [])

  // Emissão do pedido = a do exame liberado por último; a coleta é uma só.
  const maisRecente = porExame.reduce((a, b) =>
    (b.data_emissao ?? '') > (a.data_emissao ?? '') ? b : a,
  )

  return {
    ...primeiro,
    id: randomUUID(),
    name: nomePedido || 'Exames Laboratoriais',
    category: 'Análises Clínicas',
    date: maisRecente.date,
    fullDate: maisRecente.fullDate,
    data_emissao: maisRecente.data_emissao,
    material: campoUnanime(porExame, (e) => e.material),
    metodo: campoUnanime(porExame, (e) => e.metodo),
    doctor: campoUnanime(porExame, (e) => e.doctor),
    crm: campoUnanime(porExame, (e) => e.crm),
    status: statusCombinado(porExame),
    summary: `${porExame.length} exames no pedido. ${buildSummaryQuantitative(panels)}`,
    panels,
    results,
    groups,
    exam_type: 'pedido',
    partial: porExame.some((e) => e.partial),
    ...(coletaPedido ? { data_coleta_pedido: coletaPedido } : {}),
  }
}

// Card sem grupos (exame único) entra na fusão como um grupo com o próprio nome.
function comoGrupos(laudo: Laudo): NonNullable<Laudo['groups']> {
  return laudo.groups?.length ? laudo.groups : [{ name: laudo.name, panels: laudo.panels }]
}

/**
 * Funde na lista final as OS ÓRFÃS — OS da AOL cujo `idOsLis` foi digitado como
 * CPF e que por isso viraram card próprio ("Exames Laboratoriais") em vez de
 * entrar no card do pedido.
 *
 * O elo é a data: um pedido despachado em duas remessas (sangue no dia da
 * coleta, fezes/urina quando o paciente entrega) vira duas OS no Álvaro, mas a
 * requisição do ApLIS é uma só e a sua dtaColeta é a da coleta original — a
 * mesma que a AOL registra na OS de sangue. Então: órfã cuja `data_coleta` bate
 * com o `data_coleta_pedido` de EXATAMENTE UM pedido é remessa dele e os cards
 * se fundem. Zero candidatos (pedido antigo no cache, ainda sem a chave) ou
 * mais de um (duas requisições na mesma data) mantém a órfã como card próprio —
 * duplicar na tela é melhor que fundir no pedido errado.
 */
export function fundirPedidosPorColeta(laudos: Laudo[]): Laudo[] {
  const orfas = laudos.filter((l) => l.source === 'aol' && !l.codigo_lis && l.data_coleta)
  if (orfas.length === 0) return laudos

  const remessasPorPedido = new Map<Laudo, Laudo[]>()
  const absorvidas = new Set<Laudo>()

  for (const orfa of orfas) {
    const candidatos = laudos.filter(
      (l) => l.codigo_lis && l.data_coleta_pedido === orfa.data_coleta,
    )
    if (candidatos.length !== 1) continue
    const pedido = candidatos[0]!
    remessasPorPedido.set(pedido, [...(remessasPorPedido.get(pedido) ?? []), orfa])
    absorvidas.add(orfa)
  }
  if (absorvidas.size === 0) return laudos

  return laudos
    .filter((l) => !absorvidas.has(l))
    .map((l) => {
      const remessas = remessasPorPedido.get(l)
      return remessas ? fundeRemessas(l, remessas) : l
    })
    .sort((a, b) => (b.data_emissao ?? '').localeCompare(a.data_emissao ?? ''))
}

function fundeRemessas(pedido: Laudo, orfas: Laudo[]): Laudo {
  // Remessas em ordem de coleta: o paciente vê primeiro o que colheu primeiro.
  const partes = [pedido, ...orfas].sort((a, b) =>
    (a.data_coleta ?? '').localeCompare(b.data_coleta ?? ''),
  )
  const groups = partes.flatMap(comoGrupos)
  const panels = partes.flatMap((p) => p.panels)
  const results = partes.flatMap((p) => p.results ?? [])
  const maisRecente = partes.reduce((a, b) => ((b.data_emissao ?? '') > (a.data_emissao ?? '') ? b : a))
  const coletas = partes.map((p) => p.data_coleta).filter(Boolean).sort()
  // O hemograma entra com uma seção por série ("HEMOGRAMA — Série Branca");
  // contar grupos inflaria o total, então deduplica pelo nome antes do travessão.
  const totalExames = new Set(groups.map((g) => g.name.split(' — ')[0])).size

  return {
    ...pedido,
    date: maisRecente.date,
    fullDate: maisRecente.fullDate,
    data_coleta: coletas[0] ?? pedido.data_coleta,
    data_registro: coletas[0] ?? pedido.data_registro,
    data_emissao: maisRecente.data_emissao,
    material: campoUnanime(partes, (e) => e.material),
    metodo: campoUnanime(partes, (e) => e.metodo),
    doctor: campoUnanime(partes, (e) => e.doctor),
    crm: campoUnanime(partes, (e) => e.crm),
    status: statusCombinado(partes),
    summary: `${totalExames} exames no pedido. ${buildSummaryQuantitative(panels)}`,
    panels,
    results,
    groups,
    exam_type: 'pedido',
    // Rastro das duas OS — a lista separada por vírgula preserva a origem.
    codigo_os: partes.map((p) => p.codigo_os).filter(Boolean).join(','),
    source: 'merged',
    partial: partes.some((p) => p.partial),
  }
}

// Positivo/Negativo comparado à referência do painel ("NEGATIVO"). Sem os dois
// lados não há comparação — devolve true, como o isOutOfRange numérico.
function conclusaoDentroDaReferencia(conclusao: string | null, referencia: string | null): boolean {
  if (!conclusao || !referencia) return true
  return conclusao.trim().toLowerCase() === referencia.trim().toLowerCase()
}

// Resumo de um laudo descritivo: a seção CONCLUSÃO quando existe, senão o
// começo do texto. É o que o card mostra sob o nome do exame.
function resumoDoLaudoTexto(texto: string): string {
  const linhas = texto.split('\n').map((l) => l.trim())
  const i = linhas.findIndex((l) => /^conclus[ãa]o:?$/i.test(l))
  if (i >= 0) {
    const corpo = linhas.slice(i + 1).filter(Boolean).join(' ')
    if (corpo) return corpo.slice(0, 200)
  }
  return texto.slice(0, 200)
}

interface ConteudoAplis {
  panels: Laudo['panels']
  groups?: Laudo['groups']
  results: NonNullable<Laudo['results']>
  temResultado: boolean
  metodo: string
  summary: string
}

const AGUARDANDO = 'Aguardando liberação do resultado pelo laboratório.'

// O resultado de uma requisição vem em três formatos (ver AplisRequisicao);
// aqui cada um vira panels/groups/summary no shape que a tela já entende.
function montaConteudoAplis(req: AplisRequisicao): ConteudoAplis {
  // 1) Biologia molecular (PCR): cada painel vira um GRUPO (seção) e cada alvo
  //    um marcador Positivo/Negativo comparado à referência do painel.
  if (req.paineis?.length) {
    const groups = req.paineis.map((painel) => ({
      name: painel.nome,
      panels: painel.resultados.map((r) => ({
        name: r.nome,
        value: r.conclusao ?? '—',
        unit: '',
        ref: painel.referencia ?? '',
        ok: conclusaoDentroDaReferencia(r.conclusao, painel.referencia),
        trend: [],
      })),
    }))
    const panels = groups.flatMap((g) => g.panels)
    const results = req.paineis.flatMap((painel) =>
      painel.resultados.map((r) => {
        const ok = conclusaoDentroDaReferencia(r.conclusao, painel.referencia)
        return {
          name: r.nome,
          value: r.conclusao,
          unit: '',
          reference_value: painel.referencia,
          is_out_of_range: r.conclusao ? !ok : null,
          status: (r.conclusao ? (ok ? 'ok' : 'abnormal') : 'pending') as
            | 'ok'
            | 'abnormal'
            | 'pending'
            | 'error',
        }
      }),
    )
    const temResultado = panels.some((p) => p.value !== '—')
    const metodos = new Set(req.paineis.map((p) => p.metodo ?? ''))
    return {
      panels,
      groups,
      results,
      temResultado,
      metodo: metodos.size === 1 ? (metodos.values().next().value as string) : '',
      summary: temResultado ? buildSummaryQuantitative(panels) : AGUARDANDO,
    }
  }

  // 2) Patologia/citologia: o texto inteiro vira o marcador "Laudo" — a mesma
  //    convenção das estratégias de laudo em texto da AOL.
  if (req.laudo_texto) {
    return {
      panels: [{ name: 'Laudo', value: req.laudo_texto, unit: '', ref: '', ok: true, trend: [] }],
      results: [
        {
          name: 'Laudo',
          value: req.laudo_texto,
          unit: '',
          reference_value: null,
          is_out_of_range: null,
          status: 'ok',
        },
      ],
      temResultado: true,
      metodo: '',
      summary: resumoDoLaudoTexto(req.laudo_texto),
    }
  }

  // 3) Análises clínicas (procedimentos) — o caminho original.
  const panels = req.procedimentos.map((p) => ({
    name: p.nome,
    value: p.resultado ?? '—',
    unit: p.unidade ?? '',
    ref: p.valor_referencia ?? '',
    ok: !isOutOfRange(p.resultado, p.valor_referencia),
    trend: toTrend(p.resultado),
  }))

  // `results` preserva o dado cru (null = ainda não liberado), enquanto `panels`
  // já está formatado para a tela. A UI usa panels; results fica para quem
  // precisar distinguir "sem valor" de "valor vazio".
  const results = req.procedimentos.map((p) => ({
    name: p.nome,
    value: p.resultado,
    unit: p.unidade ?? '',
    reference_value: p.valor_referencia,
    is_out_of_range: isOutOfRange(p.resultado, p.valor_referencia),
    status: (p.resultado ? 'ok' : 'pending') as 'ok' | 'abnormal' | 'pending' | 'error',
  }))

  // Um procedimento liberado já basta para o laudo aparecer como pronto; os
  // demais chegam nas próximas revalidações.
  const temResultado = req.procedimentos.some((p) => p.resultado !== null)
  return {
    panels,
    results,
    temResultado,
    metodo: '',
    // O resumo segue o status: exame pendente NÃO pode afirmar que há resultado
    // ("Resultado disponível no laudo." era o texto herdado — mentia para o
    // paciente, já que nada foi liberado e laudo do LIS não tem PDF na UI).
    summary: temResultado ? buildSummaryQuantitative(panels) : AGUARDANDO,
  }
}

/**
 * Mapeia uma requisição do ApLIS para Laudo SEM dados da AOL.
 *
 * É o caminho usado quando o exame só existe no ApLIS (sem OS na AOL) — hoje, a
 * maioria. Não passa pelas estratégias: sem a AOL não há código de tipo para
 * resolver, e os formatos do ApLIS são uniformes por módulo (ver
 * montaConteudoAplis).
 */
export function mapAplisResult(req: AplisRequisicao, _cpf: string): Laudo {
  const coleta = buildDateStrings(req.data_solicitacao)
  const emissao = buildDateStrings(req.data_liberacao)
  const exibicao = emissao.iso ? emissao : coleta

  const laboratorio: LaudoLaboratorio = req.local.nome
    ? { nome: req.local.nome, cnes: req.local.cnes ?? '', endereco: req.local.endereco ?? '' }
    : DEFAULT_LABORATORIO

  const { panels, groups, results, temResultado, metodo, summary } = montaConteudoAplis(req)

  return {
    id: randomUUID(),
    name: req.tipo_exame ?? req.procedimentos[0]?.nome ?? 'Exame ApLIS',
    category: req.tipo_exame ?? 'Análises Clínicas',
    date: exibicao.date,
    fullDate: exibicao.fullDate,
    data_coleta: coleta.iso || emissao.iso,
    data_registro: coleta.iso || emissao.iso,
    data_emissao: emissao.iso || coleta.iso,
    // No caminho só-ApLIS a coleta do card É a da requisição — registrar a
    // chave permite que uma OS órfã da mesma coleta se funda a este card.
    ...(coleta.iso ? { data_coleta_pedido: coleta.iso } : {}),
    // Material só existe no XML da AOL; a tela omite a linha vazia.
    material: '',
    metodo,
    laboratorio,
    unit: req.local.nome || 'ApLIS',
    doctor: req.responsavel?.nome ?? '',
    crm: req.responsavel?.crm ?? '',
    status: temResultado ? 'ready' : 'pending',
    summary,
    panels,
    results,
    ...(groups?.length ? { groups } : {}),
    exam_type: req.tipo_exame ?? 'aplis',
    codigo_os: '',
    codigo_lis: req.cod_requisicao,
    source: 'aplis',
    partial: !temResultado,
  }
}
