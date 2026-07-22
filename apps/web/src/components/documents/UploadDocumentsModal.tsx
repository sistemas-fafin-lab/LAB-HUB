import { useCallback, useEffect, useState } from 'react'
import type { TipoDocumento } from '@lab-hub/shared'
import { WIcon } from '../primitives/WIcon'
import { WFileInput } from '../primitives/WFileInput'
import { DOC_META, TONE_CLASSES, formatarTamanho, validarArquivo } from '../../lib/documentos'
import { track } from '../../lib/analytics'

// Cada estado significa UMA coisa, e é isso que define o botão "Enviar":
//   pendente → entra no próximo envio (pode carregar o `erro` da tentativa anterior)
//   enviando → em voo
//   enviado  → concluído, sai da fila de envio
//   erro     → recusado aqui no browser (tamanho/formato); nunca será enviado,
//              o paciente remove a linha. Falha de rede/servidor NÃO cai aqui:
//              volta p/ 'pendente' com mensagem, para o próximo clique retentar.
type StatusItem = 'pendente' | 'enviando' | 'enviado' | 'erro'

interface ItemFila {
  id: string
  file: File
  tipo: TipoDocumento
  status: StatusItem
  erro?: string
}

// Chave estável do React. Nome+tamanho colidem (dois "documento.pdf" de origens
// diferentes) e o índice quebra ao remover uma linha do meio da fila.
let sequencia = 0
const proximoId = (): string => `item-${sequencia++}`

interface UploadDocumentsModalProps {
  /** Tipos oferecidos por linha. Varia por contexto, como no DocumentUploader. */
  tipos: TipoDocumento[]
  /** Envia UM arquivo. A API aceita um por request; a fila é do cliente. */
  onEnviar: (file: File, tipo: TipoDocumento) => Promise<void>
  onFechar: () => void
  dark: boolean
}

