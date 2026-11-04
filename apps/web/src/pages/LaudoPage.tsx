import { useMemo } from 'react'
import { BackLink, Btn, EmptyState, FalhaAoCarregar, Node, Panel } from '../components/portal'
import { LaudoDocumento } from '../components/laudo/LaudoDocumento'
import { documentoDoExame } from '../components/laudo/modelo'
import type { Exam } from '../components/shared/WebHero'
import { track } from '../lib/analytics'
import { baixarDeclaracao } from '../lib/declaracao'
import { MOSTRAR_ENVIAR_AO_MEDICO } from '../lib/flags'
import { usePaciente } from '../lib/usePaciente'

interface LaudoPageProps {
  exam: Exam
  onBack: () => void
}

/**
 * O laudo em folhas A4 paginadas (LaudoDocumento) mais a barra de ações.
 *
 * "Exportar PDF" é `window.print()` de propósito: a folha da tela É o
 * documento, então o PDF que sai da caixa de diálogo do navegador tem
 * exatamente a mesma estrutura — cabeçalho repetido, tabela que continua na
 * folha seguinte e "Pág. X de Y". Um segundo gerador de PDF significaria dois
 * layouts para manter em sincronia, e é assim que os dois divergem.
 *
 * A barra fica fora da folha e acompanha o tema; a folha é sempre branca (é
 * papel), inclusive no escuro.
 */
export function LaudoPage({ exam, onBack }: LaudoPageProps) {
  const { paciente, error } = usePaciente()
  const doc = useMemo(() => documentoDoExame(exam, paciente), [exam, paciente])

  // O bloqueio é só da folha vazia: resultado parcial que já tem marcadores
  // continua saindo no papel, como sempre saiu.
  const naoLiberado = exam.status !== 'ready' && doc.grupos.length === 0 && doc.secoes.length === 0

  // A folha é o documento que o paciente leva ao médico: sem nome e CPF ela não
  // diz de quem é o exame, então nem aparece nem imprime.
  const temFolha = !naoLiberado && paciente !== null

  // O PDF do próprio laboratório, quando existe. É um documento DIFERENTE
  // deste — o laudo original assinado — e por isso não divide o botão com a
  // exportação: o rótulo diz qual dos dois o paciente está baixando. Não depende
  // da folha: continua disponível mesmo quando ela não pode ser montada.
  const handleOriginal = () => {
    track('laudo_download', { origem: 'laudo' })
    void baixarDeclaracao(exam.id)
  }

  const exportar = () => {
    track('laudo_imprimir')
    window.print()
  }

  return (
    <div className="lh-alvos max-w-5xl mx-auto">
      <div className="lh-noprint flex items-center justify-between gap-3 flex-wrap mb-4">
        <BackLink label="Exame" onClick={onBack} />
        <div className="flex items-center gap-2 flex-wrap -mt-4">
          {exam.declaracaoUrl && (
            <Btn variant="secondary" size="sm" icon="file-text" onClick={handleOriginal}>
              Laudo original
            </Btn>
          )}
          {temFolha && MOSTRAR_ENVIAR_AO_MEDICO && (
            <Btn variant="secondary" size="sm" icon="send">
              Enviar ao médico
            </Btn>
          )}
          {temFolha && (
            <Btn size="sm" icon="printer" onClick={exportar}>
              Exportar PDF
            </Btn>
          )}
        </div>
      </div>

      {temFolha ? (
        <LaudoDocumento doc={doc} />
      ) : (
        <Panel>
          {naoLiberado ? (
            <EmptyState
              icon="file-clock"
              title="Laudo ainda não liberado"
              text="O laudo aparece aqui assim que for liberado."
              action={
                <Btn variant="secondary" onClick={onBack}>
                  Voltar ao exame
                </Btn>
              }
            />
          ) : error !== null ? (
            <FalhaAoCarregar
              titulo="Não foi possível carregar o laudo"
              erro={error}
              onTentar={() => window.location.reload()}
            />
          ) : (
            <div role="status" className="py-16 flex flex-col items-center gap-3 text-[14px] text-muted">
              <Node loading size={40} />
              Carregando laudo…
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
