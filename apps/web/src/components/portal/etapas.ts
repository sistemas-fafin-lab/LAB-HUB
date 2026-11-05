// Etapas da coleta, na ordem do nó e da linha do tempo. `passo` = etapas
// alcançadas (0–5); `alerta` = índice da etapa em atenção (recoleta), ou -1.

export const ETAPAS = [
  { id: 'agendada', nome: 'Agendamento', descricao: 'Horário reservado.' },
  { id: 'checkin', nome: 'Check-in', descricao: 'A recepção conferiu o pedido e a guia.' },
  { id: 'coleta', nome: 'Coleta', descricao: 'Amostra coletada.' },
  { id: 'analise', nome: 'Análise', descricao: 'A amostra está sendo processada no laboratório.' },
  { id: 'liberada', nome: 'Liberação', descricao: 'Laudo e declaração disponíveis.' },
] as const

export type EtapaId = (typeof ETAPAS)[number]['id']
export type EstadoEtapa = 'done' | 'current' | 'alert' | 'todo'

export function estadoDaEtapa(i: number, passo: number, alerta: number): EstadoEtapa {
  if (alerta >= 0) return i < alerta ? 'done' : i === alerta ? 'alert' : 'todo'
  if (passo >= ETAPAS.length) return 'done'
  return i < passo - 1 ? 'done' : i === passo - 1 ? 'current' : 'todo'
}
