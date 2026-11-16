# 03 — Rotas por URL

**What to build:** Substituir a navegação por `useState<AppRoute>` por um router pequeno sobre a History API: rotas com parâmetro (`/exame/:id`, `/laudo/:id`, `/coleta/:id`) e query string, interceptação de links internos, navegação programática. Sem sessão, qualquer rota vai para `/entrar?next=<rota>` e o login volta para `next` (só caminhos internos). `trackPageview` passa a disparar por URL. Garantir fallback de SPA em produção (Vercel). As telas continuam no visual antigo.

Cria o ponto de teste novo da spec: o `App` montado numa URL inicial, com `AuthContext` e hooks dublados.

**Blocked by:** 01 (infraestrutura de estilos)

**Status:** done

- [x] Cada tela atual abre pela própria URL e sobrevive a recarregar a página.
- [x] Voltar/avançar do navegador funciona entre telas.
- [x] Sem sessão → `/entrar?next=…`; após login volta à rota; `next` externo (`https://…`, `//…`) é ignorado.
- [x] Rota desconhecida mostra 404 (pode ser provisória, no visual antigo).
- [x] `trackPageview` dispara uma vez por mudança de URL, com os mesmos nomes de evento.
- [x] Teste de App-em-URL cobre: rota → tela, parâmetros, voltar/avançar, redirect com `next`, rejeição de `next` externo, 404, pageview.
- [x] Fallback de SPA conferido/configurado para o deploy da web.
- [x] `vitest`, `type-check`, `lint` e `build` verdes.

## Comments

- Implementado em `feat/portal-v2`. Router em `apps/web/src/lib/router.ts`, tabela de rotas em `lib/rotas.ts`, teste App-em-URL em `src/App.test.tsx`, fallback de SPA em `apps/web/vercel.json` (a raiz do projeto na Vercel é `apps/web/`; antes, `/resultados` dava 404 em produção).
- Limitação conhecida: o id do laudo dos LIS é um `randomUUID` gerado a cada mapeamento na API. `/exame/:id` e `/laudo/:id` deixam de resolver quando o cache da API é renovado, e aí a tela mostra "Exame não encontrado" com volta para Resultados. Corrigir isso exige um id estável na API, que está fora do escopo desta spec.
- Exame aberto pela consulta admin por CPF só vale na memória da aba: ao recarregar, não é encontrado (de propósito: dado de outro paciente não persiste). `/laudo/:id` de exame admin redireciona ao detalhe.
- O teste do App também dubla `lib/analytics` (para afirmar o `trackPageview`), além de `AuthContext`, hooks e `api`.
