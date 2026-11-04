import { useEffect, useRef, useState } from 'react'
import type { TipoDocumento } from '@lab-hub/shared'
import { Btn, Chip, EmptyState, FalhaAoCarregar, PageHeader, Panel } from '../components/portal'
import { DocumentList } from '../components/documents/DocumentList'
import { UploadDocumentsModal } from '../components/documents/UploadDocumentsModal'
import { track } from '../lib/analytics'
import { avisar } from '../lib/avisos'
import { DOC_META, TIPOS_DOCUMENTO } from '../lib/documentos'
import { useDocumentos } from '../lib/useDocumentos'

type TabId = 'all' | TipoDocumento

const TABS: { id: TabId; label: string }[] = [{ id: 'all', label: 'Todos' }, ...TIPOS_DOCUMENTO.map((t) => ({ id: t as TabId, label: DOC_META[t].label }))]

export function DocumentsPage() {
  const [tab, setTab] = useState<TabId>('all')
  const [enviarAberto, setEnviarAberto] = useState(false)
  const { documentos, loading, error, reload, enviar, remover, limparErro } = useDocumentos()
  // Abrir a caixa zera o erro: sem isto, uma lista que não carregou passaria por
  // vazia ao fechar.
  const recarregarAoFechar = useRef(false)

  const contagem = (id: TabId) => (id === 'all' ? documentos.length : documentos.filter((d) => d.tipo === id).length)
  const filtrados = tab === 'all' ? documentos : documentos.filter((d) => d.tipo === tab)

  // A caixa mostra a falha de cada envio na própria linha, então o erro que o
  // hook guarda seria um segundo aviso do mesmo problema e sobreviveria ao
  // fechamento. Zera nas duas pontas.
  const abrirModal = () => {
    track('documento_modal_abrir')
    recarregarAoFechar.current = error !== null && documentos.length === 0
    limparErro()
    setEnviarAberto(true)
  }
  const fecharModal = () => {
    limparErro()
    setEnviarAberto(false)
    if (recarregarAoFechar.current) reload()
  }

  const erroVisivel = enviarAberto ? null : error
  const falhouAoCarregar = erroVisivel !== null && documentos.length === 0 && !loading

  // Com a lista na tela, o erro vem quase sempre de excluir: remover() desfaz a
  // exclusão e recarrega, e esse recarregamento zera o erro logo em seguida. Um
  // aviso continua visível depois disso. O título é neutro porque o recarregamento
  // também pode falhar, e a mensagem é a da API.
  const erroSobreALista = documentos.length > 0 ? erroVisivel : null
  useEffect(() => {
    if (erroSobreALista) avisar({ tone: 'alert', title: 'Não foi possível concluir', message: erroSobreALista })
  }, [erroSobreALista])

  return (
    <div className="lh-alvos">
      <PageHeader
        title="Documentos"
        sub="Identidade, carteirinha e pedidos médicos num só lugar — a recepção confere antes de você chegar."
        right={
          <Btn icon="upload" onClick={abrirModal}>
            Enviar documentos
          </Btn>
        }
      />

      {enviarAberto && <UploadDocumentsModal tipos={TIPOS_DOCUMENTO} onEnviar={enviar} onFechar={fecharModal} />}

      {falhouAoCarregar ? (
        <Panel pad={0}>
          <FalhaAoCarregar titulo="Não foi possível carregar seus documentos" erro={erroVisivel} onTentar={reload} />
        </Panel>
      ) : (
        <>
          {/* Sem contagens enquanto a lista não chegou: "Todos 0" seria falso. */}
          {!(loading && documentos.length === 0) && (
            <div role="group" aria-label="Filtrar por tipo" className="flex items-center gap-2 flex-wrap mb-5">
              {TABS.map((t) => (
                <Chip key={t.id} selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label} <span className="tabular-nums opacity-80">{contagem(t.id)}</span>
                </Chip>
              ))}
            </div>
          )}
          <DocumentList
            documentos={filtrados}
            loading={loading}
            onRemover={(id) => void remover(id)}
            vazio={
              <Panel pad={0}>
                <EmptyState
                  icon="folder"
                  title="Nenhum documento aqui"
                  text="Envie identidade, carteirinha e pedidos médicos para ter tudo à mão nas coletas."
                  action={
                    <Btn variant="secondary" icon="upload" onClick={abrirModal}>
                      Enviar documentos
                    </Btn>
                  }
                />
              </Panel>
            }
          />
        </>
      )}
    </div>
  )
}
