# 04 — Shell no visual novo

**What to build:** Cabeçalho, navegação, gaveta abaixo de 1024 px, busca (Ctrl/⌘ K), suporte/chatbot, toasts, barra de progresso de troca de página, faixa "sem conexão" e caixa "sessão expirada" (disparada por 401 no cliente `api`), no visual do pacote, substituindo `Topbar`, `Sidebar` e `SupportDock`. Nome e iniciais vêm de `usePaciente`. Todas as flags que esses componentes respeitam hoje (notificações, dependentes, chatbot…) continuam valendo. A busca mantém o comportamento atual da `TopbarSearch`.

**Blocked by:** 02 (tokens e DS), 03 (rotas por URL)

**Status:** in-review

- [x] Shell novo em todas as rotas autenticadas; telas internas ainda no visual antigo funcionam dentro dele.
- [x] Flags de `Topbar`/`SupportDock` respeitadas (ligadas e desligadas).
- [x] 401 em qualquer chamada mostra a caixa de sessão expirada e leva ao login com `next`.
- [x] Offline mostra a faixa; voltar online a esconde.
- [x] Teste de App-em-URL estendido para sessão expirada e navegação pelo menu; teste do `Topbar` substituído pelo equivalente do shell.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- (da issue 02) As regras base do portal v2 (fundo `--lh-page`, DM Sans, links, `::selection`, foco visível, ajustes de escuro dos controles do DS) e a Ranade em `font-display` só valem dentro de um elemento com a classe **`lh-v2`** (ver `docs/DESIGN.md`, "Convivência"). O shell novo precisa montar essa raiz em volta das telas v2; sem ela, as telas novas saem com a fonte e o fundo antigos.
- Implementado em `feat/portal-v2`. Shell em `apps/web/src/components/shell/` (raiz `.lh-v2`); telas antigas entram num invólucro `.lh-legado` (fonte, cor e links de antes) até migrarem — cada PR de tela adiciona a sua a `TELAS_V2` em `App.tsx`. `Topbar`, `Sidebar`, `SupportDock` e `TopbarSearch` removidos (só o App os usava); `AppRoute` foi para `lib/rotas.ts`.
- 401: `lib/api.ts` avisa por `lib/sessao.ts`; só o shell escuta. 403 não abre a caixa (é falta de permissão, ex.: consulta admin). Fechar a caixa (Esc/fundo) também leva ao login. Toasts: `avisar()` em `lib/avisos.ts` — ainda sem chamadores; as telas passam a usar ao migrar.
- Mudanças de comportamento para o tech lead aceitar: menu da conta do design (Meu perfil, Configurações, Sair) no lugar do avatar que levava direto ao Perfil; "Sair" ali dispara o mesmo `track('logout')` do Perfil (novo gatilho, mesmo evento). Agendas/Coletas virou "Minhas coletas" (/coletas) e "Agendar coleta" (/agendar). Saiu o card "Lab Hub Plus" do menu (botão sem ação, promessa sem produto). Sino (flag) abre "Nenhuma notificação." em vez de ponto vermelho sem ação. Trilho de ícones < 1024 px trocado pela gaveta.
- Textos: mantidos os atuais onde o design promete o que não existe — busca "exames, médicos, marcadores" (coletas não são buscadas), sem "30 minutos sem uso" na sessão, sem "dados salvos neste aparelho" na faixa offline, Lia sem "responde em 1 min" e sem respostas rápidas.
- Conferido por screenshot (harness temporário, já removido): 360/768/1024/1440, claro/escuro, gaveta + Esc, busca no celular e desktop, menu da conta, faixa offline (some ao voltar), caixa de sessão no escuro, `prefers-reduced-motion` (animação da página = none). Falta a revisão visual do autor do design e a de comportamento do tech lead.
- De passagem: o teste "sair" do App esperava a URL /entrar depois do `history.back()`, mas ela já era /entrar — a travessia do jsdom ficava pendente e vazava para o teste seguinte. Agora espera o `popstate`.

