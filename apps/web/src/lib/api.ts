import { supabase } from './supabase'

// Cliente HTTP da API (apps/api). Anexa o JWT do Supabase em cada request.
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) detail = body.message
    } catch {
      /* corpo não-JSON: mantém o statusText */
    }
    throw new Error(`API ${res.status}: ${detail}`)
  }

  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
  // Signed URL temporária da declaração/laudo (bucket privado).
  declaracao: (resultadoId: string): Promise<{ url: string }> =>
    request<{ url: string }>(`/resultados/${resultadoId}/declaracao`),
}
