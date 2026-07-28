import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Laudo, LaudoPainel, PainelResultado } from '@lab-hub/shared'

// ---------------------------------------------------------------------------
// Semeia resultados de DEMONSTRAÇÃO na conta de teste, um por variação VISUAL
// que as telas sabem renderizar. Serve para olhar o layout sem depender do que
// ApLIS/AOL/FlowLab estiverem devolvendo no dia.
//
// Cobre as duas fontes (ver docs/LAUDOS_LIS.md):
//   `exam_results` → laudo dos LIS (grupos, ficha técnica, nº do laudo)
//   `resultados`   → o que o FlowLab empurra pelo webhook (sem médico/material)
//
// Uso:
//   npx tsx scripts/seed-resultados-demo.ts [--email teste@gmail.com] [--limpar]
//
//   --limpar   remove só as linhas deste script (pelos códigos/nomes abaixo) e
//              sai. As linhas semeadas antes dele — BACT/BIOG/PCC/COLP — e as
//              vindas dos LIS de verdade não são tocadas em nenhum dos modos.
//
// Rodar de novo sobrescreve as próprias linhas (apaga e insere), então dá para
// editar o conteúdo daqui e ver o efeito na tela sem limpar antes.
//
// Os códigos são fictícios e não existem nos LIS: na revalidação em background
// o `requisicaoResultado` falha, a linha é pulada e o cache semeado sobrevive
// (ver #mapearSoApLIS em src/laudos/service.ts).
//
// Todos os laudos daqui são de fonte 'aol' ou 'merged' — os valores vêm do
// Álvaro Online. Com LAUDOS_SOMENTE_ALVARO ligado (o padrão), laudo 'aplis' não
// aparece na tela, e uma demo invisível não serve para revisar layout nenhum.
// ---------------------------------------------------------------------------

const EMAIL_PADRAO = 'teste@gmail.com'

const argv = process.argv.slice(2)
const email = argv[argv.indexOf('--email') + 1] ?? EMAIL_PADRAO
const soLimpar = argv.includes('--limpar')

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// ---------------------------------------------------------------------------
// Helpers de montagem
// ---------------------------------------------------------------------------

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "2026-07-23" → { date: "23 Jul 2026", fullDate: "23 de julho de 2026" } */
function datas(iso: string): { date: string; fullDate: string } {
  const [ano, mes, dia] = iso.split('-') as [string, string, string]
  const nome = MESES[Number(mes) - 1]!
  return {
    date: `${dia} ${nome.slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${ano}`,
    fullDate: `${dia} de ${nome} de ${ano}`,
  }
}

/** Marcador numérico. `ok: false` sai em âmbar com "Atenção" na tela. */
function marcador(
  name: string,
  value: string,
  unit: string,
  ref: string,
  ok = true,
  trend: number[] = [],
): LaudoPainel {
  return { name, value, unit, ref, ok, trend }
}

type LaudoDemo = Omit<Laudo, 'id' | 'date' | 'fullDate' | 'panels' | 'laboratorio'> & {
  panels?: LaudoPainel[]
}

/**
 * Completa os campos derivados que o mapeamento normal preencheria: id sorteado,
 * datas de exibição a partir da emissão (ou da coleta, quando ainda não houve
 * emissão) e `panels` achatado a partir dos grupos — a tela usa os grupos para
 * desenhar e `panels.length` para contar os marcadores.
 */
function montaLaudo(demo: LaudoDemo): Laudo {
  const { date, fullDate } = datas(demo.data_emissao || demo.data_coleta)
  return {
    ...demo,
    id: randomUUID(),
    date,
    fullDate,
    panels: demo.panels ?? demo.groups?.flatMap((g) => g.panels) ?? [],
  } as Laudo
}

// ---------------------------------------------------------------------------
// 1. HEMOGRAMA — marcadores numéricos em GRUPOS, com valores fora da faixa e
//    série histórica (a coluna "Tendência" com sparkline só aparece quando
//    algum marcador tem 2+ pontos).
// ---------------------------------------------------------------------------

