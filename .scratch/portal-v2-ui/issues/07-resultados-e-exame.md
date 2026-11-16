# 07 — Resultados e detalhe do exame

**What to build:** `ResultsPage` e `ExamDetailPage` no visual novo: lista com busca e filtros atuais, pílulas de status com rótulo, detalhe com marcadores, referência e nó de etapas. A consulta admin por CPF continua idêntica em comportamento (disjuntor, e-mail autorizado, proteção contra corrida, abrir detalhe a partir da consulta, voltar aos próprios resultados). Detalhe acessível por `/exame/:id`. `ExamRow` e `Referencia` reestilizados.

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Busca, filtros e ordenação iguais aos atuais.
- [x] Toda a matriz de comportamento coberta hoje por `ResultsPage.test` continua coberta (incluindo admin por CPF e respostas fora de ordem).
- [x] `ExamDetailPage.test` e `ExamRow.test` reescritos com o mesmo comportamento.
- [x] Recarregar `/exame/:id` abre o exame (ou estado de não encontrado).
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/ResultsPage.tsx`, `pages/ExamDetailPage.tsx`, `components/shared/` (`ExamRow`, `Referencia`, `LaudoTexto`, `LaudoSecoes`), `lib/exibicaoExame.ts` (`situacaoDoExame`), `lib/declaracao.ts`. `LinhaExame` e `ExamRowSkeleton` saíram: a Visão geral usa o mesmo `ExamRow`. `FalhaAoCarregar` foi para `components/portal`.
- Conferido em navegador com a API dublada: 360/768/1024/1280/1440 sem estouro horizontal, claro e escuro; carregando, vazio, filtro sem resultado e erro; `prefers-reduced-motion` desliga o nó; Tab com anel visível; alvos de 44 px em 360; `Referencia` abre com Enter, hover e clique e fecha com Esc e clique fora; recarregar `/exame/:id` abre o exame. Lado a lado com o protótipo só em 1440. **Falta:** revisão visual do autor do design e de comportamento do tech lead.
- Decisões para o tech lead confirmar:
  - **Etapas inferidas do status.** O `Exam` não tem coleta associada, então liberado = 5 de 5 e em análise = 4 de 5 ("Análise" atual). Quem tem laudo do LIS sem agendamento vê Agendamento e Check-in concluídos, e "Laudo e declaração disponíveis" aparece mesmo sem declaração. O protótipo só mostra Etapas com coleta. A issue pede o nó, então ficou; a alternativa é levar `agendamentoId` ao `Exam` ou esconder o bloco.
  - **Recoleta não existe na tela** (US34, `TELAS.md`): nem `Resultado` nem `Laudo` têm esse dado, e a spec manda omitir o que não tem dado. Precisa de issue própria, e `TELAS.md` ainda cita o estado.
  - **Filtro "Em andamento" e pílula "Em análise"** dão dois nomes ao mesmo estado. Os dois vêm do design, mas a issue diz "filtros iguais aos atuais" (o filtro se chamava "Em análise").
  - **"Nenhum exame encontrado"** é o texto do design e parecido com o que a tela antiga trocou porque o paciente concluía não ter exames. Ficou com "limpe os filtros" e o botão "Limpar filtros".
- Novo em relação à tela antiga, além do visual: contagem nos filtros, "X de Y exames", "Limpar filtros" e "Agendar coleta" no vazio (do protótipo); "Tentar novamente" no erro e aviso quando o "Baixar PDF" falha (como na Visão geral); "Limpar CPF" no campo admin (vem do campo de busca do portal); estado "Resultado em andamento" sem valores (antes a tela ficava vazia). Exame liberado sem marcadores mostra "Nenhum marcador para mostrar".
- Fora de propósito: "Exportar", "Compartilhar", "Ver coleta" e horários das etapas (sem backend ou sem dado); busca por médico/marcador (a busca atual é por nome e categoria); "Histórico completo" (promessa falsa). Tendência some abaixo de `md`, como no protótipo; hoje nenhum laudo tem série.
- Etapas lado a lado com os marcadores só a partir de `xl` (protótipo: `lg`): com o menu lateral, em 1024 px a tabela não cabia. O "Exame não encontrado" segue a 404 antiga até a issue 13.
- Testes: `ResultsPage.test` (52) ganhou busca, filtros, período, carregando e erro, que não tinham cobertura; `ExamDetailPage.test` (29) e `ExamRow.test` (11) reescritos; 2 novos no App. Nenhum removido; mudaram os textos de vazio e `Período`, agora um `combobox`.
