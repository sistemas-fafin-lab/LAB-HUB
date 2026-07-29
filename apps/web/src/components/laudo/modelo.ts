// Modelo do laudo impresso: converte o `Exam` (o que a API devolve) na
// estrutura que a folha A4 desenha.
//
// Regra que vale para o arquivo inteiro: NADA aqui inventa dado. Campo que a
// fonte não informou vira `undefined` e a folha OMITE a linha — um laudo é um
// documento que o paciente leva ao médico, e um placeholder ali é lido como
// afirmação sobre o exame dele.

import type { Paciente } from '@lab-hub/shared'
import type { Exam } from '../shared/WebHero'
import { isLaudoEmSecoes } from '../shared/LaudoSecoes'
import { formatarCpf, formatarData } from '../../lib/validators'

// '—' é o placeholder que os mappers usam para campo ausente. Num documento
// impresso ele não vale nada: a folha omite a linha inteira.
const VAZIO = '—'
const preenchido = (v: string | undefined): string | undefined =>
  v && v !== VAZIO ? v : undefined

// ---------------------------------------------------------------------------
// Estado de um analito
// ---------------------------------------------------------------------------

/**
 * - `ok`   dentro da faixa (ou sem faixa informada — ver abaixo)
 * - `lo`   abaixo da faixa   ▼
 * - `hi`   acima da faixa    ▲
 * - `alt`  fora da faixa, direção indeterminada
 *
 * Quem decide se está fora da faixa é a API (`panel.ok`); aqui só derivamos a
 * DIREÇÃO, para escolher entre ▼ e ▲. Referência em formato que não sabemos ler
 * cai em `alt`: marca o analito como alterado, que é o que a API afirmou, sem
 * apontar um lado que não conseguimos comprovar.
 *
 * Analito sem faixa de referência chega com `ok: true` por construção (ver
 * mapperHelpers.ts na API) — não é uma afirmação de normalidade, e é por isso
 * que os contadores do cabeçalho só contam analitos COM referência.
 */
export type EstadoAnalito = 'ok' | 'lo' | 'hi' | 'alt'

const num = (s: string): number => parseFloat(s.replace(',', '.'))

/**
 * Direção do desvio, nos mesmos formatos de referência que a API reconhece
 * (`isOutOfRange`). Só é chamada para analito que a API já marcou como fora da
 * faixa — ela não reclassifica nada, apenas escolhe a seta.
 */
export function direcaoDoDesvio(valor: string, ref: string): 'lo' | 'hi' | null {
  // Referência multilinha é tabela estratificada por idade/sexo que não foi
  // reduzida à linha do paciente: comparar com ela casaria a faixa errada.
  if (!valor || !ref || ref.includes('\n')) return null

  const n = num(valor)
  if (isNaN(n)) return null

  const faixa = ref.match(/^([\d.,]+)(?:\s*[–-]\s*|\s+a\s+)([\d.,]+)/)
  if (faixa?.[1] && faixa[2]) {
    if (n < num(faixa[1])) return 'lo'
    if (n > num(faixa[2])) return 'hi'
    return null
  }

  // Limite superior ("< 200", "Inferior a 1,20"): fora da faixa só pode ser acima.
  if (
    /^inferior\s+ou\s+igual\s+(?:[aà]\s+)?[\d.,]/i.test(ref) ||
    /^<\s*[\d.,]/.test(ref) ||
    /^inferior\s+(?:[aà]\s+)?[\d.,]/i.test(ref)
  ) {
    return 'hi'
  }

  // Limite inferior ("> 40", "Superior a 40"): fora da faixa só pode ser abaixo.
  if (
    /^superior\s+ou\s+igual\s+(?:[aà]\s+)?[\d.,]/i.test(ref) ||
    /^>\s*[\d.,]/.test(ref) ||
    /^superior\s+(?:[aà]\s+)?[\d.,]/i.test(ref)
  ) {
    return 'lo'
  }

  return null
}

function estadoDe(valor: string, ref: string, ok: boolean): EstadoAnalito {
  if (ok) return 'ok'
  return direcaoDoDesvio(valor, ref) ?? 'alt'
}

// ---------------------------------------------------------------------------
// Estrutura da folha
// ---------------------------------------------------------------------------

export interface LinhaLaudo {
  analito: string
  resultado: string
  unidade: string
  referencia: string
  estado: EstadoAnalito
}

