import { useEffect, useRef, useState } from 'react'
import type { Documento } from '@lab-hub/shared'
import { Ico, IconBtn, IconTile, Node, Panel } from '../portal'
import { MensagemDeErro } from './MensagemDeErro'
import { api } from '../../lib/api'
import { DOC_META, formatarFormato, formatarTamanho } from '../../lib/documentos'
import { formatEtapaHora } from '../../lib/datetime'

interface DocumentCardProps {
  documento: Documento
  /** Pede a exclusão (a lista confirma antes). Sem ela, o botão não aparece. */
  onExcluir?: (documento: Documento) => void
}

export function DocumentCard({ documento, onExcluir }: DocumentCardProps) {
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const { id, tipo, nomeArquivo, mimeType, tamanhoBytes, criadoEm } = documento
  const meta = DOC_META[tipo]
  const ehImagem = mimeType.startsWith('image/')

  // Miniatura real da imagem. A signed URL é buscada só quando o card entra na
  // tela: nada de N requests de uma vez. Se falhar (URL vencida, arquivo
  // corrompido, rede), cai de volta no ícone em vez de mostrar imagem quebrada.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFalhou, setPreviewFalhou] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ehImagem) return
    const el = previewRef.current
    if (!el) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      api
        .documentoUrl(id)
        .then(({ url }) => setPreviewUrl(url))
        .catch(() => setPreviewFalhou(true))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ehImagem, id])

  // O arquivo vive num bucket privado: a signed URL é pedida sob demanda, em vez
  // de emitir uma por card. Os botões seguem habilitados durante o pedido para
  // o foco do teclado não se perder; o guarda evita abrir duas vezes.
  const abrir = async (modo: 'ver' | 'baixar') => {
    if (abrindo) return
    setAbrindo(true)
    setErro(null)
    try {
      const { url } = await api.documentoUrl(id, modo === 'baixar')
      window.open(url, '_blank', 'noopener')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir o documento')
    } finally {
      setAbrindo(false)
    }
  }

  const mostrandoImagem = ehImagem && previewUrl !== null && !previewFalhou

  return (
    <Panel pad={16}>
      <div className="flex items-start gap-3 mb-3">
        <IconTile name={meta.icon} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold truncate">{meta.label}</div>
          <div className="text-[12px] text-muted truncate" title={nomeArquivo}>
            {nomeArquivo}
          </div>
        </div>
      </div>

      <div ref={previewRef} className="mb-3">
        <button
          type="button"
          onClick={() => void abrir('ver')}
          aria-label={`Visualizar ${nomeArquivo}`}
          className="w-full h-24 rounded-[12px] overflow-hidden bg-subtle flex items-center justify-center text-faint hover:text-muted transition-colors"
        >
          {mostrandoImagem ? (
            <img src={previewUrl} alt={nomeArquivo} loading="lazy" onError={() => setPreviewFalhou(true)} className="w-full h-full object-cover" />
          ) : (
            <Ico name={mimeType === 'application/pdf' ? 'file-text' : 'image'} size={30} stroke={1.25} />
          )}
        </button>
      </div>

      {erro && (
        <div className="mb-2">
          <MensagemDeErro>{erro}</MensagemDeErro>
        </div>
      )}

      <div className="flex items-center justify-between gap-x-2 gap-y-1 flex-wrap">
        {abrindo ? (
          <span role="status" className="inline-flex items-center gap-2 text-[12px] text-muted">
            <Node loading size={16} />
            Preparando…
          </span>
        ) : (
          <span className="text-[12px] text-muted tabular-nums">
            {formatarFormato(mimeType)} · {formatarTamanho(tamanhoBytes)} · {formatEtapaHora(criadoEm)}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <IconBtn icon="eye" label="Visualizar" onClick={() => void abrir('ver')} />
          <IconBtn icon="download" label="Baixar" onClick={() => void abrir('baixar')} />
          {onExcluir && <IconBtn icon="trash-2" label="Excluir" onClick={() => onExcluir(documento)} />}
        </div>
      </div>
    </Panel>
  )
}