const hemograma = montaLaudo({
  name: 'HEMOGRAMA COMPLETO',
  category: 'Hematologia',
  data_coleta: '2026-07-23',
  data_registro: '2026-07-23',
  data_emissao: '2026-07-24',
  material: 'Sangue Total com EDTA',
  metodo: 'Citometria de fluxo com impedância elétrica',
  unit: 'Lab Hub',
  doctor: 'Dr. Marcelo Tavares',
  crm: 'CRM-DF 9120',
  status: 'ready',
  summary:
    '2 analito(s) fora da referência: Hemoglobina, Eosinófilos.',
  groups: [
    {
      name: 'Série Vermelha',
      panels: [
        marcador('Hemácias', '4,52', 'milhões/mm³', '4,30 a 5,70'),
        marcador('Hemoglobina', '12,8', 'g/dL', '13,5 a 17,5', false, [14.1, 13.6, 13.2, 12.8]),
        marcador('Hematócrito', '39,4', '%', '39,0 a 50,0', true, [42.8, 41.0, 40.1, 39.4]),
        marcador('VCM', '87,2', 'fL', '80,0 a 100,0'),
        marcador('HCM', '28,3', 'pg', '26,0 a 34,0'),
        marcador('CHCM', '32,5', 'g/dL', '31,0 a 36,0'),
        marcador('RDW', '14,8', '%', '11,5 a 15,5', true, [13.1, 13.9, 14.8]),
      ],
    },
    {
      name: 'Série Branca',
      panels: [
        marcador('Leucócitos', '9.850', '/mm³', '4.000 a 11.000', true, [7200, 8100, 9850]),
        marcador('Neutrófilos', '6.303', '/mm³', '1.700 a 8.000'),
        marcador('Linfócitos', '2.462', '/mm³', '900 a 2.900'),
        marcador('Monócitos', '493', '/mm³', '300 a 900'),
        marcador('Eosinófilos', '542', '/mm³', '50 a 500', false, [180, 310, 542]),
        marcador('Basófilos', '50', '/mm³', '0 a 200'),
      ],
    },
    {
      name: 'Plaquetas',
      panels: [
        marcador('Plaquetas', '212.000', '/mm³', '150.000 a 450.000', true, [244000, 228000, 212000]),
        marcador('VPM', '9,8', 'fL', '9,0 a 13,0'),
      ],
    },
  ],
  exam_type: 'HEMOGRAMA',
  codigo_os: '458201',
  codigo_lis: 'HEMO-001',
  source: 'merged',
  partial: false,
})

// ---------------------------------------------------------------------------
// 2. PERFIL LIPÍDICO — tabela SEM grupos e com referências MULTILINHA (as faixas
//    da AOL): a célula trunca em uma linha e a tabela completa abre no
//    hover/clique (Referencia.tsx).
// ---------------------------------------------------------------------------

const REF_COLESTEROL = 'Desejável: menor que 190 mg/dL\nLimítrofe: 190 a 239 mg/dL\nAlto: igual ou maior que 240 mg/dL'
const REF_LDL = 'Risco baixo: menor que 130 mg/dL\nRisco intermediário: menor que 100 mg/dL\nRisco alto: menor que 70 mg/dL\nRisco muito alto: menor que 50 mg/dL'
const REF_TRIGLICERIDES = 'Desejável: menor que 150 mg/dL\nLimítrofe: 150 a 199 mg/dL\nAlto: 200 a 499 mg/dL\nMuito alto: igual ou maior que 500 mg/dL'

