# 14 — Verificação em duas etapas no login

**What to build:** Código por WhatsApp/SMS/e-mail após a senha, como no design. Decidir canal (produto) e se usa MFA do Supabase Auth. Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Login atual:** Supabase Auth com senha (`signInWithPassword` em `apps/web/src/pages/LoginPage.tsx`).
  - **Decisão de produto pendente, o canal do código:**
    - **SMS/WhatsApp:** MFA por telefone do Supabase, via Twilio. Exige conta Twilio (e WhatsApp aprovado) configurada no projeto Supabase. Mudança só em `apps/web`, mais a configuração.
    - **App autenticador (TOTP):** MFA nativo do Supabase, sem custo e sem provedor. Foge do design (que mostra código por WhatsApp/SMS/e-mail).
    - **E-mail:** o Supabase não tem fator MFA por e-mail. Exigiria verificação própria em `apps/api` (gerar, guardar e conferir o código), fora do escopo da spec `portal-v2-ui`.
  - Precisa de spec própria antes de virar `ready`, porque mexe em autenticação.
