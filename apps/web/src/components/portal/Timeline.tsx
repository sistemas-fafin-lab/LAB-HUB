import type { CSSProperties } from 'react'
import * as DS from '../../ds'
import { Pill } from './status'
import { ETAPAS, estadoDaEtapa } from './etapas'
import type { EstadoEtapa, EtapaId } from './etapas'

// Linha do tempo das etapas da coleta. Mesmo modelo do nó: `passo` = etapas
// alcançadas (0–5) e `alerta` = índice da etapa em atenção (recoleta), ou -1.
// Quem chama traduz o status real do agendamento para esses números.

export interface TimelineProps {
  passo: number
  alerta?: number
  /** Horário de cada etapa já alcançada, já formatado */
  quando?: Partial<Record<EtapaId, string>>
  /** Motivo da recoleta, mostrado na etapa em alerta */
  motivoRecoleta?: string
}

const MARCADOR: Record<EstadoEtapa, CSSProperties> = {
  done: { background: 'var(--lh-brand)', color: '#fff' },
  current: { background: 'var(--lh-card)', boxShadow: 'inset 0 0 0 2px var(--lh-brand)' },
  alert: { background: 'var(--lh-coral)', color: 'var(--lh-ink)' },
  todo: { background: 'var(--lh-track)' },
}

export function Timeline({ passo, alerta = -1, quando, motivoRecoleta }: TimelineProps) {
  const estados = ETAPAS.map((_, i) => estadoDaEtapa(i, passo, alerta))
  const ultima = ETAPAS.length - 1
  return (
    <ol>
      {ETAPAS.map((etapa, i) => {
        const estado = estados[i] ?? 'todo'
        const horario = quando?.[etapa.id]
        const trilhoAceso = i < ultima && estado !== 'todo' && estados[i + 1] !== 'todo'
        return (
          <li key={etapa.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < ultima && (
              <span
                className="absolute left-[11px] top-7 bottom-1 w-[2px] rounded-full"
                style={{ background: trilhoAceso ? 'var(--lh-brand)' : 'var(--lh-track)' }}
              />
            )}
            <span className="relative z-10 w-6 h-6 rounded-[6px] inline-flex items-center justify-center shrink-0" style={MARCADOR[estado]}>
              {estado === 'done' && <DS.Icon name="check" size={14} strokeWidth={2.2} />}
              {estado === 'alert' && <DS.Icon name="rotate-ccw" size={13} strokeWidth={2} />}
              {estado === 'current' && <span className="w-2 h-2 rounded-[2px] bg-brand" />}
            </span>
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className={'text-[14px] font-semibold ' + (estado === 'todo' ? 'text-muted' : '')}>
                  {estado === 'alert' ? 'Recoleta necessária' : etapa.nome}
                </span>
                {estado !== 'todo' && horario && <span className="text-[12px] text-muted tabular-nums">{horario}</span>}
              </div>
              <div className="text-[13px] text-muted mt-0.5">
                {estado === 'alert' && motivoRecoleta ? motivoRecoleta + '.' : etapa.descricao}
              </div>
              {estado === 'current' && (
                <div className="mt-2">
                  <Pill tone="brand">Etapa atual</Pill>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
