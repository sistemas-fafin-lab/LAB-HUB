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

// Já conferidas acima; com tipo string para os clientes criados depois.
const URL_SUPABASE: string = url
const CHAVE_SUPABASE: string = chave

// "Manter conectado" (login): marcado, a sessão fica no localStorage e
// sobrevive a fechar o navegador; desmarcado, fica no sessionStorage e acaba
// com a aba. A escolha é gravada antes do login; sair limpa os dois.
const CHAVE_MANTER_CONECTADO = 'lh:manter-conectado'

function manterConectado(): boolean {
  try {
    return localStorage.getItem(CHAVE_MANTER_CONECTADO) !== '0'
  } catch {
    return true
  }
}

export function salvarManterConectado(manter: boolean): void {
  try {
    localStorage.setItem(CHAVE_MANTER_CONECTADO, manter ? '1' : '0')
  } catch {
    // Sem armazenamento: vale o padrão (manter).
  }
}

const armazem = (): Storage => (manterConectado() ? localStorage : sessionStorage)

export const armazenamentoDaSessao = {
  getItem(chave: string): string | null {
    try {
      return armazem().getItem(chave)
    } catch {
      return null
    }
  },
  setItem(chave: string, valor: string): void {
    try {
      armazem().setItem(chave, valor)
    } catch {
      // Cota ou aba anônima: a sessão vale só enquanto a página estiver aberta.
    }
  },
  removeItem(chave: string): void {
    for (const s of [() => localStorage, () => sessionStorage]) {
      try {
        s().removeItem(chave)
      } catch {
        // idem
      }
    }
  },
}

// Cliente do browser: chave pública (respeita RLS) e sessão persistida.
export const supabase = createClient(url, chave, {
  auth: {
    storage: armazenamentoDaSessao,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Confere a senha atual sem mexer na sessão aberta: entra num cliente à parte
 * (sem guardar sessão) e encerra essa entrada logo em seguida. Entrar pelo
 * cliente principal trocaria a sessão do portal por uma nova — que, com a
 * verificação em duas etapas, ainda não teria passado pelo código.
 */
export async function conferirSenha(email: string, senha: string): Promise<boolean> {
  const avulso = createClient(URL_SUPABASE, CHAVE_SUPABASE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lh-conferir-senha' },
  })
  const { error } = await avulso.auth.signInWithPassword({ email, password: senha })
  if (error) return false
  await avulso.auth.signOut({ scope: 'local' })
  return true
}