const lipidico = montaLaudo({
  name: 'PERFIL LIPÍDICO',
  category: 'Bioquímica',
  data_coleta: '2026-07-22',
  data_registro: '2026-07-22',
  data_emissao: '2026-07-23',
  material: 'Soro',
  metodo: 'Enzimático colorimétrico automatizado',
  unit: 'Lab Hub',
  doctor: 'Dr. Marcelo Tavares',
  crm: 'CRM-DF 9120',
  status: 'ready',
  summary:
    '5 analito(s) fora da referência: Colesterol Total, LDL-Colesterol, Triglicerídeos, VLDL-Colesterol, Colesterol não-HDL.',
  panels: [
    marcador('Colesterol Total', '214', 'mg/dL', REF_COLESTEROL, false, [186, 198, 214]),
    marcador('HDL-Colesterol', '42', 'mg/dL', 'Desejável: igual ou maior que 40 mg/dL\nBaixo: menor que 40 mg/dL'),
    marcador('LDL-Colesterol', '138', 'mg/dL', REF_LDL, false, [112, 124, 138]),
    marcador('Triglicerídeos', '176', 'mg/dL', REF_TRIGLICERIDES, false),
    marcador('VLDL-Colesterol', '35', 'mg/dL', 'Desejável: menor que 30 mg/dL', false),
    marcador('Colesterol não-HDL', '172', 'mg/dL', 'Risco baixo: menor que 160 mg/dL\nRisco intermediário: menor que 130 mg/dL\nRisco alto: menor que 100 mg/dL', false),
  ],
  groups: [],
  exam_type: 'PERFIL LIPIDICO',
  codigo_os: '458207',
  codigo_lis: 'LIPI-001',
  source: 'merged',
  partial: false,
})

// ---------------------------------------------------------------------------
// 3. PEDIDO CONSOLIDADO — vários exames num card só (`exam_type: 'pedido'`).
//    Sem médico responsável único, então a lista troca o nome por "N exames" —
//    a contagem deduplica pelo nome antes do travessão, então o hemograma com
//    duas séries conta como UM exame.
// ---------------------------------------------------------------------------

const REF_HBA1C = 'Normal: menor que 5,7%\nPré-diabetes: 5,7 a 6,4%\nDiabetes: igual ou maior que 6,5%'

const pedido = montaLaudo({
  name: 'Exames Laboratoriais',
  category: 'Análises Clínicas',
  data_coleta: '2026-07-21',
  data_registro: '2026-07-21',
  data_emissao: '2026-07-22',
  // Material e método divergem entre os exames do pedido; o mapeamento real
  // deixa em branco nesse caso e a tela omite a ficha técnica inteira.
  material: '',
  metodo: '',
  unit: 'Lab Hub',
  doctor: '',
  crm: '',
  status: 'ready',
  summary: '7 exames no pedido. 1 analito(s) fora da referência: Glicose.',
  groups: [
    { name: 'GLICOSE', panels: [marcador('Glicose', '106', 'mg/dL', '70 a 99', false, [92, 98, 106])] },
    { name: 'HEMOGLOBINA GLICADA', panels: [marcador('Hemoglobina Glicada (HbA1c)', '5,6', '%', REF_HBA1C)] },
    { name: 'TSH', panels: [marcador('TSH', '3,12', 'µUI/mL', '0,55 a 4,78')] },
    { name: 'T4 LIVRE', panels: [marcador('T4 Livre', '1,04', 'ng/dL', '0,89 a 1,76')] },
    { name: 'UREIA', panels: [marcador('Ureia', '31', 'mg/dL', '17 a 43')] },
    {
      name: 'CREATININA',
      panels: [
        marcador('Creatinina', '0,92', 'mg/dL', '0,70 a 1,20'),
        marcador('TFG estimada (CKD-EPI)', '104', 'mL/min/1,73m²', 'Maior que 90: função renal normal\n60 a 89: redução leve\n30 a 59: redução moderada'),
      ],
    },
    {
      name: 'HEMOGRAMA — Série Vermelha',
      panels: [
        marcador('Hemácias', '4,61', 'milhões/mm³', '4,30 a 5,70'),
        marcador('Hemoglobina', '13,9', 'g/dL', '13,5 a 17,5'),
        marcador('Hematócrito', '41,2', '%', '39,0 a 50,0'),
      ],
    },
    {
      name: 'HEMOGRAMA — Série Branca',
      panels: [
        marcador('Leucócitos', '7.400', '/mm³', '4.000 a 11.000'),
        marcador('Neutrófilos', '4.292', '/mm³', '1.700 a 8.000'),
        marcador('Linfócitos', '2.294', '/mm³', '900 a 2.900'),
      ],
    },
  ],
  exam_type: 'pedido',
  codigo_os: '458213',
  codigo_lis: 'PED-001',
  source: 'merged',
  partial: false,
})

