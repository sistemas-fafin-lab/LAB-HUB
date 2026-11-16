# 21 — Splash de abertura e telas de transição (entrar, criar conta, sair)

**What to build:** As duas peças de movimento do protótipo que ainda não chegaram à web. As fontes, os keyframes, os tokens de movimento e o `prefers-reduced-motion` já batem com o pacote (conferido em 2026-11-04 contra `docs/prototipo-v2.html`).

1. **Splash de abertura** (`Splash` no shell do protótipo): tela cheia `bg-brand`, com o wordmark branco (`/assets/labhub/labhub-wordmark-white.svg`, 40 px de altura) e o `Node` animado sobre o azul (`loading onBrand`, 40 px). Aparece com `lh-fade`, `role="status"`, `aria-label="Carregando o Lab Hub"` e `lh-noprint`. Substitui o "Carregando…" atual de `App.tsx`, mostrado enquanto `useAuth()` resolve a sessão.
2. **Tela de transição** (`Interstitial`): tela cheia `bg-page`, com o `Node` animado (56 px) e uma frase em `font-display` 22 px seguida de `lh-dot`. Aparece com `lh-fade`, `role="status"`, `aria-live="polite"` e `lh-noprint`. Textos do design:
   - "Preparando seus resultados" ao entrar;
   - "Criando sua conta" ao concluir o cadastro;
   - "Saindo com segurança" ao sair, pelo menu da conta (`Cabecalho`) e pelo Perfil.

**Diferença em relação ao protótipo:** lá as duas telas são só um tempo fixo de espera (splash de 1600 ms, transições de 800 a 1400 ms). Aqui elas **acompanham a chamada real**: aparecem quando a chamada começa e somem quando ela termina, sem atraso artificial além de um mínimo curto para não piscar (sugestão: ~400 ms, a validar com o autor do design). Se a chamada falhar, a tela some e o erro aparece como hoje, junto ao campo ou no aviso. A splash só aparece no carregamento inicial da sessão, nunca ao trocar de tela.

**Blocked by:** None. Pode entrar na `feat/portal-v2` antes do merge final da 13.

**Status:** in-review

- [x] Abrir o app (com ou sem sessão) mostra a splash até a sessão resolver; o "Carregando…" de `App.tsx` sai.
- [x] Entrar, criar conta e sair mostram a tela de transição com o texto do design enquanto a chamada roda; em erro, a tela some e a mensagem da API aparece como hoje.
- [x] Nenhum atraso artificial além do mínimo anti-piscada; o login continua voltando para `next`.
- [x] `prefers-reduced-motion`: as duas telas aparecem sem animação (`lh-fade` e `lh-node-loading` já são desligados em `tema.css`).
- [x] Leitor de tela anuncia a splash e a transição (`role="status"`); foco não fica preso atrás da tela cheia.
- [x] `track('logout')` e os demais eventos do Umami continuam com os mesmos nomes e gatilhos.
- [x] Testes: splash durante `loading` da sessão; transição visível durante login/cadastro/saída e removida em sucesso e em erro (testes de acesso e App-em-URL).
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, `prefers-reduced-motion`, lado a lado com o protótipo.
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design.

## Comments

- Origem (2026-11-04): na comparação com o protótipo, o painel lateral `lhsheet` também não é usado no app, mas no protótipo ele só aparece na página "Estados da interface", que está fora do escopo. Não entra nesta issue.

- Implementado em `feat/portal-v2` (commit "splash de abertura e telas de transição").
  - `lib/transicao.ts`: `comTransicao(texto, operação)` mostra a tela enquanto a chamada roda. O resultado/erro volta na hora; só a saída da tela espera completar 400 ms desde o início (anti-piscada, **a validar com o autor do design**). Em erro rápido, a mensagem já está na tela por baixo e aparece quando a transição sai.
  - `components/sistema/Transicoes.tsx`: `Splash` (no lugar do "Carregando…" do `App.tsx`) e `TelaDeTransicao`, iguais às peças do protótipo; o título da transição ganhou o tracking −2% do `DESIGN.md`.
  - O App monta a transição acima da entrada e do shell (sobrevive à troca que o login/logout provoca) e deixa o resto `inert` enquanto ela cobre a tela.
  - Ligado em: login ("Preparando seus resultados"), cadastro ("Criando sua conta", cobrindo a criação e o login automático ou o pedido de confirmação) e saída ("Saindo com segurança", pelos dois pontos: menu da conta e Perfil, que passam pelo mesmo `handleLogout`).
  - Testes: `App.test` (splash, saída + `inert`) e `AuthGate.test` (login e cadastro, sucesso e erro).
  - Ficou de fora: a splash não tem tempo mínimo — sessão restaurada rápido pode piscar o azul por um instante (conferir na revisão visual). Falha do `signOut` continua sem tratamento (já era assim antes).
  - Falta: conferência manual (larguras, claro/escuro, reduced-motion, lado a lado com o protótipo) e a revisão visual do autor do design.