export interface GrupoLaudo {
  /** null = exame avulso, que não tem seção nomeada. */
  nome: string | null
  linhas: LinhaLaudo[]
}

export interface ParagrafoLaudo {
  texto: string
  /** Achado principal do laudo (linha em CAIXA ALTA no texto do LIS). */
  forte: boolean
}

export interface SecaoLaudo {
  titulo: string | null
  /** CONCLUSÃO — sai em caixa realçada. */
  destaque: boolean
  paragrafos: ParagrafoLaudo[]
}

/** Contadores do cabeçalho. Só analitos COM referência entram em dentro/alterados. */
export interface ResumoLaudo {
  total: number
  comReferencia: number
  dentro: number
  alterados: number
}

export interface DocumentoLaudo {
  titulo: string
  categoria?: string
  numeroLaudo?: string
  paciente: {
    nome?: string
    cpf?: string
    nascimento?: string
    sexo?: string
    idade?: string
  }
  medico?: string
  crm?: string
  coleta?: string
  liberacao?: string
  /** Data desta CÓPIA — não a do exame. */
  geracao: string
  laboratorio?: string
  material?: string
  metodo?: string
  /** Preenchido no laudo quantitativo; vazio no descritivo. */
  grupos: GrupoLaudo[]
  /** Preenchido no laudo descritivo (citologia/patologia); vazio no quantitativo. */
  secoes: SecaoLaudo[]
  /** Parecer do LABORATÓRIO sobre este exame (`exam.summary`). */
  observacoes?: string
  resumo: ResumoLaudo
}

// ---------------------------------------------------------------------------
// Laudo descritivo → seções
// ---------------------------------------------------------------------------

// Mesmas regras do LaudoTexto (formato legado, texto corrido) e do LaudoSecoes
// (formato novo, um group por seção): linha em CAIXA ALTA curta é título de
// seção; longa é achado principal, em negrito.
const RE_ROTULO = /^([A-ZÀ-Ü][A-ZÀ-Ü0-9 ()/-]{2,}):\s*(.*)$/
const RE_TITULO = /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 ()/-]{2,}$/
const MAX_TITULO = 40

const ehConclusao = (t: string): boolean => /^conclus[ãa]o$/i.test(t)

/** Formato legado: o laudo inteiro num texto só, com a estrutura em CAIXA ALTA. */
export function secoesDoTexto(texto: string): SecaoLaudo[] {
  const secoes: SecaoLaudo[] = []
  let atual: SecaoLaudo = { titulo: null, destaque: false, paragrafos: [] }

  const abre = (titulo: string) => {
    if (atual.titulo !== null || atual.paragrafos.length > 0) secoes.push(atual)
    atual = { titulo, destaque: ehConclusao(titulo), paragrafos: [] }
  }

  for (const bruta of texto.split('\n')) {
    const l = bruta.trim()
    if (!l) continue

    const rotulo = RE_ROTULO.exec(l)
    if (rotulo && rotulo[1]!.length <= MAX_TITULO) {
      abre(rotulo[1]!)
      if (rotulo[2]) atual.paragrafos.push({ texto: rotulo[2], forte: false })
      continue
    }
    if (RE_TITULO.test(l) && l.length <= MAX_TITULO) {
      abre(l)
      continue
    }
    atual.paragrafos.push({ texto: l, forte: rotulo !== null || RE_TITULO.test(l) })
  }
  if (atual.titulo !== null || atual.paragrafos.length > 0) secoes.push(atual)
  return secoes
}

/** Formato novo: um group por seção, com os panels sem nome guardando o texto. */
function secoesDosGrupos(exam: Exam): SecaoLaudo[] {
  return (exam.groups ?? []).map((g) => ({
    titulo: g.name || null,
    destaque: ehConclusao(g.name),
    paragrafos: g.panels.flatMap((p) =>
      p.value
        .split('\n')
        .map((linha) => linha.trim())
        .filter(Boolean)
        .map((linha) => ({
          texto: linha,
          forte: RE_ROTULO.test(linha) || RE_TITULO.test(linha),
        })),
    ),
  }))
}

// ---------------------------------------------------------------------------
// Idade
// ---------------------------------------------------------------------------

/**
 * "25 anos e 4 meses" a partir da data de nascimento. É DERIVADA do dado real
 * do cadastro, não um campo inventado — e é o que o médico lê junto com as
 * faixas de referência pediátricas.
 */
