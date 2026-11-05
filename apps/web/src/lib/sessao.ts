// ---------------------------------------------------------------------------
// Sessão expirada — o cliente `api` avisa, o shell escuta.
//
// Fica num módulo próprio (e não dentro de api.ts) para o shell e os testes
// poderem escutar/disparar o aviso sem depender do cliente HTTP real. Só o
// shell autenticado se inscreve: um 401 nas telas de entrada não abre caixa.
// ---------------------------------------------------------------------------

type Ouvinte = () => void

const ouvintes = new Set<Ouvinte>()

/** Chamado pelo cliente `api` quando uma resposta volta 401. */
export function avisaSessaoExpirada(): void {
  for (const ouvinte of ouvintes) ouvinte()
}

/** Inscreve `ouvinte`; devolve a função que cancela a inscrição. */
export function aoExpirarSessao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}
