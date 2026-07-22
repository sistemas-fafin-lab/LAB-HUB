import { randomUUID } from 'node:crypto'
import type { AolExam, AplisExam, Laudo, LaudoGrupo, LaudoPainel } from '../types.js'
import type { ExamMapperStrategy } from '../ExamMapperStrategy.js'
import {
  buildMeta,
  buildSummaryQuantitative,
  isOutOfRange,
  simplificaReferencia,
  toTrend,
  type PerfilPaciente,
} from '../mapperHelpers.js'

// Estratégia dos exames quantitativos (código 0040 e afins): cada analito vira
// um marcador com valor, unidade e faixa de referência.

// ---------------------------------------------------------------------------
// Categoria
// ---------------------------------------------------------------------------

// Os LIS não mandam categoria; ela é inferida do nome do exame só para agrupar
// na tela. Ordem importa: a primeira palavra-chave que casar vence.
const CATEGORIA_POR_PALAVRA: Array<[string[], string]> = [
  [['hemograma', 'eritrócit', 'leucócit', 'hematócrit', 'hemoglobin', 'plaqueta'], 'Hematologia'],
  [['glicemi', 'glicose', 'hemoglobin glicad', 'hba1c', 'colesterol', 'triglicerídeo', 'lipídic', 'ldl', 'hdl', 'vldl'], 'Bioquímica'],
  [['tsh', 't4', 'tireóide', 'tireoidian', 'hormônio'], 'Hormônios'],
  [['vitamina d', 'vitamina b', 'vitamina c'], 'Vitaminas'],
  [['ureia', 'creatinina', 'renal', 'egfr', 'tfg'], 'Função Renal'],
  [['tgo', 'tgp', 'ggt', 'bilirrubina', 'hepátic'], 'Função Hepática'],
  [['ferro', 'ferritina', 'transferrin'], 'Hematologia'],
  [['insulina', 'homa', 'metabol'], 'Metabolismo'],
  [['sódio', 'potássio', 'magnésio', 'eletrólito', 'cálcio', 'fósforo'], 'Bioquímica'],
  [['hiv', 'hepatite', 'sífilis', 'sorolog'], 'Infecciologia'],
  [['urina', 'urinális'], 'Urinálise'],
  [['parasitológic', 'fezes'], 'Parasitologia'],
  [['sangue oculto', 'gastro'], 'Gastroenterologia'],
  [['selênio', 'zinco', 'micronutrient'], 'Micronutrientes'],
]

export function deriveCategory(nomeExame: string | null): string {
  if (!nomeExame) return 'Análises Clínicas'
  const lower = nomeExame.toLowerCase()
  for (const [palavras, categoria] of CATEGORIA_POR_PALAVRA) {
    if (palavras.some((p) => lower.includes(p))) return categoria
  }
  return 'Análises Clínicas'
}

// ---------------------------------------------------------------------------
// Hemograma
// ---------------------------------------------------------------------------

// Hemograma tem dezenas de analitos e é ilegível numa lista única. Estes
// conjuntos o quebram nas três séries em que o laudo impresso é lido.
const SERIE_BRANCA = new Set([
  'leucócitos', 'neutrófilos', 'neutrófilos %', 'linfócitos', 'linfócitos %',
  'monócitos', 'monócitos %', 'eosinófilos', 'eosinófilos %', 'basófilos', 'basófilos %',
  'granulócitos', 'granulócitos %',
])
const SERIE_VERMELHA = new Set([
  'eritrócitos', 'hemoglobina', 'hematócrito', 'vcm', 'hcm', 'chcm', 'rdw', 'rdw-sd', 'rdw-cv',
])
const SERIE_PLAQUETAS = new Set(['plaquetas', 'mpv', 'pdw', 'plaquetócrito', 'pct'])

function buildHemogramaGroups(panels: LaudoPainel[]): LaudoGrupo[] {
  const branca: LaudoPainel[] = []
  const vermelha: LaudoPainel[] = []
  const plaquetas: LaudoPainel[] = []

  for (const p of panels) {
    const chave = p.name.toLowerCase()
    if (SERIE_BRANCA.has(chave)) branca.push(p)
    else if (SERIE_VERMELHA.has(chave)) vermelha.push(p)
    else if (SERIE_PLAQUETAS.has(chave)) plaquetas.push(p)
    // Analito fora das três séries fica só em `panels` — continua visível na
    // tabela geral, apenas não entra em nenhum grupo.
  }

  const grupos: LaudoGrupo[] = []
  if (branca.length) grupos.push({ name: 'Série Branca', panels: branca })
  if (vermelha.length) grupos.push({ name: 'Série Vermelha', panels: vermelha })
  if (plaquetas.length) grupos.push({ name: 'Plaquetas', panels: plaquetas })
  return grupos
}

