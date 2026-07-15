import type { DocumentoUrl } from '@lab-hub/shared'
import { supabase } from './supabase'

// Cliente HTTP da API (apps/api). Anexa o JWT do Supabase em cada request.
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

// Resposta não-2xx. O status fica num campo PRÓPRIO em vez de embutido na
// mensagem: as telas mostram `error.message` cru, então concatenar virava
// "API 413: Arquivo maior que 10 MB" na cara do paciente. Quem precisa ramificar
// por status lê `.status`.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Só para respostas sem `message` no corpo (ex.: 502 com HTML do proxy): o
// res.statusText é inglês e cru ("Payload Too Large"), impróprio p/ a tela.
function mensagemPadrao(status: number): string {
  if (status === 401 || status === 403) return 'Sua sessão expirou. Entre novamente.'
  if (status === 404) return 'Não encontramos o que você pediu.'
  if (status === 429) return 'Muitas tentativas seguidas. Espere um instante e tente de novo.'
  if (status >= 500) return 'O servidor falhou. Tente de novo em instantes.'
  return 'Não foi possível concluir a operação.'
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData define o próprio Content-Type COM o boundary. Fixar
  // 'application/json' aqui (como fazíamos p/ todo request) apagaria o boundary e
  // o parser multipart da API rejeitaria com "Boundary not found".
  const isForm = init?.body instanceof FormData
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) detail = body.message
    } catch {
      /* corpo não-JSON: cai no texto padrão do status */
    }
    throw new ApiError(res.status, detail || mensagemPadrao(res.status))
  }

  // 204 não tem corpo (ex.: DELETE /documentos/:id) — res.json() lançaria
  // SyntaxError. Ninguém tinha esbarrado nisso: api.del existia mas nunca fora usado.
  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
  // Upload multipart (POST /documentos). O Content-Type sai do próprio FormData.
  upload: <T>(path: string, form: FormData): Promise<T> =>
    request<T>(path, { method: 'POST', body: form }),
  // Signed URL temporária da declaração/laudo (bucket privado).
  declaracao: (resultadoId: string): Promise<{ url: string }> =>
    request<{ url: string }>(`/resultados/${resultadoId}/declaracao`),
  // Signed URL temporária de um documento do paciente (bucket privado).
  documentoUrl: (id: string, download = false): Promise<DocumentoUrl> =>
    request<DocumentoUrl>(`/documentos/${id}/url${download ? '?download=true' : ''}`),
}
