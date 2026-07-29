import { useMemo } from 'react'
import { WIcon } from '../components/primitives/WIcon'
import { LaudoDocumento } from '../components/laudo/LaudoDocumento'
import { documentoDoExame } from '../components/laudo/modelo'
import type { Exam } from '../components/shared/WebHero'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { MOSTRAR_ENVIAR_AO_MEDICO } from '../lib/flags'
import { usePaciente } from '../lib/usePaciente'

interface LaudoPageProps {
  exam: Exam
  onBack: () => void
  dark: boolean
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
 * A barra fica FORA da folha, sobre o fundo do app — e no tema escuro os
 * botões em cinza-claro ficavam quase invisíveis. Este é o único trecho da
 * tela que precisa saber do tema; a folha é sempre branca (é papel).
 */
export function LaudoPage({ exam, onBack, dark }: LaudoPageProps) {
  const { paciente } = usePaciente()
  const doc = useMemo(() => documentoDoExame(exam, paciente), [exam, paciente])

  // O PDF do próprio laboratório, quando existe. É um documento DIFERENTE
  // deste — o laudo original assinado — e por isso não divide o botão com a
  // exportação: o rótulo diz qual dos dois o paciente está baixando.
  const handleOriginal = async () => {
    track('laudo_download', { origem: 'laudo' })
    try {
      const { url } = await api.declaracao(exam.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      /* sem declaração disponível */
    }
  }

  const exportar = () => {
    track('laudo_imprimir')
    window.print()
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <button
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
            dark ? 'text-gray-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />Voltar
        </button>
        <div className="flex items-center gap-2">
          {exam.declaracaoUrl && (
            <button
              onClick={() => void handleOriginal()}
              className={`text-xs font-medium px-3 h-9 rounded-lg border inline-flex items-center gap-1.5 ${
                dark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-200 text-gray-600 bg-white'
              }`}
            >
              <WIcon name="file-text" className="w-4 h-4" strokeWidth={2.2} />Laudo original
            </button>
          )}
          {MOSTRAR_ENVIAR_AO_MEDICO && (
            <button className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-50 text-blue-700 inline-flex items-center gap-1.5 shrink-0">
              <WIcon name="send" className="w-4 h-4" strokeWidth={2.2} />Enviar ao médico
            </button>
          )}
          <button
            onClick={exportar}
            className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25"
          >
            <WIcon name="printer" className="w-4 h-4" strokeWidth={2.2} />Exportar PDF
          </button>
        </div>
      </div>

      <LaudoDocumento doc={doc} />
    </div>
  )
}
