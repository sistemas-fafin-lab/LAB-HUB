import type { PostoDisponivel } from '@lab-hub/shared'
import { Ico, Panel, PanelHead } from '../portal'

interface UnitSelectorProps {
  postos: PostoDisponivel[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function UnitSelector({ postos, selectedId, onSelect }: UnitSelectorProps) {
  return (
    <Panel>
      <PanelHead title="Onde você prefere fazer a coleta?" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {postos.map((p) => {
          const ativo = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => onSelect(p.id)}
              className="lh-row p-4 rounded-[16px] border text-left flex items-start gap-3"
              style={{
                borderColor: ativo ? 'var(--lh-action)' : 'var(--lh-line)',
                boxShadow: ativo ? 'inset 0 0 0 1px var(--lh-action)' : 'none',
              }}
            >
              <Ico name="map-pin" size={18} className={ativo ? 'text-link' : 'text-muted'} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{p.nome}</span>
                <span className="block text-[12px] text-muted mt-0.5">{p.endereco}</span>
              </span>
              {ativo && <Ico name="check" size={16} className="text-link" />}
            </button>
          )
        })}
      </div>
    </Panel>
  )
}
