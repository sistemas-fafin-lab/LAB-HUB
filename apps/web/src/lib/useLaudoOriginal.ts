import { useCallback, useState } from 'react'
import type { LaudosOriginais } from '@lab-hub/shared'
import { api } from './api'
import { track } from './analytics'
import { baixarArquivo } from './baixarArquivo'

type Arquivo = LaudosOriginais['arquivos'][number]

export interface LaudoOriginal {
  /** Buscando a lista ou o arquivo: a ação fica bloqueada. */
  carregando: boolean
  /**
   * Por que a última tentativa não entregou o arquivo, já como texto para a
   * tela; `null` = sem falha. São só dois casos: a requisição não tem laudo
   * original anexado (tentar de novo não muda nada) e todo o resto, que para o
   * paciente é "indisponível no momento".
   */
  falha: string | null
  /** Mais de um PDF na requisição: o paciente escolhe. `null` = nada a escolher. */
  opcoes: Array<{ id: string; rotulo: string }> | null
  iniciar: () => void
  escolher: (id: string) => void
  fecharOpcoes: () => void
}

const INDISPONIVEL = 'O laudo original está indisponível no momento. Tente novamente mais tarde.'
const SEM_ARQUIVO = 'Este laudo não tem o documento original do laboratório.'

const rotuloDe = (arquivo: Arquivo, posicao: number): string =>
  `Laudo ${posicao}${arquivo.retificacao ? ' (retificação)' : ''}`

/**
 * "Baixar laudo original": o PDF do laboratório de apoio anexado à requisição.
 *
 * A API busca o arquivo ao vivo no laboratório, então qualquer falha tem a
 * mesma cara para o paciente — indisponível no momento —, sem o motivo técnico.
 * O arquivo não fica guardado: vai da resposta direto para o download.
 */
export function useLaudoOriginal(requisicao: string | undefined): LaudoOriginal {
  const [carregando, setCarregando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null)

  // `posicao` só entra no nome quando há mais de um, para os arquivos não se
  // sobrescreverem na pasta de downloads.
  const baixar = useCallback(
    async (codigo: string, id: string, posicao?: number) => {
      const pdf = await api.laudoOriginalPdf(codigo, id)
      baixarArquivo(`laudo-original-${codigo}${posicao ? `-${posicao}` : ''}.pdf`, pdf, 'application/pdf')
    },
    [],
  )

  const tentar = useCallback(async (operacao: () => Promise<void>) => {
    setCarregando(true)
    setFalha(null)
    try {
      await operacao()
    } catch {
      setFalha(INDISPONIVEL)
    } finally {
      setCarregando(false)
    }
  }, [])

  const iniciar = useCallback(() => {
    if (!requisicao || carregando) return
    track('laudo_download', { origem: 'laudo_original_lis' })
    void tentar(async () => {
      const { arquivos: achados } = await api.laudosOriginais(requisicao)
      const [unico] = achados
      if (!unico) setFalha(SEM_ARQUIVO)
      else if (achados.length === 1) await baixar(requisicao, unico.id)
      else setArquivos(achados)
    })
  }, [requisicao, carregando, tentar, baixar])

  const escolher = useCallback(
    (id: string) => {
      if (!requisicao || carregando || !arquivos) return
      const posicao = arquivos.findIndex((a) => a.id === id) + 1
      void tentar(async () => {
        try {
          await baixar(requisicao, id, posicao)
        } finally {
          setArquivos(null)
        }
      })
    },
    [requisicao, carregando, arquivos, tentar, baixar],
  )

  return {
    carregando,
    falha,
    opcoes: arquivos?.map((a, i) => ({ id: a.id, rotulo: rotuloDe(a, i + 1) })) ?? null,
    iniciar,
    escolher,
    fecharOpcoes: () => setArquivos(null),
  }
}
