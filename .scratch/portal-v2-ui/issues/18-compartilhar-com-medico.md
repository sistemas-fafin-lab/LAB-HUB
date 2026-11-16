# 18 — Compartilhar resultado com o médico

**What to build:** Link público de leitura (`/c/:token`) e envio ao médico (flag `MOSTRAR_ENVIAR_AO_MEDICO` hoje). Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Fora do escopo da spec:** a spec `portal-v2-ui` proíbe mudanças em `apps/api`, no domínio compartilhado, nas migrations e na autenticação. Um link público precisa das quatro: tabela de tokens, rota sem login, tipo compartilhado e uma exceção ao `authenticate`.
  - **Hoje no web:**
    - O botão "Enviar ao médico" em `apps/web/src/pages/LaudoPage.tsx` não tem `onClick` e fica atrás de `MOSTRAR_ENVIAR_AO_MEDICO = false` (`apps/web/src/lib/flags.ts`).
    - Entradas irmãs, também mockup: o card "Compartilhar com médico" (dado fixo "Dr. Carlos Silva") em `HomePage.tsx`, atrás de `MOSTRAR_PROXIMOS_PASSOS_EXTRAS`; o toggle "Compartilhar com médicos" em `SettingsPage.tsx`, atrás de `MOSTRAR_PRIVACIDADE_EXTRAS`. A frase de marketing foi tirada de `MolduraAcesso.tsx` por causa desta issue.
    - Não existe rota `/c/:token` no router.
  - **Hoje na API:**
    - `GET /laudos/:id` exige `authenticate` e filtra por `paciente_id` junto com o id (contra IDOR). O laudo fica cifrado em `exam_results.result_enc` e a folha A4 é montada **no navegador** (`components/laudo/`). Não existe um PDF do servidor que dê para entregar por URL assinada. A exceção é o `declaracaoUrl` do FlowLab ("Laudo original"), que fica no bucket `laudos`.
    - A auditoria (`registrarAcesso`, `lib/auditoria.ts`) supõe um ator autenticado. Um acesso anônimo por token pede outro `atorTipo`.
  - **Por que não sai só no web:** o link público é, por definição, uma leitura sem a sessão do paciente. Fazer isso no cliente (dados na URL, PDF gerado e mandado por e-mail/WhatsApp pelo navegador) vaza dado de saúde sem prazo nem revogação, e sem trilha de auditoria. O "Exportar PDF" que já existe cobre o caso manual: o paciente baixa e manda por conta própria.
  - **O que a spec própria precisa decidir antes de virar `ready`:**
    - **Escopo do link:** um exame, uma requisição ou vários laudos? Fica congelado no momento do compartilhamento ou acompanha retificações?
    - **Token:** aleatório e opaco (guardar só o hash), com validade (24 h? 7 dias?), revogável pelo paciente, limite de acessos? Também: rate limit na rota pública contra enumeração.
    - **Segundo fator para o médico:** basta o link? Ou pede algo a mais (código, data de nascimento do paciente, CRM)? Isso também decide se a lista "médicos cadastrados" do toggle de Settings existe.
    - **O que a página mostra:** a mesma folha A4, montada com os dados que a rota pública devolve? Com marca d'água "cópia compartilhada", validade e sem nenhum outro dado do paciente (LGPD: o mínimo necessário).
    - **Envio:** "Enviar ao médico" só gera e copia o link (ou abre o compartilhamento nativo)? Ou a API manda e-mail? Nesse caso falta cadastro do destinatário e provedor de e-mail.
    - **Consentimento e auditoria:** registrar quem gerou, quando e para quem; registrar cada abertura do link (IP/UA?). Também: o paciente vê o histórico de acessos e o que acontece com os links no `DELETE /pacientes/me` e no expurgo (`scripts/expurgo.ts`).
    - **Mobile:** se `apps/mobile` entra junto.
  - Precisa de spec própria antes de virar `ready`, porque abre um caminho de leitura de dado de saúde sem login.
