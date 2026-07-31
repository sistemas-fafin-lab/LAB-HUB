import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL

// Aceita o nome novo e o legado, para a troca da chave em produção não depender
// de um deploy e um ajuste de ambiente acontecerem no mesmo instante. A chave
// `sb_publishable_…` é revogável isoladamente; a `anon` legada é um JWT que só
// se revoga rotacionando o segredo do projeto inteiro (auditoria § S-10).
// As duas mapeiam para o mesmo role `anon` — o comportamento não muda.
const chave =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chave) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) são obrigatórios — confira apps/web/.env',
  )
}

// Cliente do browser: chave pública (respeita RLS) e sessão persistida.
export const supabase = createClient(url, chave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
