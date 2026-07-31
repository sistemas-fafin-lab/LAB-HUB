import { createClient } from '@supabase/supabase-js'
import { chaveSupabase, requireEnv } from './env.js'

// Cliente Supabase com a chave secreta — uso server-side apenas.
// Ignora RLS; nunca expor esta chave no frontend.
//
// `SUPABASE_SECRET_KEY` (sb_secret_…) é a forma revogável; o
// `SUPABASE_SERVICE_ROLE_KEY` legado continua aceito só enquanto a migração do
// S-10 não termina em produção — ver `chaveSupabase`.
export const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  chaveSupabase('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
)
