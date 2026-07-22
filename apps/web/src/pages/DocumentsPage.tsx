import { useState } from 'react'
import type { TipoDocumento } from '@lab-hub/shared'
import { WIcon } from '../components/primitives/WIcon'
import { UploadDocumentsModal } from '../components/documents/UploadDocumentsModal'
import { DocumentList } from '../components/documents/DocumentList'
import { useDocumentos } from '../lib/useDocumentos'
import { DOC_META, TIPOS_DOCUMENTO } from '../lib/documentos'
import { track } from '../lib/analytics'

interface DocumentsPageProps {
  dark: boolean
}

type TabId = 'all' | TipoDocumento

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...TIPOS_DOCUMENTO.map((t) => ({ id: t as TabId, label: DOC_META[t].label })),
]

export function DocumentsPage({ dark }: DocumentsPageProps) {
  const [tab, setTab] = useState<TabId>('all')
  const [enviarAberto, setEnviarAberto] = useState(false)
  const { documentos, loading, error, enviar, remover, limparErro } = useDocumentos()

  const filtrados = tab === 'all' ? documentos : documentos.filter((d) => d.tipo === tab)

  // O modal mostra a falha de cada envio na própria linha, então o erro que o
  // hook guarda seria um segundo aviso do mesmo problema — e sobreviveria ao
  // fechamento como um banner órfão. Zera nas duas pontas.
  const abrirModal = () => {
    track('documento_modal_abrir')
    limparErro()
    setEnviarAberto(true)
  }
  const fecharModal = () => {
    limparErro()
    setEnviarAberto(false)
  }

  return (
    <div>
      <div className="mb-5 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1
            className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            Documentos
          </h1>
          <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Identidade, carteirinha e pedidos médicos num só lugar — a recepção confere antes de
            você chegar.
          </p>
        </div>
        <button
          onClick={abrirModal}
          className="bg-blue-600 text-white text-xs font-semibold h-9 px-3 rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700 transition"
        >
          <WIcon name="upload" className="w-4 h-4" strokeWidth={2.2} />
          Enviar documentos
        </button>
      </div>

      {enviarAberto && (
        <UploadDocumentsModal
          tipos={TIPOS_DOCUMENTO}
          onEnviar={enviar}
          onFechar={fecharModal}
          dark={dark}
        />
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 text-sm mb-4">
          {error}
        </div>
      )}

      <div
        className={`rounded-2xl border ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        } p-2 shadow-sm mb-4 inline-flex gap-1 flex-wrap`}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 h-8 rounded-lg text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : dark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DocumentList
        documentos={filtrados}
        loading={loading}
        dark={dark}
        onRemover={(id) => void remover(id)}
        vazio={
          tab === 'all'
            ? 'Nenhum documento enviado ainda.'
            : 'Nenhum documento deste tipo.'
        }
      />
    </div>
  )
}
