import type { Agendamento } from '@lab-hub/shared'
import { Btn, DateBlock, Ico, Node, Panel, Pill } from '../portal'
import { podeCancelar, situacaoDaColeta } from '../../lib/coletas'
import { formatDataHora, timeFmt } from '../../lib/datetime'
import { JEJUM_LABEL, preparoAplicavel } from '../../lib/preparo'
import { PreparoPopover } from './PreparoColeta'

/** Ações que a coleta oferece. Só aparecem nos status em que valem. */
export interface AcoesColeta {
  /** Reenvia ao FlowLab uma coleta que ficou 'pendente'. */
  onResync: (id: string) => void
  /** ID em reenvio, se houver. */
  resyncingId: string | null
  /** Pede o cancelamento (a tela confirma antes). */
  onCancel: (agendamento: Agendamento) => void
}

interface LinhaColetaProps extends AcoesColeta {
  agendamento: Agendamento
  onOpen: (id: string) => void
}

const contagemDeExames = (a: Agendamento) => {
  const n = a.exames?.length ?? 0
  return n > 0 ? `${n} ${n === 1 ? 'exame' : 'exames'}` : null
}

/** Reenviar e Cancelar, compartilhados pela linha, pela próxima coleta e pelo detalhe. */
export function BotoesDaColeta({
  agendamento,
  onResync,
  resyncingId,
  onCancel,
  rotuloCancelar = 'Cancelar',
}: AcoesColeta & { agendamento: Agendamento; rotuloCancelar?: string }) {
  const { id, status } = agendamento
  const reenviando = resyncingId === id
  return (
    <>
      {status === 'pendente' && (
        <Btn variant="ghost" size="sm" icon="refresh-cw" loading={reenviando} onClick={() => onResync(id)}>
          {reenviando ? 'Reenviando…' : 'Reenviar'}
        </Btn>
      )}
      {podeCancelar(status) && (
        <Btn variant="ghost" size="sm" onClick={() => onCancel(agendamento)}>
          {rotuloCancelar}
        </Btn>
      )}
    </>
  )
}

/** Uma coleta na lista. Os controles ficam fora do botão que abre o detalhe. */
export function LinhaColeta({ agendamento, onOpen, ...acoes }: LinhaColetaProps) {
  const { id, postoNome, dataHora, status } = agendamento
  const { rotulo, tom, passo, alerta } = situacaoDaColeta(status)
  const exames = contagemDeExames(agendamento)
  return (
    <div className="lh-row flex items-center gap-x-3 gap-y-2 flex-wrap px-5 py-3">
      <button type="button" onClick={() => onOpen(id)} className="flex items-center gap-x-4 gap-y-1.5 flex-wrap flex-1 min-w-[240px] text-left py-1 rounded-[12px]">
        <Node step={passo} alert={alerta} ring size={40} />
        <span className="min-w-[160px] flex-1">
          <span className="block text-[14px] font-semibold">{postoNome}</span>
          <span className="block text-[12px] text-muted tabular-nums">
            {formatDataHora(dataHora)}
            {exames && ` · ${exames}`}
          </span>
        </span>
        {/* No celular a pílula desce e alinha com o texto, sem espremer a unidade. */}
        <span className="max-md:ml-14">
          <Pill tone={tom}>{rotulo}</Pill>
        </span>
        <Ico name="chevron-right" size={16} className="hidden md:inline-flex text-faint" />
      </button>
      <div className="flex items-center gap-1 ml-auto">
        <BotoesDaColeta agendamento={agendamento} {...acoes} />
        {/* Por último: o balão abre para a esquerda e precisa do espaço da linha. */}
        {preparoAplicavel(agendamento) && <PreparoPopover dataHora={dataHora} />}
      </div>
    </div>
  )
}

/** Destaque da próxima coleta. */
export function ProximaColeta({
  agendamento,
  onOpen,
  ...acoes
}: AcoesColeta & { agendamento: Agendamento; onOpen: (id: string) => void }) {
  const { id, postoNome, dataHora } = agendamento
  const data = new Date(dataHora)
  return (
    <section aria-label="Próxima coleta" className="mb-5">
      <Panel>
        <div className="flex items-start gap-4 flex-wrap">
          <DateBlock date={data} size={64} />
          <div className="flex-1 min-w-[200px]">
            <div className="lh-ov mb-1.5">Próxima coleta</div>
            <div className="text-[16px] font-semibold">
              <span className="tabular-nums">{timeFmt.format(data)}</span> · {postoNome}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <Pill icon="utensils-crossed">Jejum de {JEJUM_LABEL}</Pill>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <BotoesDaColeta agendamento={agendamento} {...acoes} />
            <Btn size="sm" onClick={() => onOpen(id)}>
              Ver detalhes
            </Btn>
          </div>
        </div>
      </Panel>
    </section>
  )
}