// ---------------------------------------------------------------------------
// 4. UROCULTURA — laudo AINDA NÃO LIBERADO (`status: 'pending'` vira "Em
//    análise" na tela). Mostra o card amarelo na lista e o detalhe sem tabela.
// ---------------------------------------------------------------------------

const urocultura = montaLaudo({
  name: 'UROCULTURA COM ANTIBIOGRAMA',
  category: 'Microbiologia',
  data_coleta: '2026-07-26',
  data_registro: '2026-07-26',
  data_emissao: '',
  material: 'Urina — jato médio',
  metodo: 'Semeadura quantitativa em meio cromogênico',
  unit: 'Lab Hub',
  doctor: '',
  crm: '',
  status: 'pending',
  summary: 'Cultura em incubação. O resultado final sai em até 72 horas após a coleta.',
  groups: [],
  panels: [],
  exam_type: 'UROCULTURA',
  codigo_os: '458219',
  codigo_lis: 'UROC-001',
  source: 'merged',
  partial: false,
})

// ---------------------------------------------------------------------------
// 5. CITOLOGIA DE LÍQUIDO PLEURAL — laudo descritivo no formato LEGADO: um panel
//    único chamado "Laudo" com o texto corrido, que o LaudoTexto reparte em
//    seções pelas linhas em CAIXA ALTA. (Os laudos descritivos já semeados —
//    BACT/BIOG/PCC/COLP — usam o formato novo, com grupos.)
//
//    A data também é de propósito: fevereiro põe um exame FORA das janelas de
//    30 e 90 dias, para testar o filtro de período da lista.
// ---------------------------------------------------------------------------

const TEXTO_CITOLOGIA = [
  'MATERIAL: Líquido pleural, 40 mL.',
  'MACROSCOPIA:',
  'Líquido de aspecto turvo, coloração amarelo-citrino, discretamente hemorrágico.',
  'MÉTODO:',
  'Citocentrifugação com coloração pelos métodos de Papanicolaou e Giemsa.',
  'MICROSCOPIA:',
  'Esfregaços celulares constituídos predominantemente por linfócitos maduros, macrófagos e células mesoteliais reativas, isoladas e em pequenos agrupamentos.',
  'Não se observam células neoplásicas malignas nos esfregaços examinados.',
  'CONCLUSÃO',
  'NEGATIVO PARA CÉLULAS NEOPLÁSICAS MALIGNAS',
  'Padrão citológico de derrame linfocitário, compatível com processo inflamatório crônico.',
  'Sugere-se correlação clínica e pesquisa de BAAR e ADA no líquido.',
].join('\n')

const citologia = montaLaudo({
  name: 'CITOLOGIA ONCÓTICA — LÍQUIDO PLEURAL',
  category: 'Citologia',
  data_coleta: '2026-02-10',
  data_registro: '2026-02-10',
  data_emissao: '2026-02-13',
  material: 'Líquido pleural',
  metodo: 'Papanicolaou e Giemsa',
  unit: 'Lab Hub',
  doctor: 'Dra. Larissa Mendes',
  crm: 'CRM-DF 15750',
  status: 'ready',
  summary: 'Citologia negativa para células neoplásicas malignas.',
  panels: [{ name: 'Laudo', value: TEXTO_CITOLOGIA, unit: '', ref: '', ok: true, trend: [] }],
  exam_type: 'CITOLOGIA',
  codigo_os: '451880',
  codigo_lis: 'CITO-001',
  source: 'aol',
  partial: false,
})

const LAUDOS_LIS: Laudo[] = [hemograma, lipidico, pedido, urocultura, citologia]

// ---------------------------------------------------------------------------
// 6. Resultados do FlowLab (tabela `resultados`) — a OUTRA fonte. Não tem
//    médico, material, método nem número de laudo: a tela omite esses campos em
//    vez de inventá-los, e é justamente isso que vale conferir.
// ---------------------------------------------------------------------------

interface ResultadoDemo {
  exame_nome: string
  categoria: string
  status: 'ready' | 'analyzing'
  resumo: string
  paineis: PainelResultado[]
  liberado_em: string | null
}

const naoReagente = (nome: string): PainelResultado => ({
  nome,
  valor: 'Não reagente',
  unidade: '',
  ref: 'Não reagente',
  ok: true,
  trend: [],
})

