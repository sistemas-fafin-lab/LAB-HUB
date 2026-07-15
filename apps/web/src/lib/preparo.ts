import type { Agendamento, AgendamentoStatus } from '@lab-hub/shared'
import { timeFmt, formatDiaRelativoEmFrase } from './datetime'

// ---------------------------------------------------------------------------
// Preparo para a coleta — fonte única das orientações do laboratório.
// ---------------------------------------------------------------------------
// São regras GERAIS, não por exame: o LAB-HUB não sabe quais exames o paciente
// fará no agendamento — eles só chegam no webhook junto do status 'coletado',
// depois da coleta (ver apps/api/src/schemas/coletaStatus.ts). Preparo por exame
// é estruturalmente impossível hoje; estas valem para qualquer coleta.
//
// Vive em apps/web/src/lib (e não em @lab-hub/shared) pelo mesmo motivo de
// documentos.ts: o apps/api resolve o shared como .d.ts (só tipos), então um
// value import lá type-checaria e quebraria em runtime.
// ---------------------------------------------------------------------------

const HORA_MS = 3_600_000

export const JEJUM_MIN_H = 8 // abaixo disso o exame não serve
export const JEJUM_IDEAL_MAX_H = 12 // fim da janela ideal
export const JEJUM_MAX_H = 14 // acima disso o próprio jejum altera o resultado

/** "8 a 12 horas" — rótulo curto (tile da timeline e eyebrow do popover). */
export const JEJUM_LABEL = `${JEJUM_MIN_H} a ${JEJUM_IDEAL_MAX_H} horas`

export interface RegraPreparo {
  id: string
  /** Nome Lucide kebab-case. WIcon não tipa: nome errado some sem erro. */
  icon: string
  titulo: string
  texto: string
}

// As cinco regras estáticas. O jejum NÃO está aqui: depende do horário da coleta
// (calcularJejum) e ganha bloco próprio no popover.
export const REGRAS_GERAIS: RegraPreparo[] = [
  {
    id: 'hidratacao',
    icon: 'glass-water',
    titulo: 'Hidratação',
    texto: 'Água é liberada e recomendada, em quantidade moderada. Hidrate-se bem no dia anterior.',
  },
  {
    id: 'alcool',
    icon: 'wine-off',
    titulo: 'Álcool',
    texto: 'Evite bebidas alcoólicas por pelo menos 72 horas antes da coleta.',
  },
  {
    id: 'exercicios',
    icon: 'dumbbell',
    titulo: 'Exercícios',
    texto: 'Evite atividade física intensa nas 24 horas anteriores.',
  },
  {
    id: 'cigarro',
    icon: 'cigarette-off',
    titulo: 'Cigarro',
    texto: 'Não fume de 1 a 2 horas antes — a nicotina altera a pressão e a glicose.',
  },
  {
    id: 'medicamentos',
    icon: 'pill',
    titulo: 'Medicamentos',
    texto: 'Não pare remédios de uso contínuo por conta própria: fale antes com o seu médico.',
  },
]

// O próprio laboratório diz que o preparo varia conforme o exame. Exibir as
// regras como absolutas seria mentira em cima de dado clínico — a ressalva é
// segurança do paciente, não rodapé decorativo.
export const RESSALVA_PREPARO =
  'Orientações gerais — o preparo pode variar conforme o exame. Siga sempre o que o seu médico ou o laboratório orientar.'

interface Instante {
  hora: string
  dia: string
}

// Meia-noite é o caso chato. Para uma coleta amanhã às 08:00 o limite é o
// instante 00:00 de AMANHÃ — mas "amanhã às 00:00" se lê, em pt-BR, como o FIM
// de amanhã. Na fala a meia-noite pertence ao dia que ela ENCERRA, então
// ancoramos no dia anterior (−1 ms) e usamos a palavra: "meia-noite de hoje".
// Só 00:00 exato precisa disso — "amanhã às 00:30" já é a forma natural.
function instante(d: Date): Instante {
  const hora = timeFmt.format(d)
  if (hora === '00:00') {
    return {
      hora: 'meia-noite',
      dia: formatDiaRelativoEmFrase(new Date(d.getTime() - 1).toISOString()),
    }
  }
  return { hora, dia: formatDiaRelativoEmFrase(d.toISOString()) }
}

