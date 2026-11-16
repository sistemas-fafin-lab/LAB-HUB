# 13 — Telas de sistema e limpeza final

**What to build:** Telas de 404, sem conexão, erro e manutenção no visual novo (cada uma com ação de volta). Remover o código antigo que ficou sem uso (`Topbar`, `Sidebar`, `SupportDock`, `WIcon`, `WStatus`, `Sparkline`, `WebHero`, primitivos e componentes não usados). Atualizar `docs/TELAS.md` com o estado final. Fazer o merge final de `feat/portal-v2` no master.

**Blocked by:** 05, 06, 07, 08, 09, 10, 11, 12

**Status:** in-review

- [x] Telas de sistema cobertas no teste de App-em-URL (404) e conferidas manualmente.
- [x] Nenhum import do código antigo resta; nenhuma classe/token da identidade antiga (gradientes azul/índigo, Inter/Plus Jakarta) no `apps/web`.
- [ ] Master mergeado na branch e suíte completa verde antes do merge final.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- (da issue 02) Com a última tela antiga fora: promover as regras de `.lh-v2` em `apps/web/src/styles/lh/tema.css` a globais (body, a, `::selection`, `:focus-visible`, `[role=…]` no escuro, `main` na impressão), apontar `fontFamily.display` direto para a Ranade no `tailwind.config.js` e tirar `--lh-font-display`; remover Inter/Plus Jakarta de `styles/fontes.ts` se o laudo já não usar; remover `public/logo.svg`/`logo-white.svg` se nada mais os referenciar.

- Implementado em `feat/portal-v2` (commit "telas de sistema e limpeza final").
- **Telas de sistema** (`components/sistema/`): `ConteudoDeSistema` (o bloco do `SystemScreen` do protótipo) e `PaginaDeSistema` (página inteira, com logo e rodapé).
  - **404:** dentro do shell, com o menu disponível. Mostra "404", "Página não encontrada" e "Voltar ao início" (texto do design). O "Exame não encontrado" usa a mesma tela, sem o "404", e volta para Resultados.
  - **Erro:** `LimiteDeErro`, um limite de erro de render.
    - Por tela, recriado a cada tela pela `key`: troca só o conteúdo, e trocar de tela pelo menu sai do erro.
    - Para o portal inteiro: página inteira se o próprio shell falhar.
    - "Tentar novamente" monta de novo.
  - **Sem conexão:** a mesma falha com o navegador offline. A faixa global de antes continua.
  - **Manutenção:** flag **nova** `EM_MANUTENCAO` (desligada). A API não tem sinal de manutenção; ligar exige deploy. Com ela ligada, toda URL mostra a página de manutenção, e "Tentar novamente" recarrega.
  - Textos do design. Saiu o que prometeria comportamento inexistente:
    - o horário de volta e o 0800;
    - "resultados já abertos neste aparelho" (não há cache offline);
    - "Falar com o suporte" (o suporte está atrás de `MOSTRAR_CHATBOT`);
    - "Ver status";
    - o "Tentando" com espera falsa;
    - "labhub.com.br" no rodapé.
  - Nenhum evento novo do Umami. O 404 continua registrando `nao-encontrada`; erro e manutenção não registram pageview.
- **Limpeza:**
  - Saíram `WIcon` (e seu teste, coberto por `Icone.test`), `WStatus`, `WSkeleton`, `WTabs`, `Sparkline`, `WebHero` e `lib/ui.ts`. Os tipos do exame foram para `lib/exame.ts`. `Topbar`, `Sidebar` e `SupportDock` já tinham saído antes.
  - Saíram `TELAS_V2`, `.lh-legado` e a classe `.lh-v2`. As regras dela viraram globais em `tema.css`: `body`, `body a`, `::selection`, `:focus-visible`, `[role=…]` no escuro e `main` na impressão. Ficou `body a` porque o preflight do Tailwind vem depois e ganharia de um `a` simples.
  - `font-display` aponta para a Ranade e `--lh-font-display` saiu.
  - Inter e Plus Jakarta saíram de `fontes.ts` e do `package.json`; `public/logo*.svg` foram removidos.
  - A tela de carregamento da sessão passou ao visual novo (nó animado).
  - `docs/TELAS.md`, `docs/DESIGN.md` e `CLAUDE.md` foram atualizados.
- **Testes:**
  - `App.test`: a 404 com o novo texto e no shell; erro na tela com "Tentar novamente"; erro saindo pela navegação; sem conexão; erro no shell em página inteira.
  - `App.manutencao.test` (novo): manutenção em `/`, `/resultados` e `/entrar`.
  - Portão: `vitest` 472/472, `type-check`, `lint` (0 erros, 2 avisos antigos) e `build` verdes. Numa rodada completa, 1 teste falhou de forma intermitente e não identificado; as 5 rodadas seguintes passaram completas. Parece a mesma instabilidade notada na issue 12.
- **Conferido em navegador** (Vite com Supabase e API dublados pelo Playwright; o erro foi forçado trocando o módulo da tela, e a manutenção ligando a flag só no navegador):
  - 404, exame inexistente, erro e manutenção a 360/768/1024/1440, claro e escuro: 0 px de estouro, título em Ranade e nenhum erro no console;
  - sem conexão a 360;
  - `prefers-reduced-motion`: nenhuma animação rodando;
  - foco visível no link da 404, e Enter navega.

  Visão geral, entrada e perfil continuam iguais depois da promoção das regras globais.
- **Merge no master: não feito.** O master já é a base da branch (nada a trazer). O merge final fica para depois da revisão visual do autor do design e da revisão de comportamento do tech lead.
- Para o tech lead decidir:
  - aprovar a flag nova `EM_MANUTENCAO`;
  - os componentes do DS ainda sem uso nas telas (`Badge`, `Checkbox`, `Input`, `Select`, `Tag`, `Tooltip`, `grafismoPath`) foram mantidos por serem parte do DS, não código antigo;
  - o limite de erro da página fica dentro do `AuthProvider`: uma falha no próprio provider ainda daria página branca.
