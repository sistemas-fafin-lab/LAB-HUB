import { useState } from 'react'
import type { TipoDocumento } from '@lab-hub/shared'
import { Btn, IconBtn, IconTile, Modal, Node, Pill, SelectField } from '../portal'
import { AreaDeArquivos } from './AreaDeArquivos'
import { ConfirmFileModal } from './ConfirmFileModal'
import { MensagemDeErro } from './MensagemDeErro'
import { track } from '../../lib/analytics'
import { avisar } from '../../lib/avisos'
import { DOC_META, formatarTamanho, validarArquivo } from '../../lib/documentos'

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
}

// Envio em lote: o paciente junta os arquivos, ajusta o tipo de cada um e manda
// tudo de uma vez. O upload só dispara no "Enviar" — adicionar à fila é local e
// reversível, então dá p/ corrigir o tipo antes de gastar a rede.
export function UploadDocumentsModal({ tipos, onEnviar, onFechar }: UploadDocumentsModalProps) {
  const [itens, setItens] = useState<ItemFila[]>([])
  const [enviando, setEnviando] = useState(false)
  // Arquivos escolhidos aguardando confirmação — só entram na fila após o "Adicionar".
  const [arquivosPendentes, setArquivosPendentes] = useState<File[] | null>(null)

  const atualizar = (id: string, muda: (i: ItemFila) => ItemFila) =>
    setItens((prev) => prev.map((i) => (i.id === id ? muda(i) : i)))

  // Chamado só após a confirmação — a escolha em si (AreaDeArquivos) apenas abre a confirmação.
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

  const confirmarAdicao = () => {
    if (!arquivosPendentes) return
    adicionar(arquivosPendentes)
    setArquivosPendentes(null)
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
    if (sucessos === fila.length && !temRecusado) {
      avisar(sucessos === 1 ? { title: 'Documento enviado', message: fila[0]?.file.name ?? '' } : { title: `${sucessos} documentos enviados` })
      onFechar()
    }
  }

  const pendentes = itens.filter((i) => i.status === 'pendente').length
  const enviados = itens.filter((i) => i.status === 'enviado').length

  return (
    <>
      <Modal
        open
        title="Enviar documentos"
        description="Adicione seus arquivos, confira o tipo de cada um e envie."
        width={560}
        // Durante o envio nada fecha a caixa: nem o X, nem Esc, nem o fundo.
        {...(enviando ? {} : { onClose: onFechar })}
        footer={
          <>
            <Btn variant="secondary" disabled={enviando} onClick={onFechar}>
              {enviados > 0 && pendentes === 0 ? 'Fechar' : 'Cancelar'}
            </Btn>
            <Btn icon="upload" loading={enviando} disabled={pendentes === 0} onClick={() => void enviarTudo()}>
              {enviando ? 'Enviando…' : `Enviar${pendentes > 0 ? ` (${pendentes})` : ''}`}
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-3 min-w-0">
          <AreaDeArquivos onSelect={setArquivosPendentes} multiple disabled={enviando} hint="JPG, PNG, WEBP ou PDF · até 10 MB por arquivo" />

          {/* Só a fila rola: com muitos arquivos, "Enviar" continua à vista. */}
          {itens.length > 0 && (
            <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto">
              {itens.map((item) => (
                <FilaLinha
                  key={item.id}
                  item={item}
                  tipos={tipos}
                  travado={enviando}
                  onTipo={(tipo) => atualizar(item.id, (i) => ({ ...i, tipo }))}
                  onRemover={() => setItens((prev) => prev.filter((i) => i.id !== item.id))}
                />
              ))}
            </div>
          )}

          {enviados > 0 && (
            <p role="status" className="text-[13px] font-semibold">
              {enviados} enviado{enviados > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </Modal>

      {arquivosPendentes && (
        <ConfirmFileModal files={arquivosPendentes} onConfirm={confirmarAdicao} onCancel={() => setArquivosPendentes(null)} />
      )}
    </>
  )
}

interface FilaLinhaProps {
  item: ItemFila
  tipos: TipoDocumento[]
  /** Enquanto o lote sobe, tipo e remoção ficam congelados. */
  travado: boolean
  onTipo: (tipo: TipoDocumento) => void
  onRemover: () => void
}

function FilaLinha({ item, tipos, travado, onTipo, onRemover }: FilaLinhaProps) {
  const meta = DOC_META[item.tipo]
  const concluido = item.status === 'enviado'
  const recusado = item.status === 'erro'
  const nome = item.file.name

  return (
    <div className={'rounded-[12px] p-3 flex items-start gap-3 ' + (recusado ? 'bg-coral-soft' : 'border border-line')}>
      <IconTile name={recusado ? 'alert-circle' : meta.icon} tone={recusado ? 'card' : 'subtle'} />

      <div className="flex-1 min-w-0">
        {/* Só o nome encolhe: o tamanho fica legível mesmo com um nome quilométrico. */}
        <div className="flex items-baseline gap-2 min-h-[36px]">
          <span className="text-[14px] font-semibold truncate" title={nome}>
            {nome}
          </span>
          <span className="text-[12px] text-muted shrink-0 tabular-nums">{formatarTamanho(item.file.size)}</span>
        </div>

        {concluido ? (
          <Pill tone="brand" icon="check">
            Enviado como {meta.label}
          </Pill>
        ) : recusado ? null : (
          // Linha recusada aqui no browser não ganha seletor: ela nunca vai subir,
          // só sair. Já uma 'pendente' com erro é retentável e mantém o seletor.
          <SelectField
            ariaLabel={`Tipo de ${nome}`}
            value={item.tipo}
            disabled={travado}
            options={tipos.map((t) => ({ value: t, label: DOC_META[t].label }))}
            onChange={(v) => onTipo(v as TipoDocumento)}
          />
        )}

        {item.erro && (
          <div className="mt-1.5">
            <MensagemDeErro>{item.erro}</MensagemDeErro>
          </div>
        )}
      </div>

      {/* Caixa de largura fixa: o nome não re-trunca ao passar de lixeira para enviando. */}
      <div className="w-9 h-9 flex items-center justify-center shrink-0">
        {item.status === 'enviando' ? (
          <span role="status" aria-label={`Enviando ${nome}`} className="inline-flex">
            <Node loading size={20} />
          </span>
        ) : concluido ? null : (
          <IconBtn icon="trash-2" label={`Remover ${nome}`} disabled={travado} onClick={onRemover} />
        )}
      </div>
    </div>
  )
}
