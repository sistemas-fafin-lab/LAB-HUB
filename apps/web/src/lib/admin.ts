// Gate da consulta administrativa por CPF (ResultsPage) — espelha
// middlewares/adminAuth.ts da API. Falha fechada por padrão: fora de dev sem o
// disjuntor ligado, ou sem VITE_ADMIN_EMAIL configurado, nada aqui autoriza
// nada — o campo nem aparece, e mesmo que aparecesse a API recusaria de
// qualquer forma.
//
// Em dev o comportamento não muda (checagem de e-mail, sem exigir disjuntor).
// Fora de dev (build de produção), o disjuntor `VITE_ADMIN_RESULTS_ENABLED`
// precisa estar ligado — comparação já feita por quem chama, ver abaixo.
//
// `dev`, `adminEmailConfigurado` e `disjuntorLigado` entram como parâmetros (e
// não lidos direto de `import.meta.env` aqui dentro) para a função ficar
// testável sem stub de ambiente do Vite — quem chama já leu
// `import.meta.env.DEV`/`VITE_ADMIN_EMAIL`/`VITE_ADMIN_RESULTS_ENABLED === 'true'`.
export function ehSessaoAdmin(
  sessionEmail: string | null | undefined,
  dev: boolean,
  adminEmailConfigurado: string | undefined,
  disjuntorLigado: boolean,
): boolean {
  const configurado = adminEmailConfigurado?.trim().toLowerCase()
  if ((!dev && !disjuntorLigado) || !configurado) return false
  return (sessionEmail ?? '').trim().toLowerCase() === configurado
}
