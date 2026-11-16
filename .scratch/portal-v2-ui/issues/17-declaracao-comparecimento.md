# 17 — Declaração de comparecimento por coleta

**What to build:** Tela e PDF de declaração por coleta (`/declaracao/:coletaId` no design). Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Fora do escopo da spec:** a spec `portal-v2-ui` proíbe mudanças em `apps/api`, no domínio compartilhado e nas migrations. Uma declaração com valor legal precisa das três.
  - **O que existe hoje (não é esta issue):** a declaração **por resultado**. É um PDF que o FlowLab manda pronto (`declaracaoUrl` em `POST /webhooks`, guardado em `resultados.declaracao_url` no bucket `laudos`). O web abre esse PDF por `GET /resultados/:id/declaracao` (`apps/web/src/lib/declaracao.ts`), com auditoria `resultado.declaracao`. O pedido 42 da spec ("baixar a declaração do exame como hoje") já está atendido.
  - **Por que não sai só no web:**
    - **Faltam dados:** o `Agendamento` (`packages/shared`) tem só `dataHora` (o horário **marcado**) e `status`. Não guarda hora de chegada (check-in, `em_coleta`) nem de saída (`realizado`). O webhook `/webhooks/coletas` muda o status sem gravar quando isso aconteceu. Usar `dataHora` declararia um horário que pode não ter acontecido.
    - **Falta autenticidade:** um PDF montado no navegador com dados do cliente pode ser editado e não dá para conferir. Para valer para empregador ou escola, precisa sair do servidor (ou do FlowLab), com identificação do laboratório (razão social, CNPJ, responsável técnico) e algo verificável (código/QR de validação), além de trilha de auditoria.
  - **O que a spec própria precisa decidir antes de virar `ready`:**
    - **Quem emite:** o FlowLab já gera a declaração de comparecimento e manda por webhook, como faz por resultado? Ou a API gera (template, assinatura)?
    - **Dados:** gravar `check_in_em` e `concluido_em` em `agendamentos` a partir de `/webhooks/coletas` (migration + mapper + tipo compartilhado).
    - **Regra:** a partir de qual status pode emitir (`em_coleta`? só `realizado`?). E o que fazer com `bloqueado` e `cancelado`.
    - **Validação:** existe uma página pública para conferir o código? Se sim, que dados ela mostra (LGPD: o mínimo possível, sem exames).
    - **Conteúdo:** campos obrigatórios (nome, CPF mascarado ou completo, horário, unidade, acompanhante?) e se cita os exames (dado sensível; o protótipo não deve ser a fonte disso).
    - **Mobile:** se `apps/mobile` entra junto.
  - Precisa de spec própria antes de virar `ready`, porque mexe em API, modelo de dados e num documento com valor legal.
