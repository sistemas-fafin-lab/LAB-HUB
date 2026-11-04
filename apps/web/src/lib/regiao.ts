import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Idioma e região (Configurações). Só o fuso horário muda o portal: todas as
// datas e horas passam por `formatador`/`partesNoFuso`, que usam o fuso
// escolhido em vez do fuso do aparelho. A escolha fica neste navegador.
//
// Idioma e unidades têm só uma opção ativa: traduzir o portal e converter os
// resultados do laudo (mg/dL → mmol/L) ainda não existem — as outras opções do
// design aparecem como "em breve".
// ---------------------------------------------------------------------------

export const FUSOS = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
] as const

export type Fuso = (typeof FUSOS)[number]['value']

export const IDIOMAS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'English (em breve)', disabled: true },
  { value: 'es', label: 'Español (em breve)', disabled: true },
] as const

export const UNIDADES = [
  { value: 'metric', label: 'Convencionais (mg/dL)' },
  { value: 'si', label: 'Sistema internacional (mmol/L) (em breve)', disabled: true },
] as const

const CHAVE = 'labhub:fuso'
const PADRAO: Fuso = 'America/Sao_Paulo'

const ehFuso = (v: unknown): v is Fuso => FUSOS.some((f) => f.value === v)

// localStorage pode estourar (modo privado, storage bloqueado): fica o padrão.
function lerFuso(): Fuso {
  try {
    const salvo = localStorage.getItem(CHAVE)
    return ehFuso(salvo) ? salvo : PADRAO
  } catch {
    return PADRAO
  }
}

let fuso: Fuso = lerFuso()
const ouvintes = new Set<() => void>()

export function fusoAtual(): Fuso {
  return fuso
}

export function salvarFuso(novo: Fuso): void {
  fuso = novo
  try {
    localStorage.setItem(CHAVE, novo)
  } catch {
    // Não persiste, mas vale para esta sessão.
  }
  for (const avisa of ouvintes) avisa()
}

function inscreve(avisa: () => void) {
  ouvintes.add(avisa)
  return () => {
    ouvintes.delete(avisa)
  }
}

export function useFuso(): Fuso {
  return useSyncExternalStore(inscreve, fusoAtual)
}

// Um Intl.DateTimeFormat por (opções, fuso): criar um a cada chamada é caro.
const cache = new Map<string, Intl.DateTimeFormat>()

/** Formatador pt-BR no fuso escolhido. */
export function formatador(opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const chave = fuso + JSON.stringify(opcoes)
  let f = cache.get(chave)
  if (!f) {
    f = new Intl.DateTimeFormat('pt-BR', { ...opcoes, timeZone: fuso })
    cache.set(chave, f)
  }
  return f
}

export interface PartesDaData {
  ano: number
  /** 1–12 */
  mes: number
  dia: number
  /** 0 = domingo */
  diaSemana: number
  hora: number
}

const SEMANA_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const partesCache = new Map<string, Intl.DateTimeFormat>()

/** Ano, mês, dia, dia da semana e hora de `d` no fuso escolhido. */
export function partesNoFuso(d: Date): PartesDaData {
  let f = partesCache.get(fuso)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    })
    partesCache.set(fuso, f)
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    diaSemana: SEMANA_EN.indexOf(p.weekday ?? ''),
    hora: Number(p.hour),
  }
}

/** Número do dia (dias desde 1970) de `d` no fuso escolhido — para comparar dias. */
export function diaNoFuso(d: Date): number {
  const { ano, mes, dia } = partesNoFuso(d)
  return Date.UTC(ano, mes - 1, dia) / 86_400_000
}
