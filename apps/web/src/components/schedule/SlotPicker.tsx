import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip, EmptyState, IconBtn, Panel, PanelHead } from '../portal'
import { diasDeColeta } from '../../lib/coletas'
import type { DiaDeColeta } from '../../lib/coletas'
import { dayNumFmt, formatDiaSemanaCurto, formatMesCurto, relDia, timeFmt } from '../../lib/datetime'

interface SlotPickerProps {
  /** Unidade escolhida, mostrada no título. */
  posto: string
  slots: string[] // horários ISO 8601
  /** ISO do horário à espera de confirmação. */
  selecionado: string | null
  onPick: (iso: string) => void
}

// Quanto cada clique nas setas anda: dois dias (72 px + 8 de vão) e um pouco.
const PASSO_DO_CARROSSEL = 168

function BotaoDoDia({ dia, ativo, onClick }: { dia: DiaDeColeta; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-dia=""
      aria-pressed={ativo}
      aria-label={dia.label}
      onClick={onClick}
      className="shrink-0 w-[72px] py-2.5 rounded-[14px] border-[1.5px] text-center transition-colors"
      style={
        ativo
          ? { background: 'var(--lh-action)', borderColor: 'var(--lh-action)', color: '#fff' }
          : { background: 'var(--lh-card)', borderColor: 'var(--lh-line-strong)' }
      }
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[.06em]">
        {relDia(dia.date) ?? formatDiaSemanaCurto(dia.date)}
      </span>
      <span className="block font-display font-medium text-[22px] leading-tight tabular-nums">{dayNumFmt.format(dia.date)}</span>
      <span className="block text-[11px]">{formatMesCurto(dia.date)}</span>
    </button>
  )
}

/** Carrossel de dias com botões e os horários do dia escolhido. */
export function SlotPicker({ posto, slots, selecionado, onPick }: SlotPickerProps) {
  const dias = useMemo(() => diasDeColeta(slots), [slots])
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null)
  const trilho = useRef<HTMLDivElement>(null)
  const [podeVoltar, setPodeVoltar] = useState(false)
  const [podeAvancar, setPodeAvancar] = useState(false)

  // Dia ativo: o escolhido, ou o primeiro caso ele não exista mais (troca de
  // unidade, dia esgotado após um agendamento).
  const ativo = dias.find((d) => d.key === diaEscolhido) ?? dias[0] ?? null

  const atualizaSetas = () => {
    const el = trilho.current
    if (!el) return
    setPodeVoltar(el.scrollLeft > 0)
    setPodeAvancar(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  useEffect(() => {
    atualizaSetas()
    window.addEventListener('resize', atualizaSetas)
    return () => window.removeEventListener('resize', atualizaSetas)
  }, [dias])

  const anda = (direcao: 1 | -1) => {
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    trilho.current?.scrollBy({ left: direcao * PASSO_DO_CARROSSEL, behavior: reduzido ? 'auto' : 'smooth' })
  }

  if (!ativo) {
    return (
      <Panel>
        <EmptyState icon="calendar" title="Sem horários disponíveis nesta unidade." />
      </Panel>
    )
  }

  const temIndisponivel = ativo.horarios.some((h) => !h.disponivel)

  return (
    <Panel>
      <PanelHead
        title="Escolha o dia e o horário"
        right={<span className="text-[12px] text-muted truncate">{posto}</span>}
      />
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="lh-ov">Dia</div>
        <div className="flex items-center gap-1">
          <IconBtn icon="chevron-left" label="Dias anteriores" size="md" disabled={!podeVoltar} onClick={() => anda(-1)} />
          <IconBtn icon="chevron-right" label="Próximos dias" size="md" disabled={!podeAvancar} onClick={() => anda(1)} />
        </div>
      </div>
      {/* Respiro interno para o anel de foco não ser cortado pela rolagem. */}
      <div
        ref={trilho}
        role="group"
        aria-label="Dias com horário"
        onScroll={atualizaSetas}
        className="flex gap-2 overflow-x-auto p-1 -m-1 mb-4"
      >
        {dias.map((d) => (
          <BotaoDoDia key={d.key} dia={d} ativo={d.key === ativo.key} onClick={() => setDiaEscolhido(d.key)} />
        ))}
      </div>
      <div className="lh-ov mb-2">
        Horários · <span className="normal-case tracking-normal">{ativo.label}</span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-3 lg:gap-y-2">
        {ativo.horarios.map((h) => (
          <Chip key={h.iso} selected={h.iso === selecionado} disabled={!h.disponivel} onClick={() => onPick(h.iso)}>
            <span className="tabular-nums">{timeFmt.format(new Date(h.iso))}</span>
            {!h.disponivel && <span className="sr-only"> indisponível</span>}
          </Chip>
        ))}
      </div>
      {temIndisponivel && <p className="text-[12px] text-muted mt-4">Horários riscados não estão disponíveis.</p>}
    </Panel>
  )
}
