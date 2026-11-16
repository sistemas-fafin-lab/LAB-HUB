# 16 — Cartões e troca de plano no Faturamento

**What to build:** Requer gateway com tokenização (número do cartão nunca chega à API) e definição de planos. Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Fora do escopo da spec:** a spec `portal-v2-ui` proíbe mudanças em `apps/api`, no domínio compartilhado e nas migrations. Cartões e planos precisam das três coisas, e de um gateway de pagamento.
  - **Hoje no web:** `apps/web/src/pages/BillingPage.tsx` é conteúdo estático: plano "Lab Hub Care" fixo (`PlanoAtual`), cartões fixos (`CARTOES`) e cobranças fixas (`COBRANCAS`). Não há ações de trocar plano, adicionar cartão ou tornar principal. A rota fica oculta por `MOSTRAR_FATURAMENTO = false` (`apps/web/src/lib/flags.ts`).
  - **Hoje na API:** não há nada de cobrança, cartão ou assinatura. O único "plano" que existe é `convenio_plano` do paciente (convênio de saúde, `routes/pacientes.ts`), que não tem relação com o plano de assinatura do design.
  - **O que a spec própria precisa decidir antes de virar `ready`:**
    - **Gateway:** qual (Stripe, Pagar.me, Asaas, Mercado Pago…)? Ele precisa tokenizar no navegador (SDK/iframe do gateway), para que o número do cartão nunca passe pela API (PCI SAQ A).
    - **Planos:** quais existem, preço, o que cada um inclui, se a cobrança é recorrente e quem cadastra (gateway ou tabela própria).
    - **Modelo:** tabelas de cliente no gateway, assinatura e forma de pagamento (só id do token, bandeira, final e validade), com RLS por paciente.
    - **Troca de plano:** se tem proração, quando vale (na hora ou no próximo ciclo), como cancelar, e o que acontece se o pagamento falhar.
    - **Webhooks:** o gateway avisa a API sobre pagamento, falha e estorno. Isso também alimenta o histórico de cobranças, hoje fixo.
    - **Fiscal:** NFS-e por cobrança (o "baixar NFS-e" da tela também está sem issue).
  - Precisa de spec própria antes de virar `ready`, porque mexe em pagamento, modelo de dados e API.
