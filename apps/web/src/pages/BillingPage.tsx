import { useId } from 'react'
import type { ReactNode } from 'react'
import * as DS from '../ds'
import { IconTile, PageHeader, Panel, PanelHead, Pill } from '../components/portal'
import type { PillTone } from '../components/portal'

// Conteúdo estático, o mesmo de hoje: a tela continua atrás de
// MOSTRAR_FATURAMENTO. Sem backend de cobrança, a tela só mostra: trocar ou
// gerenciar o plano, adicionar cartão e tornar cartão principal ficam de fora
// (issue 16); exportar o histórico e baixar a NFS-e também, sem issue ainda.

type SituacaoCobranca = 'paid' | 'refunded'

interface Cobranca {
  id: string
  data: string
  descricao: string
  valor: string
  situacao: SituacaoCobranca
}

interface Cartao {
  bandeira: string
  final: string
  validade: string
  principal: boolean
}

const SITUACAO: Record<SituacaoCobranca, { tom: PillTone; rotulo: string }> = {
  paid: { tom: 'brand', rotulo: 'Pago' },
  refunded: { tom: 'neutral', rotulo: 'Estornado' },
}

const COBRANCAS: Cobranca[] = [
  { id: 'INV-2310', data: '15 out 2025', descricao: 'Hemograma + Perfil lipídico', valor: 'R$ 312,00', situacao: 'paid' },
  { id: 'INV-2287', data: '02 out 2025', descricao: 'Consulta Endocrinologia', valor: 'R$ 480,00', situacao: 'paid' },
  { id: 'INV-2241', data: '28 set 2025', descricao: 'Vitamina D · TSH · T4 livre', valor: 'R$ 198,00', situacao: 'paid' },
  { id: 'INV-2198', data: '04 set 2025', descricao: 'Glicemia + Colesterol total', valor: 'R$ 142,00', situacao: 'refunded' },
]

const CARTOES: Cartao[] = [
  { bandeira: 'Visa', final: '4821', validade: '08/29', principal: true },
  { bandeira: 'Mastercard', final: '1192', validade: '11/27', principal: false },
]

/** Cartão em região; `children` recebe o id do título que nomeia a região. */
function Secao({ pad, children }: { pad?: number; children: (idTitulo: string) => ReactNode }) {
  const id = useId()
  return (
    <Panel {...(pad !== undefined ? { pad } : {})}>
      <section aria-labelledby={id}>{children(id)}</section>
    </Panel>
  )
}

/** Marca da forma de pagamento (bandeira ou PIX). Decorativa: o nome vai em texto ao lado. */
function Marca({ texto }: { texto: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-9 w-12 rounded-[7px] bg-ink text-page inline-flex items-center justify-center text-[10px] font-bold tracking-wider shrink-0"
    >
      {texto}
    </span>
  )
}

function PlanoAtual() {
  const id = useId()
  return (
    <DS.Card variant="brand" padding={24} radius="20px" style={{ display: 'block', background: 'var(--lh-brand)' }}>
      <section aria-labelledby={id}>
        <h2 id={id} className="lh-ov mb-3" style={{ color: '#fff' }}>
          Plano atual
        </h2>
        <h3 className="font-display font-medium text-[32px] leading-none tracking-[-0.02em]">
          Lab Hub Care
          <span className="lh-dot" style={{ background: '#fff' }} />
        </h3>
        <p className="text-[15px] leading-relaxed mt-3 mb-6 max-w-md">
          Coletas em domicílio ilimitadas, prioridade nas unidades, descontos em consultas e laudos compartilháveis
          com seu time médico.
        </p>
        <dl className="flex items-end gap-8 flex-wrap">
          <div>
            <dt className="lh-ov mb-2" style={{ color: '#fff' }}>
              Mensalidade
            </dt>
            <dd className="font-display font-medium text-[28px] leading-none tabular-nums">
              R$ 89<span className="text-[16px]">,90</span>
            </dd>
          </div>
          <div>
            <dt className="lh-ov mb-2" style={{ color: '#fff' }}>
              Próximo débito
            </dt>
            <dd className="text-[15px] font-semibold">15 mai 2026</dd>
          </div>
        </dl>
      </section>
    </DS.Card>
  )
}

export function BillingPage() {
  return (
    <div>
      <PageHeader title="Faturamento" sub="Plano, formas de pagamento e histórico de notas fiscais." />

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-5">
          <PlanoAtual />

          <Secao pad={0}>
            {(id) => (
              <>
                <div className="px-5 pt-4 pb-3">
                  <h3 id={id} className="text-[15px] font-semibold">
                    Histórico de cobranças
                  </h3>
                </div>
                <ul className="divide-y divide-line border-t border-line">
                  {COBRANCAS.map((c) => (
                    <li
                      key={c.id}
                      className="lh-row grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 items-center px-5 py-3"
                    >
                      <IconTile name="receipt" size={34} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">{c.descricao}</div>
                        <div className="text-[12px] text-muted tabular-nums">
                          {c.id} · {c.data}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-4">
                        <span className="text-[14px] font-semibold tabular-nums text-right">{c.valor}</span>
                        <Pill tone={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].rotulo}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Secao>
        </div>

        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">
          <Secao>
            {(id) => (
              <>
                <PanelHead title={<span id={id}>Formas de pagamento</span>} />
                <ul className="flex flex-col gap-2">
                  {CARTOES.map((c) => (
                    <li
                      key={c.final}
                      className="flex items-center gap-3 p-3 rounded-[14px] border"
                      style={{
                        borderColor: c.principal ? 'var(--lh-brand)' : 'var(--lh-line)',
                        background: c.principal ? 'var(--lh-brand-soft)' : 'transparent',
                      }}
                    >
                      <Marca texto={c.bandeira.slice(0, 4).toUpperCase()} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold">
                          {c.bandeira} ···· {c.final}
                        </div>
                        <div className="text-[12px] text-muted">Validade {c.validade}</div>
                      </div>
                      {c.principal && <Pill tone="brand">Principal</Pill>}
                    </li>
                  ))}
                  <li className="flex items-center gap-3 p-3 rounded-[14px] border border-line">
                    <Marca texto="PIX" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold">PIX</div>
                      <div className="text-[12px] text-muted">Aprovação imediata</div>
                    </div>
                  </li>
                </ul>
              </>
            )}
          </Secao>

          <Secao>
            {(id) => (
              <>
                <PanelHead title={<span id={id}>Resumo do mês</span>} />
                <dl className="flex flex-col gap-3 text-[14px]">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Gasto até hoje</dt>
                    <dd className="font-semibold tabular-nums">R$ 312,00</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Reembolsado pelo plano</dt>
                    <dd className="font-semibold tabular-nums">− R$ 124,80</dd>
                  </div>
                  <div className="pt-3 border-t border-line flex items-center justify-between">
                    <dt className="font-semibold">Custo líquido</dt>
                    <dd className="font-display font-medium text-[22px] tabular-nums">R$ 187,20</dd>
                  </div>
                </dl>
              </>
            )}
          </Secao>
        </div>
      </div>
    </div>
  )
}