const RESULTADOS_FLOWLAB: ResultadoDemo[] = [
  {
    exame_nome: 'TESTE RÁPIDO COMBO — COVID-19 / INFLUENZA A E B',
    categoria: 'Imunologia',
    status: 'ready',
    resumo: 'Antígenos de SARS-CoV-2 e Influenza A/B não detectados na amostra.',
    // Resultado QUALITATIVO: valor em texto, sem unidade — a mesma tabela de
    // marcadores que o hemograma usa, agora sem nada de numérico.
    paineis: [
      naoReagente('SARS-CoV-2 (Antígeno)'),
      naoReagente('Influenza A (Antígeno)'),
      naoReagente('Influenza B (Antígeno)'),
    ],
    liberado_em: '2026-07-20T17:20:00.000Z',
  },
  {
    exame_nome: 'VITAMINA D — 25-HIDROXI',
    categoria: 'Bioquímica',
    status: 'analyzing',
    resumo: 'Amostra recebida pelo laboratório. Resultado em processamento.',
    paineis: [],
    // Sem liberação: a lista mostra '—' no lugar da data.
    liberado_em: null,
  },
]

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const CODIGOS_LIS = LAUDOS_LIS.map((l) => l.codigo_lis!)
const NOMES_FLOWLAB = RESULTADOS_FLOWLAB.map((r) => r.exame_nome)

const { data: paciente, error: errPaciente } = await supabase
  .from('pacientes')
  .select('id, nome, cpf')
  .eq('email', email)
  .maybeSingle()

if (errPaciente) throw errPaciente
if (!paciente) {
  console.error(`Nenhum paciente com e-mail ${email}.`)
  process.exit(1)
}

console.log(`Paciente: ${paciente.nome} (${paciente.id})`)

// Apaga só o que ESTE script cria — as linhas semeadas antes e as vindas dos
// LIS de verdade ficam onde estão.
const { error: errDelLis } = await supabase
  .from('exam_results')
  .delete()
  .eq('paciente_id', paciente.id)
  .in('codigo_lis', CODIGOS_LIS)
if (errDelLis) throw errDelLis

const { error: errDelFlow } = await supabase
  .from('resultados')
  .delete()
  .eq('paciente_id', paciente.id)
  .in('exame_nome', NOMES_FLOWLAB)
if (errDelFlow) throw errDelFlow

if (soLimpar) {
  console.log(`Removidos: ${CODIGOS_LIS.join(', ')} e ${NOMES_FLOWLAB.length} resultado(s) do FlowLab.`)
  process.exit(0)
}

const agora = new Date().toISOString()

const { error: errLis } = await supabase.from('exam_results').insert(
  LAUDOS_LIS.map((laudo) => ({
    paciente_id: paciente.id,
    cpf: paciente.cpf,
    codigo_os: laudo.codigo_os || null,
    codigo_lis: laudo.codigo_lis,
    // `result` é a LISTA de laudos da linha (ver ExamResultRepository).
    result: [laudo],
    cached_at: agora,
  })),
)
if (errLis) throw errLis

const { error: errFlow } = await supabase.from('resultados').insert(
  RESULTADOS_FLOWLAB.map((r) => ({
    paciente_id: paciente.id,
    exame_nome: r.exame_nome,
    categoria: r.categoria,
    status: r.status,
    resumo: r.resumo,
    paineis: r.paineis,
    liberado_em: r.liberado_em,
  })),
)
if (errFlow) throw errFlow

console.log(`\n${LAUDOS_LIS.length} laudo(s) em exam_results:`)
for (const l of LAUDOS_LIS) console.log(`  ${l.codigo_lis!.padEnd(10)} ${l.status.padEnd(8)} ${l.name}`)
console.log(`\n${RESULTADOS_FLOWLAB.length} resultado(s) do FlowLab em resultados:`)
for (const r of RESULTADOS_FLOWLAB) console.log(`  ${r.status.padEnd(10)} ${r.exame_nome}`)
console.log('\nPronto. Abra "Seus resultados" no portal (o cache do navegador expira em 60s, ou clique em "Atualizar").')
