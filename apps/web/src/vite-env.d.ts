/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_UMAMI_TRACKER_SRC?: string
  readonly VITE_UMAMI_WEBSITE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Tracker do Umami, injetado em runtime por lib/analytics.ts. Opcional: sem as
// envs configuradas o script nunca carrega e `window.umami` fica undefined.

/** Payload padrão que o tracker monta a cada hit (função `R()` do script). */
interface UmamiPayload {
  website: string
  hostname: string
  screen: string
  language: string
  title: string
  url: string
  referrer: string
}

/** O retorno da forma de função vai direto para o POST — com `name`, é evento. */
interface UmamiEventPayload extends UmamiPayload {
  name?: string
  data?: Record<string, unknown>
}

interface UmamiTracker {
  /**
   * Pageview (sem `name`) ou evento (com `name`). Só a forma de FUNÇÃO recebe o
   * payload padrão para mesclar — a forma de objeto (`track({ url })`) substitui
   * o payload inteiro e o hit sai sem `website`, sendo descartado pelo servidor.
   * Ver lib/analytics.ts.
   */
  track(build: (payload: UmamiPayload) => UmamiEventPayload): void
  /** Evento nomeado, com propriedades opcionais. */
  track(event: string, data?: Record<string, unknown>): void
}

interface Window {
  umami?: UmamiTracker
}