// `hora` sai SEM artigo de propósito: as frases usam "até meia-noite" / "antes
// de 18:00", que servem aos dois formatos. Trocar por "antes das" quebraria a
// meia-noite ("antes das meia-noite").
const frase = (i: Instante): string => `${i.hora} de ${i.dia}`

export interface JejumCalculado {
  /** Mais tarde que o paciente pode comer. Ex.: "meia-noite de hoje" */
  limite: string
  /** Janela ideal da última refeição. Ex.: "entre 20:00 e meia-noite de hoje" */
  janelaIdeal: string
  /** Antes disto o jejum passa de 14h. Ex.: "18:00 de hoje" */
  piso: string
}

// Jejum = coleta − última refeição. Logo, sobre a ÚLTIMA REFEIÇÃO:
//   ≥ 8h de jejum  ⟺ comer até (coleta − 8h)      → limite
//   ≤ 12h          ⟺ comer a partir de (coleta − 12h) → início da janela ideal
//   ≤ 14h          ⟺ nunca antes de (coleta − 14h)    → piso
//
// A conta é em milissegundos absolutos (não setHours) porque jejum é DURAÇÃO —
// e assim o instante bate com o que o card já exibe via formatDataHora.
//
// Os rótulos "hoje"/"amanhã" são resolvidos no render: uma aba aberta que
// atravessa a meia-noite fica desatualizada até o próximo refetch. É o mesmo
// comportamento de formatDataHoraDetalhe/formatEtapaHora, não uma regressão.
export function calcularJejum(dataHora: string): JejumCalculado {
  const coleta = new Date(dataHora).getTime()
  const menos = (h: number): Instante => instante(new Date(coleta - h * HORA_MS))

  const limite = menos(JEJUM_MIN_H)
  const inicio = menos(JEJUM_IDEAL_MAX_H)

  return {
    limite: frase(limite),
    // Colapsa o dia quando os dois extremos caem no mesmo ("entre 20:00 e
    // meia-noite de hoje"). Coletas do fim da manhã cruzam a virada e aí os dois
    // dias precisam aparecer ("entre 22:00 de hoje e 02:00 de amanhã").
    janelaIdeal:
      inicio.dia === limite.dia
        ? `entre ${inicio.hora} e ${limite.hora} de ${limite.dia}`
        : `entre ${frase(inicio)} e ${frase(limite)}`,
    piso: frase(menos(JEJUM_MAX_H)),
  }
}

// O preparo é instrução para o FUTURO. Depois que a coleta aconteceu — ou não
// vai mais acontecer — o alerta âmbar vira alarme falso e o horário calculado
// vira uma ordem para o passado.
const STATUS_ENCERRADOS: AgendamentoStatus[] = ['em_coleta', 'realizado', 'cancelado']

// 'bloqueado' fica FORA da lista, cortado só pelo relógio: o estado é ambíguo
// (a timeline o mapeia no check-in, mas ainda deixa anexar documento, o que
// sugere resolução antes do dia). O corte por horário atende as duas leituras
// sem escolher — e errar para o lado de MOSTRAR o preparo é o lado seguro.
//
// `agora` é injetável só para teste; a produção usa o default.
export function preparoAplicavel(
  { status, dataHora }: Pick<Agendamento, 'status' | 'dataHora'>,
  agora: Date = new Date(),
): boolean {
  if (STATUS_ENCERRADOS.includes(status)) return false
  // Corta o no-show: um 'confirmado' cuja hora já passou não recebe status
  // nenhum do FlowLab, então o relógio é o único juiz.
  return new Date(dataHora).getTime() > agora.getTime()
}