export function idadePorExtenso(nascimentoIso: string, hoje = new Date()): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimentoIso)
  if (!m) return undefined

  let anos = hoje.getFullYear() - Number(m[1])
  let meses = hoje.getMonth() + 1 - Number(m[2])
  if (hoje.getDate() < Number(m[3])) meses -= 1
  if (meses < 0) {
    meses += 12
    anos -= 1
  }
  if (anos < 0) return undefined

  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  if (meses === 0) return parteAnos
  return `${parteAnos} e ${meses} ${meses === 1 ? 'mês' : 'meses'}`
}

// ---------------------------------------------------------------------------
// Exam → DocumentoLaudo
// ---------------------------------------------------------------------------

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** Data de HOJE por extenso — "gerado em" é sobre esta cópia, não sobre o exame. */
export function hojePorExtenso(hoje = new Date()): string {
  return `${String(hoje.getDate()).padStart(2, '0')} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`
}

function grupoDe(nome: string | null, panels: Exam['panels']): GrupoLaudo {
  return {
    nome,
    linhas: panels.map((p) => ({
      analito: p.name,
      resultado: p.value,
      unidade: p.unit,
      referencia: p.ref,
      estado: estadoDe(p.value, p.ref, p.ok),
    })),
  }
}

function resumoDe(grupos: GrupoLaudo[]): ResumoLaudo {
  const linhas = grupos.flatMap((g) => g.linhas)
  const comReferencia = linhas.filter((l) => l.referencia.trim() !== '')
  const alterados = comReferencia.filter((l) => l.estado !== 'ok').length

  return {
    total: linhas.length,
    comReferencia: comReferencia.length,
    dentro: comReferencia.length - alterados,
    alterados,
  }
}

export function documentoDoExame(
  exam: Exam,
  paciente: Paciente | null,
  hoje = new Date(),
): DocumentoLaudo {
  // Descritivo (citologia/patologia) no formato novo (groups de texto) ou no
  // legado (um único panel "Laudo"). Qualquer um dos dois substitui a tabela.
  const emSecoes = isLaudoEmSecoes(exam)
  const legado =
    !emSecoes &&
    exam.panels.length === 1 &&
    exam.panels[0]?.name === 'Laudo' &&
    !exam.groups?.length

  let secoes: SecaoLaudo[] = []
  let grupos: GrupoLaudo[] = []
  if (emSecoes) {
    secoes = secoesDosGrupos(exam)
  } else if (legado) {
    secoes = secoesDoTexto(exam.panels[0]?.value ?? '')
  } else if (exam.groups?.length) {
    // Pedido consolidado: um grupo por exame da OS.
    grupos = exam.groups.map((g) => grupoDe(g.name, g.panels))
  } else {
    grupos = exam.panels.length ? [grupoDe(null, exam.panels)] : []
  }

  return {
    titulo: exam.name,
    ...opt('categoria', preenchido(exam.category)),
    ...opt('numeroLaudo', preenchido(exam.numeroLaudo)),
    paciente: {
      ...opt('nome', paciente?.nome),
      ...opt('cpf', paciente ? formatarCpf(paciente.cpf) : undefined),
      ...opt('nascimento', paciente ? formatarData(paciente.dataNascimento) : undefined),
      ...opt('sexo', paciente?.sexo),
      ...opt('idade', paciente ? idadePorExtenso(paciente.dataNascimento, hoje) : undefined),
    },
    ...opt('medico', preenchido(exam.doctor)),
    ...opt('crm', preenchido(exam.crm)),
    ...opt('coleta', preenchido(exam.dataColeta)),
    ...opt('liberacao', preenchido(exam.dataEmissao)),
    geracao: hojePorExtenso(hoje),
    // Executor só quando o LIS informa: nomear um laboratório que talvez não
    // tenha feito a análise atribui responsabilidade técnica a terceiro.
    ...opt('laboratorio', preenchido(exam.laboratorio) ?? preenchido(exam.unit)),
    ...opt('material', preenchido(exam.material)),
    ...opt('metodo', preenchido(exam.metodo)),
    grupos,
    secoes,
    ...opt('observacoes', exam.summary?.trim() || undefined),
    resumo: resumoDe(grupos),
  }
}

// `exactOptionalPropertyTypes` está ligado: atribuir `undefined` a campo
// opcional é erro de tipo. Este helper omite a chave em vez de zerá-la.
function opt<K extends string, V>(chave: K, valor: V | undefined): Partial<Record<K, V>> {
  return valor === undefined ? {} : ({ [chave]: valor } as Record<K, V>)
}