// ---------------------------------------------------------------------------
// Merge AOL × ApLIS
// ---------------------------------------------------------------------------

// Normaliza o nome do analito para casar os dois sistemas. A AOL costuma anexar
// o método ao nome ("DHT - Ensaio Imunoenzimático") e o ApLIS não; acentuação
// também varia entre eles.
function chaveAnalito(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(' - ')[0]!
    .trim()
}

// Referências do ApLIS por analito. Desde 22/07/2026 a AOL também manda a sua
// (o <valorreferencia> pedido com referenciaResultado=true, já repartido por
// analito em aol.ts) — a do ApLIS, quando existe, continua ganhando por ser
// faixa simples em vez de texto estratificado.
function referenciasDoAplis(aplis: AplisExam | null): Map<string, string> {
  const refs = new Map<string, string>()
  for (const a of aplis?.analitos ?? []) {
    if (a.valor_referencia) refs.set(chaveAnalito(a.nome), a.valor_referencia)
  }
  return refs
}

export const analisesClinicasStrategy: ExamMapperStrategy = {
  canHandle: (examType) => {
    const t = examType.trim()
    if (t === '0040' || /^\d+$/.test(t)) return true
    return /^[A-Z0-9]{1,10}$/.test(t)
  },

  map(aol: AolExam, aplis: AplisExam | null, _cpf: string, perfil?: PerfilPaciente): Laudo {
    const meta = buildMeta(aol, aplis)

    // A AOL manda nos VALORES — é a fonte precisa. O ApLIS entra só para
    // completar a faixa de referência. Fundir campo a campo, em vez de escolher
    // uma das fontes, evita descartar o dado bom de uma por causa do que falta
    // na outra.
    const referencias = referenciasDoAplis(aplis)

    const panels: LaudoPainel[] =
      aol.analitos.length > 0
        ? aol.analitos.map((a) => {
            // A referência da AOL pode ser uma tabela estratificada por
            // idade/sexo; com o perfil, reduzimos à linha do paciente. Sem
            // entender o texto inteiro, sai completo (tabs viram espaço, a
            // tela quebra por \n).
            const bruta = referencias.get(chaveAnalito(a.nome)) ?? a.referencia ?? ''
            const ref = (
              (perfil && bruta ? simplificaReferencia(bruta, perfil) : null) ?? bruta
            ).replace(/\t+/g, ' ')
            return {
              name: a.nome,
              value: a.valor ?? '—',
              unit: a.unidade ?? '',
              ref,
              ok: !isOutOfRange(a.valor, ref),
              trend: toTrend(a.valor),
            }
          })
        : // Sem analitos na AOL, o ApLIS é tudo o que há — melhor o laudo dele
          // do que uma lista vazia.
          (aplis?.analitos ?? []).map((a) => ({
            name: a.nome,
            value: a.resultado ?? '—',
            unit: a.unidade ?? '',
            ref: a.valor_referencia ?? '',
            ok: !isOutOfRange(a.resultado, a.valor_referencia),
            trend: toTrend(a.resultado),
          }))

    const isHemograma = (aol.nome_exame ?? '').toLowerCase().includes('hemograma')
    const groups = isHemograma ? buildHemogramaGroups(panels) : undefined

    return {
      id: randomUUID(),
      name: aol.nome_exame ?? 'Análises Clínicas',
      category: deriveCategory(aol.nome_exame),
      ...meta,
      status: 'ready',
      summary: buildSummaryQuantitative(panels),
      panels,
      ...(groups ? { groups } : {}),
      exam_type: aol.nome_exame ?? '040',
      codigo_os: aol.codigo_os,
      codigo_lis: aplis?.codigo_lis ?? null,
      source: aplis ? 'merged' : 'aol',
      // Sem o ApLIS o laudo está incompleto (faltam as faixas de referência), e
      // `partial` faz o cache revalidar em vez de servir isto como definitivo.
      partial: aplis === null,
    }
  },
}
