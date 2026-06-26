import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env.js'

// Cliente Supabase com service role — uso server-side apenas.
// Ignora RLS; nunca expor esta chave no frontend.
export const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
)
