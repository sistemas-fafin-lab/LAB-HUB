import { useState } from 'react'
import type { Agendamento } from '@lab-hub/shared'
import { Btn, Chip, EmptyState, FalhaAoCarregar, Node, Panel, SkeletonRows } from '../portal'
import { coletasEmAndamento, historicoDeColetas, proximaColeta, situacaoDaColeta } from '../../lib/coletas'
import { LinhaColeta, ProximaColeta } from './LinhaColeta'
import type { AcoesColeta } from './LinhaColeta'

interface ColetasListProps extends AcoesColeta {
  agendamentos: Agendamento[]
  loading: boolean
  error: string | null
  onRetry: () => void
  /** CTA do estado vazio. */
  onAgendar: () => void
  onOpen: (id: string) => void
}

/**
 * Coleta com pendência na recepção. Ocupa o lugar do alerta coral de recoleta do
 * design: é o único estado de atenção que o sistema conhece. A API não tem
 * recoleta, então este alerta não fala nela nem oferece agendá-la.
 */
function AlertaPendencia({ agendamento, onOpen }: { agendamento: Agendamento; onOpen: (id: string) => void }) {
  const { passo, alerta } = situacaoDaColeta(agendamento.status)
  return (
    <section aria-label="Coleta com pendência" className="mb-4">
      <Panel style={{ background: 'var(--lh-coral-soft)', borderColor: 'transparent' }}>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="lh-tile" style={{ background: 'var(--lh-card)' }}>
            <Node step={passo} alert={alerta} size={28} />
          </span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[14px] font-semibold">Uma coleta tem pendência na recepção</div>
            <div className="text-[13px]">
              {agendamento.postoNome} · verifique seus documentos (identidade, guia e pedido médico)
            </div>
          </div>
          <Btn size="sm" onClick={() => onOpen(agendamento.id)}>
            Ver detalhes
          </Btn>
        </div>
      </Panel>
    </section>
  )
}

export function ColetasList({ agendamentos, loading, error, onRetry, onAgendar, onOpen, ...acoes }: ColetasListProps) {
  const [aba, setAba] = useState<'ativas' | 'historico'>('ativas')

  if (loading) {
    return (
      <Panel pad={0}>
        <SkeletonRows n={3} />
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel>
        <FalhaAoCarregar titulo="Não foi possível carregar suas coletas" erro={error} onTentar={onRetry} />
      </Panel>
    )
  }

  const ativas = coletasEmAndamento(agendamentos)
  const historico = historicoDeColetas(agendamentos)
  const proxima = proximaColeta(agendamentos)
  const lista = aba === 'ativas' ? ativas : historico

  return (
    <>
      {ativas
        .filter((a) => a.status === 'bloqueado')
        .map((a) => (
          <AlertaPendencia key={a.id} agendamento={a} onOpen={onOpen} />
        ))}
      {proxima && <ProximaColeta agendamento={proxima} onOpen={onOpen} {...acoes} />}
      <div className="flex items-center gap-2 mb-4">
        <Chip selected={aba === 'ativas'} onClick={() => setAba('ativas')}>
          Em andamento <span className="tabular-nums opacity-80">{ativas.length}</span>
        </Chip>
        <Chip selected={aba === 'historico'} onClick={() => setAba('historico')}>
          Histórico <span className="tabular-nums opacity-80">{historico.length}</span>
        </Chip>
      </div>
      {/* overflow visível: o balão de preparo sai do cartão. */}
      <Panel pad={0} style={{ overflow: 'visible' }}>
        {lista.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={aba === 'ativas' ? 'Nenhuma coleta em andamento' : 'Nenhuma coleta no histórico'}
            text={aba === 'ativas' ? 'As coletas agendadas aparecem aqui.' : 'As coletas realizadas e canceladas aparecem aqui.'}
            {...(aba === 'ativas'
              ? {
                  action: (
                    <Btn icon="calendar-plus" onClick={onAgendar}>
                      Agendar coleta
                    </Btn>
                  ),
                }
              : {})}
          />
        ) : (
          <div className="divide-y divide-line">
            {lista.map((a) => (
              <LinhaColeta key={a.id} agendamento={a} onOpen={onOpen} {...acoes} />
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
