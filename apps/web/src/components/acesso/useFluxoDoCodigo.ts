import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { avisar } from '../../lib/avisos'
import { doisFatores, mascararEmail } from '../../lib/doisFatores'
import type { FinalidadeDoCodigo } from '../../lib/doisFatores'

const DIGITE_OS_6 = 'Digite os 6 dígitos do código.'

/**
 * Estado do código de uma tela: envio ao abrir (ou só a contagem, se já houve
 * envio há menos de um minuto), reenvio, e a validação antes de conferir.
 */
export function useFluxoDoCodigo(finalidade: FinalidadeDoCodigo, email: string | null, enviadoAntes: string | null = null) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviadoEm, setEnviadoEm] = useState<number | null>(enviadoAntes ? Date.parse(enviadoAntes) : null)
  const enviouAoAbrir = useRef(false)

  const enviar = useCallback(
    async (reenvio: boolean) => {
      try {
        const r = await doisFatores.enviar(finalidade)
        setEnviadoEm(Date.parse(r.enviadoEm))
        if (reenvio && email) avisar({ title: 'Código reenviado', message: mascararEmail(email) })
      } catch (e: unknown) {
        // 429: já houve envio há menos de um minuto; a contagem segue.
        if (e instanceof ApiError && e.status === 429) {
          setEnviadoEm((t) => t ?? Date.now())
          return
        }
        setErro(e instanceof Error ? e.message : 'Não foi possível enviar o código.')
      }
    },
    [finalidade, email],
  )

  useEffect(() => {
    if (enviouAoAbrir.current) return
    enviouAoAbrir.current = true
    const recente = enviadoAntes !== null && Date.now() - Date.parse(enviadoAntes) < 60_000
    if (!recente) void enviar(false)
  }, [enviar, enviadoAntes])

  /** Confere o formato; devolve o código pronto ou null (com o erro na tela). */
  const codigoPronto = (): string | null => {
    if (!/^\d{6}$/.test(codigo)) {
      setErro(DIGITE_OS_6)
      return null
    }
    setErro(null)
    return codigo
  }

  /** Recusa da API: mostra a mensagem dela e limpa os campos. */
  const recusado = (e: unknown) => {
    setErro(e instanceof Error ? e.message : 'Código inválido ou expirado. Confira a mensagem ou peça um novo código.')
    setCodigo('')
  }

  return {
    codigo,
    setCodigo: (v: string) => {
      setCodigo(v)
      if (erro) setErro(null)
    },
    erro,
    enviadoEm,
    reenviar: () => void enviar(true),
    codigoPronto,
    recusado,
  }
}
