import { useEffect, useRef, useState } from 'react'
import type { Documento } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { api } from '../../lib/api'
import { DOC_META, TONE_CLASSES, formatarFormato, formatarTamanho } from '../../lib/documentos'
import { formatEtapaHora } from '../../lib/datetime'

interface DocumentCardProps {
  documento: Documento
  dark: boolean
  onRemover?: (id: string) => void
}

export function DocumentCard({ documento, dark, onRemover }: DocumentCardProps) {
  const [abrindo, setAbrindo] = useState<'ver' | 'baixar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const meta = DOC_META[documento.tipo]
  const ehImagem = documento.mimeType.startsWith('image/')

  // Preview real da imagem. A signed URL é buscada só quando o card entra na
  // viewport (não no mount): preserva o motivo do design original — nada de N
  // requests de uma vez — mostrando a miniatura apenas dos cards visíveis.
  // previewFalhou (URL vencida/arquivo corrompido/rede) cai de volta no ícone,
  // em vez de deixar a imagem quebrada na tela — mesmo padrão do check-in.
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
        .documentoUrl(documento.id)
        .then(({ url }) => setPreviewUrl(url))
        .catch(() => setPreviewFalhou(true))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ehImagem, documento.id])

  // O arquivo vive num bucket privado: pedimos uma signed URL sob demanda, em vez
  // de emitir uma por card no mount (N requests e N capabilities que o usuário
  // nem pediu). Mesmo padrão de api.declaracao() nas páginas de laudo.
  const abrir = async (modo: 'ver' | 'baixar') => {
    setAbrindo(modo)
    setErro(null)
    try {
      const { url } = await api.documentoUrl(documento.id, modo === 'baixar')
      window.open(url, '_blank', 'noopener')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir o documento')
    } finally {
      setAbrindo(null)
    }
  }

  const acaoBase = `h-7 w-7 rounded-lg flex items-center justify-center disabled:opacity-40 ${
    dark ? 'hover:bg-gray-800' : 'hover:bg-slate-100'
  }`

  const mostrandoImagem = ehImagem && previewUrl !== null && !previewFalhou
  const previewBase = 'aspect-[3/2] rounded-xl mb-3 overflow-hidden'
  const previewClasse = mostrandoImagem
    ? `${previewBase} ${dark ? 'border border-gray-800' : 'border border-gray-100'}`
    : `${previewBase} border-2 border-dashed flex items-center justify-center ${
        dark ? 'border-gray-800 bg-gray-800/30' : 'border-gray-100 bg-slate-50'
      }`

  return (
    <div
      className={`rounded-2xl border ${
        dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
      } p-4 shadow-sm hover:shadow-md transition group`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASSES[meta.tone]}`}>
          <WIcon name={meta.icon} className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-900'}`}>
            {meta.label}
          </div>
          <div className="text-[11px] text-gray-400 truncate" title={documento.nomeArquivo}>
            {documento.nomeArquivo}
          </div>
        </div>
      </div>

      {/* Imagem: miniatura real (signed URL sob demanda) clicável, que abre em nova
          aba pelo fluxo "ver". PDF/carregando/falha: ícone tracejado como antes. */}
      <div ref={previewRef} className={previewClasse}>
        {mostrandoImagem ? (
          <button type="button" onClick={() => void abrir('ver')} title="Visualizar" className="block w-full h-full">
            <img
              src={previewUrl ?? undefined}
              alt={documento.nomeArquivo}
              loading="lazy"
              onError={() => setPreviewFalhou(true)}
              className="w-full h-full object-cover"
            />
          </button>
        ) : (
          <WIcon
            name={documento.mimeType === 'application/pdf' ? 'file-text' : 'image'}
            className={`w-8 h-8 ${dark ? 'text-gray-600' : 'text-gray-300'}`}
            strokeWidth={1.6}
          />
        )}
      </div>

      {erro && <div className="text-[11px] text-red-500 mb-2">{erro}</div>}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-400 truncate">
          {formatarFormato(documento.mimeType)} · {formatarTamanho(documento.tamanhoBytes)} ·{' '}
          {formatEtapaHora(documento.criadoEm)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => void abrir('ver')}
            disabled={abrindo !== null}
            title="Visualizar"
            className={acaoBase}
          >
            <WIcon
              name={abrindo === 'ver' ? 'loader-2' : 'eye'}
              className={`w-3.5 h-3.5 text-gray-500 ${abrindo === 'ver' ? 'animate-spin' : ''}`}
              strokeWidth={2.2}
            />
          </button>
          <button
            onClick={() => void abrir('baixar')}
            disabled={abrindo !== null}
            title="Baixar"
            className={acaoBase}
          >
            <WIcon
              name={abrindo === 'baixar' ? 'loader-2' : 'download'}
              className={`w-3.5 h-3.5 text-gray-500 ${abrindo === 'baixar' ? 'animate-spin' : ''}`}
              strokeWidth={2.2}
            />
          </button>
          {onRemover && (
            <button
              onClick={() => onRemover(documento.id)}
              title="Excluir"
              className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                dark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
              }`}
            >
              <WIcon name="trash-2" className="w-3.5 h-3.5 text-gray-500 hover:text-red-500" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