// Envio em lote: o paciente junta os arquivos, ajusta o tipo de cada um e manda
// tudo de uma vez. O upload só dispara no "Enviar" — adicionar à fila é local e
// reversível, então dá p/ corrigir o tipo antes de gastar a rede.
export function UploadDocumentsModal({
  tipos,
  onEnviar,
  onFechar,
  dark,
}: UploadDocumentsModalProps) {
  const [itens, setItens] = useState<ItemFila[]>([])
  const [enviando, setEnviando] = useState(false)

  const fechar = useCallback(() => {
    if (!enviando) onFechar()
  }, [enviando, onFechar])

  // Fecha com Esc e trava o scroll do body — mesmo contrato do ConfirmBookingModal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fechar])

  const atualizar = (id: string, muda: (i: ItemFila) => ItemFila) =>
    setItens((prev) => prev.map((i) => (i.id === id ? muda(i) : i)))

  const adicionar = (files: File[]) => {
    setItens((prev) => [
      ...prev,
      ...files.map((file): ItemFila => {
        // Valida na entrada p/ o problema aparecer na linha, junto do arquivo que
        // o causou, em vez de só na hora do envio.
        const problema = validarArquivo(file)
        return {
          id: proximoId(),
          file,
          tipo: tipos[0] ?? 'outro',
          status: problema ? 'erro' : 'pendente',
          // Spread condicional: com exactOptionalPropertyTypes, `erro: undefined`
          // não é o mesmo que omitir a chave.
          ...(problema ? { erro: problema } : {}),
        }
      }),
    ])
  }

  const enviarTudo = async () => {
    const fila = itens.filter((i) => i.status === 'pendente')
    if (fila.length === 0) return
    // Lido do snapshot ANTES do loop: 'erro' aqui só pode ser recusa local (o
    // loop nunca produz esse status), e essas linhas não somem sozinhas.
    const temRecusado = itens.some((i) => i.status === 'erro')
    setEnviando(true)

    // Sequencial, não Promise.all: a API limita POST /documentos a 10/min por
    // paciente, então o paralelo faria as últimas linhas baterem em 429 por
    // culpa das primeiras. Em série também é trivial atribuir cada erro à
    // sua linha e a ordem da lista é a ordem do envio.
    let sucessos = 0
    for (const item of fila) {
      atualizar(item.id, ({ erro: _erro, ...resto }) => ({ ...resto, status: 'enviando' }))
      try {
        await onEnviar(item.file, item.tipo)
        atualizar(item.id, ({ erro: _erro, ...resto }) => ({ ...resto, status: 'enviado' }))
        sucessos++
      } catch (e: unknown) {
        // Volta p/ 'pendente': a falha aqui é do servidor/rede e o próximo
        // clique em "Enviar" retenta só esta linha (as já enviadas saíram da fila).
        atualizar(item.id, (i) => ({
          ...i,
          status: 'pendente',
          erro: e instanceof Error ? e.message : 'Falha ao enviar',
        }))
      }
    }

    setEnviando(false)
    // Só contagens: nome e tipo de arquivo do paciente ficam fora do evento.
    track('documento_upload_lote', {
      total: fila.length,
      sucessos,
      falhas: fila.length - sucessos,
    })
    // Fecha sozinho só quando não sobrou nada a resolver — se alguma linha falhou
    // ou foi recusada, o modal fica aberto mostrando o quê e por quê.
    if (sucessos === fila.length && !temRecusado) onFechar()
  }

  const pendentes = itens.filter((i) => i.status === 'pendente').length
  const enviados = itens.filter((i) => i.status === 'enviado').length

  const borda = dark ? 'border-gray-800' : 'border-gray-100'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Enviar documentos"
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={fechar}
      />

      <div
        className={`relative w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[85vh] ${
          dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
        }`}
      >
        <div className={`p-5 pb-4 flex items-start gap-3 border-b ${borda}`}>
          <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <WIcon name="upload" className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div className="flex-1">
            <div className={`text-base font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>
              Enviar documentos
            </div>
            <p className={`mt-0.5 text-sm leading-snug ${dark ? 'text-gray-400' : 'text-slate-600'}`}>
              Adicione seus arquivos, confira o tipo de cada um e envie.
            </p>
          </div>
          <button
            onClick={fechar}
            disabled={enviando}
            aria-label="Fechar"
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-40 ${
              dark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-slate-100'
            }`}
          >
            <WIcon name="x" className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-3">
          <WFileInput
            onSelect={adicionar}
            multiple
            disabled={enviando}
            dark={dark}
            hint="JPG, PNG, WEBP ou PDF · até 10 MB por arquivo"
          />

          {itens.map((item) => (
            <FilaLinha
              key={item.id}
              item={item}
              tipos={tipos}
              travado={enviando}
              onTipo={(tipo) => atualizar(item.id, (i) => ({ ...i, tipo }))}
              onRemover={() => setItens((prev) => prev.filter((i) => i.id !== item.id))}
              dark={dark}
            />
          ))}
        </div>

        <div
          className={`px-5 py-3 flex items-center gap-2 border-t ${
            dark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-slate-50'
          }`}
        >
          {enviados > 0 && (
            <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1.5">
              <WIcon name="check-circle" className="w-3.5 h-3.5" strokeWidth={2.2} />
              {enviados} enviado{enviados > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={fechar}
            disabled={enviando}
            className={`ml-auto px-4 h-9 rounded-xl text-sm font-semibold border transition disabled:opacity-50 ${
              dark
                ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                : 'border-gray-200 text-slate-700 hover:bg-white'
            }`}
          >
            {enviados > 0 && pendentes === 0 ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            onClick={() => void enviarTudo()}
            disabled={enviando || pendentes === 0}
            className="px-4 h-9 rounded-xl text-sm font-semibold bg-blue-600 text-white inline-flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition disabled:opacity-40 disabled:hover:bg-blue-600 disabled:active:scale-100"
          >
            {enviando ? (
              <>
                <WIcon name="loader-2" className="w-4 h-4 animate-spin" strokeWidth={2.4} />
                Enviando…
              </>
            ) : (
              <>
                <WIcon name="upload" className="w-4 h-4" strokeWidth={2.4} />
                Enviar{pendentes > 0 ? ` (${pendentes})` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

interface FilaLinhaProps {
  item: ItemFila
  tipos: TipoDocumento[]
  /** Enquanto o lote sobe, tipo e remoção ficam congelados. */
  travado: boolean
  onTipo: (tipo: TipoDocumento) => void
  onRemover: () => void
  dark: boolean
}

function FilaLinha({ item, tipos, travado, onTipo, onRemover, dark }: FilaLinhaProps) {
  const meta = DOC_META[item.tipo]
  const concluido = item.status === 'enviado'

  return (
    <div
      // items-center e não items-start: o ícone (h-9) é mais alto que a linha de
      // conteúdo (h-7, a altura do select), então alinhar pelo topo deixava o
      // texto acima do centro do card. Centralizado, os três blocos batem.
      className={`rounded-xl border p-3 flex items-center gap-3 ${
        item.status === 'erro'
          ? 'border-red-200 bg-red-50/50'
          : dark
            ? 'border-gray-800 bg-gray-800/40'
            : 'border-gray-100 bg-slate-50'
      }`}
    >
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          item.status === 'erro' ? 'bg-red-100 text-red-600' : TONE_CLASSES[meta.tone]
        }`}
      >
        <WIcon
          name={item.status === 'erro' ? 'alert-circle' : meta.icon}
          className="w-4 h-4"
          strokeWidth={2.2}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Só o nome encolhe: tamanho e seletor ficam legíveis por inteiro
              mesmo com um arquivo de nome quilométrico. */}
          <span
            className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-900'}`}
            title={item.file.name}
          >
            {item.file.name}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0">
            {formatarTamanho(item.file.size)}
          </span>

          {concluido ? (
            <span className="text-[11px] font-semibold text-emerald-600 inline-flex items-center gap-1 shrink-0">
              <WIcon name="check" className="w-3 h-3" strokeWidth={2.6} />
              Enviado como {meta.label}
            </span>
          ) : item.status === 'erro' ? null : (
            // Linha recusada aqui no browser (status 'erro') não ganha seletor:
            // ela nunca vai subir, só sair — escolher o tipo seria teatro. Já uma
            // 'pendente' COM erro é retentável, e mantém o seletor.
            <select
              value={item.tipo}
              disabled={travado}
              onChange={(e) => onTipo(e.target.value as TipoDocumento)}
              aria-label={`Tipo de ${item.file.name}`}
              className={`text-[11px] font-semibold rounded-lg px-2 h-7 border outline-none shrink-0 disabled:opacity-50 ${
                dark
                  ? 'bg-gray-900 border-gray-700 text-gray-200'
                  : 'bg-white border-gray-200 text-slate-700'
              }`}
            >
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {DOC_META[t].label}
                </option>
              ))}
            </select>
          )}
        </div>

        {item.erro && <div className="text-[11px] text-red-600 mt-1">{item.erro}</div>}
      </div>

      {/* Caixa de 28px fixa nos três estados: sem ela a linha muda de largura ao
          passar de pendente (lixeira) p/ enviando (spinner), e o nome do arquivo
          re-trunca no meio do upload. */}
      <div className="h-7 w-7 flex items-center justify-center shrink-0">
        {item.status === 'enviando' ? (
          <WIcon name="loader-2" className="w-4 h-4 text-blue-600 animate-spin" strokeWidth={2.2} />
        ) : concluido ? (
          <WIcon name="check-circle" className="w-4 h-4 text-emerald-600" strokeWidth={2.2} />
        ) : (
          <button
            onClick={onRemover}
            disabled={travado}
            aria-label={`Remover ${item.file.name}`}
            className={`h-7 w-7 rounded-lg flex items-center justify-center disabled:opacity-40 ${
              dark ? 'text-gray-500 hover:bg-gray-800' : 'text-gray-400 hover:bg-slate-200'
            }`}
          >
            <WIcon name="trash-2" className="w-3.5 h-3.5" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  )
}
