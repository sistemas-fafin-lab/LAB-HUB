# 20 — Webhook de status do agendamento para a linha do tempo

**What to build:** FlowLab notifica check-in, coleta, análise, recoleta e cancelamento para o nó refletir a etapa real. Alinhar contrato com o time FlowLab (proposta no `docs/API.md` do pacote). Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Parte já existe na API:** `POST /webhooks/coletas` (`apps/api/src/routes/webhooks.ts`, com HMAC e schema em `apps/api/src/schemas/coletaStatus.ts`) recebe do FlowLab `em_coleta` (check-in), `coletado` (→ `realizado`, com o snapshot dos exames) e `bloqueado`.
    - Tem guardas de idempotência e de ordem: não revive um `cancelado` e não regride um `realizado`.
    - Check-in e coleta já mudam a etapa do nó hoje: `situacaoDaColeta` em `apps/web/src/lib/coletas.ts` leva `em_coleta` à etapa Coleta e `realizado` à Análise.
  - **O que falta:**
    - **Análise / liberação:** nenhum status do `AgendamentoStatus` (`packages/shared/src/index.ts`) passa da etapa 4. `coletas.ts` diz isso: "o portal não recebe o aviso de liberação". Para chegar à etapa 5, é preciso um status novo (ex.: `em_analise`/`liberado`) ou que a etapa venha do resultado/laudo.
    - **Recoleta:** não existe no domínio. O teste `SchedulePage.test.tsx` garante que o portal não fala em recoleta. Pede um status ou evento novo e a decisão de como o nó o mostra (alerta na Coleta? volta de etapa?).
    - **Cancelamento pelo FlowLab:** hoje só o paciente cancela (`agendamentos.ts`). O schema do webhook não aceita `cancelado`.
  - **Bate com o Out of Scope da spec:** tudo isso muda `apps/api`, o domínio compartilhado (`AgendamentoStatus`) e provavelmente uma migration (enum/check do `status`), e a spec `portal-v2-ui` proíbe essas três mudanças. No web, o trabalho é pequeno: mapear os status novos em `SITUACAO` e nos `TITULO`/descrições da `ColetaTimeline`.
  - **O que a spec própria precisa decidir antes de virar `ready`:**
    - **Contrato com o time FlowLab:** estender o `POST /webhooks/coletas` (novos valores no enum `status`) ou criar outro evento? Partir da proposta do `docs/API.md` do pacote "lab-hub-v2" (não está no repo; trazer o arquivo).
    - **Vocabulário:** os nomes dos status novos no LAB-HUB e as transições permitidas (ex.: recoleta depois de `realizado`, que hoje a guarda impede).
    - **Liberação:** é status do agendamento ou do resultado? O resultado já tem o próprio fluxo (`resultados.ts`).
    - **Cancelamento externo:** com que texto o paciente fica sabendo, e se ele recebe aviso (push/WhatsApp).
