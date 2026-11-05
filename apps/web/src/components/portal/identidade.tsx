import type { IconName } from '../../ds'
import { Ico } from './controles'
import { partesNoFuso } from '../../lib/regiao'

export type AvatarTone = 'brand' | 'navy' | 'gray'

const FUNDO_AVATAR: Record<AvatarTone, string> = {
  brand: 'var(--lh-brand)',
  navy: 'var(--lh-av-navy)',
  gray: 'var(--lh-av-gray)',
}

/** Iniciais do paciente num bloco de raio 15%. */
export function Avatar({ initials, tone = 'brand', size = 36 }: { initials: string; tone?: AvatarTone; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center shrink-0 font-display font-medium text-white"
      style={{ width: size, height: size, borderRadius: '15%', background: FUNDO_AVATAR[tone], fontSize: Math.round(size * 0.36), letterSpacing: '.02em' }}
    >
      {initials}
    </span>
  )
}

export type IconTileTone = 'subtle' | 'coral' | 'card'

const FUNDO_TILE: Record<IconTileTone, string> = { subtle: 'bg-subtle', coral: 'bg-coral-soft', card: 'bg-card' }

export function IconTile({ name, size = 36, tone = 'subtle' }: { name: IconName; size?: number; tone?: IconTileTone }) {
  return (
    <span
      className={'inline-flex items-center justify-center shrink-0 text-ink ' + FUNDO_TILE[tone]}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      <Ico name={name} size={Math.round(size * 0.46)} />
    </span>
  )
}

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

/** Bloco de data (dia da semana, dia, mês) da próxima coleta, no fuso escolhido. */
export function DateBlock({ date, size = 56 }: { date: Date; size?: number }) {
  const { diaSemana, dia, mes } = partesNoFuso(date)
  return (
    <span
      className="inline-flex flex-col items-center justify-center shrink-0 text-white bg-action"
      style={{ width: size, height: size, borderRadius: '15%' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[.06em] leading-none">{SEMANA[diaSemana]}</span>
      <span className="font-display font-medium leading-none my-1" style={{ fontSize: Math.round(size * 0.4) }}>
        {dia}
      </span>
      <span className="text-[10px] leading-none">{MES[mes - 1]}</span>
    </span>
  )
}
