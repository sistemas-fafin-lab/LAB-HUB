# 12 — Tendências e Faturamento

**What to build:** Tendências e Faturamento no visual novo, com o mesmo conteúdo e as mesmas fontes de dados de hoje. Nenhum controle novo sem backend (ex.: trocar plano, adicionar cartão, tornar cartão principal).

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Mesmo conteúdo das telas atuais, no visual novo.
- [x] Nenhum controle sem backend introduzido.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/TrendsPage.tsx` e `pages/BillingPage.tsx` no LAB DS, montadas na raiz `.lh-v2` (entraram em `TELAS_V2`). Saiu a prop `dark` das duas. As duas continuam atrás de `MOSTRAR_TENDENCIAS` e `MOSTRAR_FATURAMENTO` (desligadas), sem mudança nas flags. Não há evento do Umami nestas telas, nem antes nem agora.
- **Conteúdo:** o mesmo conteúdo estático de hoje (sem hook nem API: não havia fonte de dados).
  - Tendências: o resumo, os quatro marcadores com valor, unidade, variação, série e nota.
  - Faturamento: o plano, a mensalidade, o próximo débito, as quatro cobranças, os dois cartões com o principal marcado, o PIX e o resumo do mês.
  - Do design vêm os títulos e rótulos: "Formas de pagamento" (era "Forma de pagamento") e "PIX" (era "Pagar via PIX"). As datas passam para o formato do design ("15 mai 2026").
  - O resto do texto (resumo, notas e "Aprovação imediata" do PIX) é o de hoje. "Disponível no pagamento" (do design) prometeria um pagamento que não existe.
  - O tom das pílulas segue o protótipo: o LDL fica em coral, com o último ponto do gráfico também coral; a vitamina D em azul; glicemia e hemoglobina em cinza. Todas mantêm o rótulo em texto.
- **Sem controle sem backend:** saíram os botões mortos de hoje (nenhum tinha ação):
  - "Mudar plano", "Gerenciar" e "+ Adicionar": issue 16;
  - "Exportar CSV" e "NFS-e" por cobrança: **ainda sem issue**. Recomendo abrir uma, ou ampliar a 16.

  O protótipo também tem "Tornar principal", "Ver exame" por marcador e o eixo "mai/out". Ficaram de fora: não existem hoje e não têm dado real.
- **Estados:** as telas são estáticas, então não há carregando, vazio nem erro. O vazio do protótipo ("Ainda não há histórico suficiente") não entra: não há fonte de dados para decidir quando mostrar.
- Decisões para o tech lead confirmar:
  - a retirada dos cinco botões mortos;
  - o subtítulo do design "…histórico de notas fiscais" ficou (era o mesmo antes), embora a tela não dê acesso à NFS-e;
  - a 360 px, descrições longas de cobrança truncam com reticências, como no protótipo.
- Conferido em navegador (Vite com Supabase e API dublados pelo Playwright, flags ligadas só localmente e restauradas depois):
  - `/tendencias` e `/faturamento` a 360/768/1024/1440, claro e escuro: 0 px de estouro horizontal e nenhum erro nem aviso no console;
  - nenhuma das duas usa o invólucro `.lh-legado`;
  - `prefers-reduced-motion`: nenhuma animação rodando nas duas, a 360;
  - Tab e Esc não se aplicam: as telas não têm controle focável nem caixa.

  Olhei as capturas: faturamento claro 1440 e escuro 360, tendências escuro 1440 e claro 360. A comparação lado a lado com o protótipo foi feita pelo código das telas (extraído do `docs/prototipo-v2.html`), não com o protótipo renderizado. **Falta:** revisão visual do autor do design e de comportamento do tech lead.
- Testes:
  - `TrendsPage.test` (novo, 8) e `BillingPage.test` (novo, 6) cobrem o conteúdo e a ausência de botões e links;
  - antes não havia teste próprio destas telas, e nenhum foi removido;
  - `App.test` já cobre a rota oculta por flag.

  Portão: `vitest` 465/465, `type-check`, `lint` (0 erros, 2 avisos fora desta issue) e `build` verdes. Numa rodada completa, `DocumentsPage.test` › "imagem que não abre volta para o ícone" falhou uma vez. Passou nas 3 vezes sozinho e na rodada completa seguinte: parece instável sob carga, fora desta issue.

- 2026-11-04: **Tendências ligada** (`MOSTRAR_TENDENCIAS = true`) com dados reais, sem backend novo: `lib/tendencias.ts` monta a evolução de cada marcador a partir dos resultados do paciente (`useResultados`), juntando o mesmo marcador (nome + unidade) de coletas diferentes. Entra a partir de 2 coletas com valor numérico; ignora exame em análise, substituído (retificado) ou sem data de coleta; lê também os grupos do hemograma. Cartão: último valor, variação desde a coleta anterior ("+18 desde a coleta anterior", "Estável há N coletas"), gráfico, nota e "Ver exame". Fora da referência vem primeiro. Estados de carregando, erro e "Ainda não há histórico suficiente" (do design). **Diferença do design:** as notas e o resumo não trazem interpretação clínica ("boa resposta à suplementação", "agende retorno com a Dra. …") — só repetem o que o laudo diz: "Dentro da referência (x)." ou "Fora da referência (x). Converse com seu médico sobre este resultado." Texto a validar com o laboratório.

- 2026-11-04 (correções da revisão): o marcador agora é nome + unidade **dentro do mesmo exame ou grupo do pedido** (não mistura "Neutrófilos" de grupos diferentes nem "Resultado" de exames diferentes). Pedido parcial (em análise) entra com os valores já liberados. Valores no formato dos laudos: ponto é milhar e vírgula é decimal ("6.500", "212.000", "1.234,5"; "0.500" e "14.2" são decimais). Duas versões no mesmo dia: vale a mais recente. Liberação do FlowLab conta no dia do fuso escolhido. FlowLab e laboratório não se somam (o FlowLab só informa a liberação): se o marcador tem histórico nas duas fontes, fica um cartão só, o da fonte com mais coletas (laboratório no empate). Não feito: parser compartilhado com a API — a API só importa tipos de `@lab-hub/shared` e o `toTrend` dela gera um ponto só por laudo (nenhum gráfico usa), então não há divergência visível.
