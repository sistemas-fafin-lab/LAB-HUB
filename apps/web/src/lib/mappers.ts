import type { Laudo, Resultado } from '@lab-hub/shared'
import type { Exam } from '../components/shared/WebHero'

// As duas fontes de resultado do LAB-HUB convergem aqui para o mesmo `Exam`:
//   Resultado → o que o FlowLab EMPURRA pelo webhook (tabela `resultados`)
//   Laudo     → o que a API BUSCA nos LIS (ApLIS/AOL, tabela `exam_results`)
// Ver docs/LAUDOS_LIS.md.
//
// Campos sem origem no Resultado (unidade/médico/CRM) ficam como placeholder até
// virem do snapshot do agendamento/laudo.
const PLACEHOLDER = '—'

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const longDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * "2026-07-24" → "24 de julho de 2026".
 *
 * Lê os pedaços da string em vez de passar por `new Date`: uma data SEM hora
 * vira meia-noite UTC, e formatá-la no fuso de Brasília (UTC-3) devolveria o
 * dia anterior. Num laudo isso seria uma data de coleta errada por um dia.
 */
function dataPorExtenso(iso: string | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return undefined
  const mes = MESES[Number(m[2]) - 1]
  return mes ? `${m[3]} de ${mes} de ${m[1]}` : undefined
}

/** "2026-07-24" → "24 Jul 2026". Mesmo cuidado com fuso do dataPorExtenso. */
function dataCurta(iso: string | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return undefined
  const mes = MESES[Number(m[2]) - 1]
  if (!mes) return undefined
  return `${m[3]} ${mes.slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${m[1]}`
}

export function resultadoToExam(r: Resultado): Exam {
  const liberado = r.liberadoEm ? new Date(r.liberadoEm) : null

  return {
    id: r.id,
    name: r.exameNome,
    category: r.categoria ?? PLACEHOLDER,
    date: liberado ? shortDate.format(liberado) : PLACEHOLDER,
    fullDate: liberado ? longDate.format(liberado) : PLACEHOLDER,
    unit: PLACEHOLDER,
    doctor: PLACEHOLDER,
    crm: PLACEHOLDER,
    status: r.status,
    summary: r.resumo ?? '',
    panels: r.paineis.map((p) => ({
      name: p.nome,
      value: p.valor,
      unit: p.unidade,
      ref: p.ref,
      ok: p.ok,
      trend: p.trend ?? [],
    })),
    ...(r.declaracaoUrl ? { declaracaoUrl: r.declaracaoUrl } : {}),
    // FlowLab não informa coleta — a liberação faz as vezes no filtro de período.
    ...(r.liberadoEm ? { coletadoEm: r.liberadoEm } : {}),
    // Sem `dataColeta` de propósito: o FlowLab só manda a liberação, e o campo
    // "Coleta" do laudo fica '—' em vez de repetir a data de liberação.
    ...(liberado ? { dataEmissao: longDate.format(liberado) } : {}),
    // A API manda o id da versão que substituiu esta; a tela só precisa saber
    // que ela foi substituída.
    ...(r.retificadoPor ? { retificado: true } : {}),
    origem: 'flowlab',
  }
}

// Quantos exames um pedido consolidado reúne. Cada exame é um grupo, mas o
// hemograma entra com uma seção por série ("HEMOGRAMA — Série Branca"), então a
// contagem deduplica pelo nome antes do travessão. Laudo que não é pedido não
// tem contagem — o card já É um exame só.
function totalExamesDoPedido(l: Laudo): number | null {
  if (l.exam_type !== 'pedido' || !l.groups?.length) return null
  return new Set(l.groups.map((g) => g.name.split(' — ')[0])).size
}

// Mapeia o Laudo vindo dos LIS. Ao contrário do Resultado, ele traz unidade,
// médico, CRM, material e método — os campos que a tela mostrava como '—'.
export function laudoToExam(l: Laudo): Exam {
  const totalExames = totalExamesDoPedido(l)
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    // O Laudo já vem com as datas formatadas em pt-BR pela API (o mapeamento
    // acontece lá porque os LIS mandam formatos diferentes entre si).
    date: l.date,
    fullDate: l.fullDate,
    unit: l.unit || PLACEHOLDER,
    doctor: l.doctor || PLACEHOLDER,
    crm: l.crm || PLACEHOLDER,
    // 'pending' (resultado não liberado) e 'partial' (faltou uma das fontes)
    // são ambos "ainda não está pronto" para o paciente — a UI só tem dois
    // estados (WStatus).
    status: l.status === 'ready' ? 'ready' : 'analyzing',
    summary: l.summary,
    panels: l.panels.map((p) => ({
      name: p.name,
      value: p.value,
      unit: p.unit,
      ref: p.ref,
      ok: p.ok,
      trend: p.trend,
    })),
    origem: 'lis',
    ...(l.data_coleta || l.data_emissao ? { coletadoEm: l.data_coleta || l.data_emissao } : {}),
    // As duas datas vêm em ISO e separadas do LIS — só o `date`/`fullDate` é que
    // colapsa as duas numa só para o card.
    ...(dataPorExtenso(l.data_coleta) ? { dataColeta: dataPorExtenso(l.data_coleta)! } : {}),
    ...(dataPorExtenso(l.data_emissao) ? { dataEmissao: dataPorExtenso(l.data_emissao)! } : {}),
    ...(dataCurta(l.data_coleta) ? { dataColetaCurta: dataCurta(l.data_coleta)! } : {}),
    // `codigo_lis` é a requisição no LIS; a OS da AOL entra quando o laudo só
    // existe lá (em laudo fundido vem como lista separada por vírgula).
    ...(l.codigo_lis || l.codigo_os ? { numeroLaudo: l.codigo_lis || l.codigo_os } : {}),
    ...(l.material ? { material: l.material } : {}),
    ...(l.metodo ? { metodo: l.metodo } : {}),
    ...(l.laboratorio?.nome ? { laboratorio: l.laboratorio.nome } : {}),
    ...(l.groups?.length ? { groups: l.groups } : {}),
    ...(totalExames ? { totalExames } : {}),
  }
}
