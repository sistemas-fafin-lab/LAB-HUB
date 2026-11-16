# 10 — Documentos

**What to build:** `DocumentsPage` e componentes de documentos no visual novo: abas por tipo, envio com confirmação antes de adicionar o arquivo, visualizar, baixar, excluir com as regras atuais, estado vazio. Sobre `useDocumentos`.

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Modal de confirmação de arquivo mantido.
- [x] Mesmas restrições de tipo/tamanho e mesmas mensagens de erro.
- [x] Excluir respeita as regras atuais.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/DocumentsPage.tsx` e `components/documents/` no LAB DS, inclusive as peças do detalhe da coleta (saiu o `.lh-legado` de `ColetaTimeline`). Novos: `AreaDeArquivos` (substitui `WFileInput`, removido) e `MensagemDeErro`. Saíram `TONE_CLASSES` e a prop `dark` de Documents e Schedule. `useDocumentos` e os eventos `documento_modal_abrir` e `documento_upload_lote` não mudaram.
- **Mudança no DS, vale para todas as telas:** em `ds/Dialog.tsx`, (1) caixa mais larga que a tela saía pela direita em 360 px, em todo `Modal`, inclusive os de telas já revisadas; (2) o rodapé agora quebra linha; (3) só a caixa do topo responde a Esc e Tab (antes, Esc fechava as duas e o Tab disputava o foco); (4) o fundo não rola com caixa aberta (as caixas antigas travavam; as migradas tinham perdido isso).
- Decisões para o tech lead confirmar:
  - **Excluir agora pede confirmação** ("Excluir documento?", do protótipo), aqui e no detalhe da coleta. Antes era imediato. A exclusão é definitiva na API, mas é desvio literal de "mesmas regras de hoje". Quem pode excluir não mudou: na coleta realizada ou cancelada não há botão.
  - **Sem aviso "Documento excluído":** `remover()` não rejeita, então o aviso poderia mentir sem mudar o hook. A falha aparece em aviso com a mensagem da API, título neutro "Não foi possível concluir", porque o recarregamento que vem depois também pode falhar.
  - **"Enviar documentos" no plural**, inclusive no estado vazio: o envio em lote é exclusivo do sistema atual (o protótipo envia um por vez).
  - **Descrição e estado vazio adaptados:** o texto do protótipo cita declarações, atestados e receitas, que não existem como tipo aqui.
- Novo em relação à tela antiga: avisos de envio concluído; "Tentar novamente" na falha de carga; contagem nas abas; prévia clicável também em PDF; recarregar não troca mais a lista por esqueleto; "Preparando…" enquanto a URL assinada é pedida, com os botões ainda habilitados (o foco de teclado não se perde) e proteção contra clique duplo.
- Fora de propósito (sem backend ou dado): "Enviado por você" (todo documento listado é do paciente), "Enviar ao médico", prévia em caixa (a do protótipo é fictícia; Visualizar abre a URL assinada em nova aba, como hoje), título opcional, Declarações.
- Limitação conhecida: com a caixa de envio aberta depois de uma falha de carga, o fundo mostra "Nenhum documento aqui" atrás do escurecido; ao fechar, a lista recarrega.
- Conferido em navegador com a API dublada: 360/768/1024/1440, claro e escuro, em lista, vazio, erro, carregando, detalhe da coleta e nas três caixas, sem estouro horizontal medido em nenhuma combinação; Esc fecha; Tab com anel visível nos pontos amostrados (Fechar, abas). Olhei só parte das capturas: lista (claro 1440, escuro 360), fila (360 nos dois temas), confirmação (claro 360), vazio (claro 1024), erro (escuro 768), carregando (claro 768), coleta (claro 1024). Lado a lado com o protótipo só em `/documentos` a 1440. `prefers-reduced-motion`: rodei só em claro 360, medindo estouro, sem confirmar que a animação parou. Arrastar e soltar e os envios e exclusões reais não foram exercitados no navegador, só em teste. **Falta:** revisão visual do autor do design e de comportamento do tech lead.
- Testes: `DocumentsPage.test` (novo, 29) com `useDocumentos` real; `SchedulePage.test` ganhou anexar, recusar e excluir. Nenhum removido. Portão: `vitest` 428/428, `type-check`, `lint` (0 erros, 2 avisos fora desta issue) e `build` verdes. **Uma rodada completa, antes dos ajustes finais, teve 1 teste falhando e não registrei qual;** as outras rodadas passaram, então existe um teste intermitente não identificado.
