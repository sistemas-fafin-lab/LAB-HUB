# 06 — Visão geral

**What to build:** `HomePage` no visual novo (destaque com recorte da marca, coletas, próximos passos), sobre `useResultados` e `useAgendamentos`. Os blocos hoje atrás de flag (`MOSTRAR_RESULTADO_HERO`, `MOSTRAR_ACOMPANHAMENTO`, `MOSTRAR_PROXIMOS_PASSOS_EXTRAS`, `MOSTRAR_EXAMES_RECENTES`) ganham o visual novo e continuam respeitando a flag. Esqueleto + nó animado no carregamento; estado vazio levando a agendar.

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Mesmo conteúdo e mesmas ações da visão geral atual, no visual novo.
- [x] Cada bloco com flag aparece/some conforme a flag.
- [x] Estado vazio (sem exames) e carregando cobertos.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/HomePage.tsx`, `components/visao-geral/` (`Destaque`, `LinhaExame`), `lib/exibicaoExame.ts` (data e responsável da linha, compartilhados com `ExamRow`). O componente `WebHero` saiu; o arquivo ficou só com os tipos `Exam`/`ExamPanel`/`ExamGroup` (a issue 13 deve movê-los).
- Conferido em navegador com a API dublada (flags ligadas por interceptação, sem mudar o repo): 360/768/1024/1440 sem estouro horizontal nem do destaque; claro e escuro; carregando, vazio e erro; `prefers-reduced-motion` desliga nó e esqueleto; Tab com anel visível (branco sobre o azul do destaque); alvos de 44 px abaixo de 1024. A tela não tem caixa, então Esc não se aplica. Lado a lado com o protótipo só em 1440. **Falta:** revisão visual do autor do design e de comportamento do tech lead.
- Decisões para o tech lead confirmar:
  - **Convite "primeira coleta" não depende de `MOSTRAR_RESULTADO_HERO`.** A flag governa o cartão do último exame; sem isto, com a flag desligada (hoje), o paciente novo não teria estado vazio. Muda o que vai para produção.
  - **Convite exige também nenhuma coleta:** sem exames, com coleta realizada ou em andamento, "Agende sua primeira coleta" seria falso. Quem só cancelou ou faltou é convidado.
  - **Destaque usa o exame liberado mais recente**, não `exams[0]` (a tela antiga dizia "está pronto" para exame em análise).
  - **Mini-resumo de 4 marcadores do destaque saiu**, no lugar ficou a contagem do protótipo (marcadores / fora da referência). Só com a flag ligada.
  - **Exames recentes:** limitado a 5, como no protótipo, agora com "Ver todos" funcionando (antes listava todos, e o botão não fazia nada); "Filtrar", inerte e fora do protótipo, saiu.
- Novo em relação à tela antiga: bloco "Em andamento" (`/` em `TELAS.md`), estados de carregando e de erro com "Tentar novamente" (antes, sem coletas carregadas, dizia para agendar), aviso quando o "Baixar PDF" falha (antes silencioso).
- "Em andamento" fica sem `realizado` porque o portal não recebe o aviso de liberação (issue 20): a coleta ficaria ali para sempre. Coleta agendada cuja hora passou também fica fora.
- Textos: do design, menos "O resultado aparece **em Resultados**" (design: "aqui"; falso com a flag do destaque desligada), "Seu último exame está pronto" (design usa um título por exame, que não existe) e o passo da coleta, que mostra a unidade em vez do primeiro item de preparo (preparo não é por exame). Mocks atrás de flag (`Acompanhamento`, passos extras) mantêm o texto de hoje e seguem sem ação.
- Testes: novo `HomePage.test.tsx` (47 casos; a tela não tinha teste) e 3 no App em URL. O nome do `h1` em `App.test` perdeu o ponto final (agora é o bloco `.lh-dot`). Nenhum removido.
- (2026-11-04) Ligadas `MOSTRAR_RESULTADO_HERO` e `MOSTRAR_EXAMES_RECENTES` a pedido do usuário (dado real da API). `MOSTRAR_ACOMPANHAMENTO` e `MOSTRAR_PROXIMOS_PASSOS_EXTRAS` seguem desligadas (mock).
