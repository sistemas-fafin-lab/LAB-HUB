# 19 — Sair de outros aparelhos

**What to build:** Listar sessões e revogar as demais, sobre o Supabase Auth. Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Hoje no web:** o card "Dispositivos conectados" em `apps/web/src/pages/SettingsPage.tsx` mostra só o aparelho atual, deduzido do navegador (`aparelhoAtual()`), sem backend de sessões. O `signOut` de `apps/web/src/lib/AuthContext.tsx` encerra só a sessão local.
  - **Listar sessões não sai só no web:** o `supabase-js` não tem API de cliente para listar as sessões do usuário. Elas ficam em `auth.sessions` (com `user_agent`, `ip`, `created_at`, `refreshed_at`), que só a service role lê. Isso pede uma rota em `apps/api` (ex.: `GET /pacientes/me/sessoes`), e a spec `portal-v2-ui` proíbe mudanças na API e na autenticação.
  - **Revogar as demais sai só no web:** `supabase.auth.signOut({ scope: 'others' })` revoga os refresh tokens de todas as outras sessões e mantém a atual.
    - Efeito na API: o `authenticate` (`apps/api/src/middlewares/auth.ts`) chama `supabase.auth.getUser(token)`, que consulta o servidor do Auth. O servidor recusa um JWT cujo `session_id` já não existe. Assim, as rotas da API param de aceitar os outros aparelhos na hora (conferir no projeto antes de prometer isso no texto).
    - Ressalva: leituras feitas direto no Supabase com o JWT (PostgREST/Storage, que validam só a assinatura) continuam aceitas até o access token expirar (padrão de 1 h).
  - **O que a spec própria precisa decidir antes de virar `ready`:**
    - **Escopo:** só o botão "Sair dos outros aparelhos" (só web), ou a lista com revogação por aparelho (precisa de API)? Revogar uma sessão específica também exige API (apagar a linha em `auth.sessions` pela service role).
    - **O que a lista mostra:** nome do aparelho a partir do `user_agent`, cidade a partir do IP (precisa de geo-IP; dado pessoal, então LGPD: mostrar só cidade ou omitir), "último acesso" a partir de `refreshed_at`.
    - **Corte imediato vs. até 1 h:** levantar o que o web lê direto do Supabase com o JWT (fora da API) e decidir se a janela do access token é aceitável ali.
    - **Confirmação e auditoria:** diálogo de confirmação; registrar a revogação em `registrarAcesso` (`lib/auditoria.ts`)?
    - **Troca de senha:** revogar as outras sessões automaticamente ao trocar a senha?
    - **Mobile:** se `apps/mobile` entra junto, porque o app também cria sessões.
  - Precisa de spec própria antes de virar `ready`, porque mexe em autenticação.
