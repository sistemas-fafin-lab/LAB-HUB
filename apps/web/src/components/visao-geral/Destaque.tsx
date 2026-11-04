import { useId } from 'react'
import type { ReactNode } from 'react'
import * as DS from '../../ds'
import { Btn, Node, Skel } from '../portal'
import type { Exam } from '../../lib/exame'
import { baixarDeclaracao } from '../../lib/declaracao'
import { unidadeDoExame } from '../../lib/exibicaoExame'

// O destaque da Visão geral: o recorte em L da marca (Grafismo). A altura vem
// do CSS (.lh-hero), que a aumenta nas telas estreitas para o texto caber.

interface MolduraProps {
  rotulo: string
  titulo: readonly [string, string]
  texto: string
  acoes: ReactNode
  rodape?: ReactNode
  /** Texto do recorte, ao lado do nó. */
  situacao: string
  detalhe: string
  passo: number
}

function Moldura({ rotulo, titulo, texto, acoes, rodape, situacao, detalhe, passo }: MolduraProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="lh-hero relative">
      <DS.Grafismo
        fill="var(--lh-brand)"
        notch="top-right"
        step={[0.3, 0.36]}
        radius={24}
        height="var(--lh-hero-altura)"
        contentStyle={{ padding: 'var(--lh-hero-respiro)' }}
      >
        <div className="lh-hero-ov">{rotulo}</div>
        <h2 id={id} className="lh-hero-h">
          {titulo[0]}
          <br />
          {titulo[1]}
        </h2>
        <p className="lh-hero-p">{texto}</p>
        <div className="flex items-center gap-5 flex-wrap">{acoes}</div>
        {rodape}
      </DS.Grafismo>
      <div className="lh-hero-notch">
        <div className="text-right pt-1 hidden sm:block">
          <div className="text-[13px] font-semibold text-ink">{situacao}</div>
          <div className="text-[12px] text-muted tabular-nums">{detalhe}</div>
        </div>
        <span className="lh-tile">
          <Node step={passo} size={28} onBrand />
        </span>
      </div>
    </section>
  )
}

/** Exame liberado mais recente, com o caminho para o resultado e a declaração. */
export function DestaqueExame({ exam, onOpen }: { exam: Exam; onOpen: () => void }) {
  const liberadoEm = exam.dataEmissao ?? exam.fullDate
  // "coletado em" só com a data de coleta de verdade; com a emissão a frase
  // afirmaria a data errada (ver dataColeta em Exam).
  const quando = exam.dataColeta ? `coletado em ${exam.dataColeta}` : `liberado em ${liberadoEm}`
  const unidade = unidadeDoExame(exam)
  const onde = unidade ? `, na ${unidade}` : ''
  const fora = exam.panels.filter((p) => !p.ok).length

  return (
    <Moldura
      rotulo="Último exame"
      titulo={['Seu último exame', 'está pronto.']}
      texto={`${exam.name} — ${quando}${onde}.`}
      situacao="Liberado"
      detalhe={liberadoEm}
      passo={5}
      acoes={
        <>
          <Btn variant="inverse" iconRight="arrow-right" onClick={onOpen}>
            Ver resultado
          </Btn>
          {exam.declaracaoUrl && (
            <button type="button" className="lh-hero-link" onClick={() => void baixarDeclaracao(exam.id)}>
              Baixar PDF
            </button>
          )}
        </>
      }
      rodape={
        exam.panels.length > 0 && (
          <div className="lh-hero-stats hidden xl:flex">
            <div>
              <b>{exam.panels.length}</b>
              <span>marcadores</span>
            </div>
            <div>
              <b>{fora}</b>
              <span>fora da referência</span>
            </div>
          </div>
        )
      }
    />
  )
}

/** Estado vazio da Visão geral: quem nunca coletou é levado a agendar. */
export function DestaquePrimeiraColeta({ onAgendar }: { onAgendar: () => void }) {
  return (
    <Moldura
      rotulo="Primeira coleta"
      titulo={['Agende sua', 'primeira coleta.']}
      texto="Escolha a unidade, o dia e o horário. O resultado aparece em Resultados assim que for liberado."
      situacao="Nenhum exame"
      detalhe="ainda"
      passo={0}
      acoes={
        <Btn variant="inverse" icon="calendar-plus" onClick={onAgendar}>
          Agendar coleta
        </Btn>
      }
    />
  )
}

export function DestaqueCarregando() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando seus exames" className="lh-hero relative">
      <Skel className="h-[var(--lh-hero-altura)] rounded-[24px]" />
      <span className="absolute inset-0 flex items-center justify-center">
        <Node loading size={40} />
      </span>
    </div>
  )
}
