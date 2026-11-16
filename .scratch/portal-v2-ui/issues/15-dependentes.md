# 15 — Dependentes e troca de perfil

**What to build:** Titular gerencia dependentes e alterna o perfil (flag `MOSTRAR_DEPENDENTES` hoje). Requer modelo de dados e regras de acesso na API. Fora do escopo de `portal-v2-ui` (ver "Out of Scope" na spec); o visual de referência está no protótipo aprovado.

**Blocked by:** 13 (para nascer já no visual novo)

**Status:** blocked

## Comments

- Triagem (2026-11-04): ficou bloqueada; nada foi implementado.
  - **Depende da 13**, que está `in-review`. Falta o merge no master e a revisão visual.
  - **Fora do escopo da spec:** a spec `portal-v2-ui` proíbe mudanças em `apps/api`, no domínio compartilhado, nas migrations e na autenticação. Esta issue precisa das quatro coisas.
  - **Hoje no web:** o seletor está em `apps/web/src/components/shell/Cabecalho.tsx` com uma lista fixa (`DEPENDENTES`) e o item "Adicionar dependente" sem ação. Tudo fica atrás de `MOSTRAR_DEPENDENTES = false` (`apps/web/src/lib/flags.ts`). Não há backend.
  - **Hoje na API:** `middlewares/auth.ts` tira um único `request.pacienteId` do JWT (D4, contra IDOR). As 8 rotas em `apps/api/src/routes` filtram por ele. A auditoria (`lib/auditoria.ts`) já separa `ator_id` de `titular_id`, o que serve de base para "quem agiu" e "de quem é o dado".
  - **O que a spec própria precisa decidir antes de virar `ready`:**
    - **Modelo:** o dependente é um `paciente` sem login, ligado ao titular por uma tabela de vínculo (titular, dependente, parentesco, desde quando)? Ou é um paciente com conta própria que concede acesso?
    - **Regra de acesso:** o perfil ativo vai num header (`X-Paciente-Id`) que a API confere contra o vínculo a cada requisição, sem confiar no cliente? Ou cada perfil tem rota própria?
    - **LGPD / maioridade:** o que acontece quando o dependente faz 18 anos (o acesso cai sozinho? o dependente assume a conta?). Também: quem consente, e como o pedido de exclusão (`DELETE /pacientes/me`) trata os vínculos.
    - **Cadastro:** "Adicionar dependente" pede quais dados (CPF, certidão, data de nascimento)? Como evita vincular um CPF de terceiro?
    - **LIS:** os resultados e laudos de ApLIS/AOL são buscados por CPF do paciente. Falta confirmar se isso já funciona para o dependente sem nada a mudar.
    - **Mobile:** `apps/mobile` já tem a entrada "Dependentes" no perfil. Falta decidir se entra junto.
  - Precisa de spec própria antes de virar `ready`, porque mexe em modelo de dados, autorização e LGPD.
