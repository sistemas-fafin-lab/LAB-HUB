// Gate da consulta administrativa de dev por CPF (ResultsPage) — espelha
// middlewares/adminAuth.ts da API. Falha fechada por padrão: fora de dev ou
// sem VITE_ADMIN_EMAIL configurado, nada aqui autoriza nada — o campo nem
// aparece, e mesmo que aparecesse a API recusaria de qualquer forma.
//
// `dev` e `adminEmailConfigurado` entram como parâmetros (e não lidos direto
// de `import.meta.env` aqui dentro) para a função ficar testável sem stub de
// ambiente do Vite — quem chama já leu `import.meta.env.DEV`/`VITE_ADMIN_EMAIL`.
export function ehSessaoAdmin(
  sessionEmail: string | null | undefined,
  dev: boolean,
  adminEmailConfigurado: string | undefined,
): boolean {
  const configurado = adminEmailConfigurado?.trim().toLowerCase()
  if (!dev || !configurado) return false
  return (sessionEmail ?? '').trim().toLowerCase() === configurado
}
