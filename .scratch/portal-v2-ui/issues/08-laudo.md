# 08 — Laudo: tela e documento com a nova identidade

**What to build:** A tela do laudo (moldura, cabeçalho, ações de imprimir/baixar/declaração) e o documento do laudo (`LaudoDocumento`) com a identidade LAB, mantendo **todas as informações que o laudo apresenta hoje**. DM Sans no corpo, Ranade no título/cabeçalho, cor só no cabeçalho e logo, legível em P&B. "Exportar PDF" continua `window.print()`. Restyle do CSS de impressão movido na fundação; paginação continua medindo com a fonte carregada e é revalidada com a fonte nova. Acessível por `/laudo/:id`.

**Blocked by:** 07 (resultados e exame)

**Status:** in-review

- [x] Nenhum campo do laudo atual some (`modelo.test` verde e cobrindo todos os campos).
- [x] `LaudoPage.test` reescrito com o mesmo comportamento (imprimir, declaração, analytics).
- [x] Impressão conferida: laudo curto, longo (várias páginas) e com tabela de marcadores; em cor e P&B; sem linha cortada entre páginas.
- [x] Botão "Enviar ao médico" continua atrás de `MOSTRAR_ENVIAR_AO_MEDICO`.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/LaudoPage.tsx`, `components/laudo/LaudoDocumento.tsx`, `styles/laudo.css`. O `modelo.ts` não mudou; `modelo.test` e `LaudoPage.test` ganharam um teste de todos os campos, escrito e verde **antes** do restyle.
- Conferido no Chromium, com dados dublados: laudo curto, com tabela (18 marcadores), longo (115 marcadores, 6 folhas) e descritivo longo (160 parágrafos, 7 folhas), em claro e escuro. O PDF sai em A4, com páginas iguais às folhas e numeração completa, sem botões e sem nada além da área útil. P&B conferido renderizando o PDF em tons de cinza. 360/768/1024/1440 sem estouro horizontal; alvos de 44 px abaixo de 1024; Tab com foco visível nos botões; `prefers-reduced-motion` sem animação; carregando, não liberado e erro. **Falta:** impressora física, lado a lado com o protótipo renderizado (comparei com o código da tela do protótipo), revisão do autor do design e do tech lead.
- Bug corrigido: seção descritiva maior que uma folha era cortada em silêncio pelo `overflow: hidden` da folha. Agora quebra por parágrafo e reabre com "(continuação)", como a tabela. A impressão mantém a paginação anterior se a camada de medição estiver fora do layout.
- Decisões para o tech lead confirmar:
  - **Sem dados do paciente a folha não aparece** (carregando ou erro de `/pacientes/me`). Antes saía sem nome nem CPF e dava para imprimir. É mudança de comportamento: um laudo sem identificação não diz de quem é o exame. "Laudo original" continua disponível. O "Tentar novamente" recarrega a página, porque `usePaciente` não expõe recarga.
  - **Exame não liberado com marcadores continua saindo como laudo**, com "Exportar PDF" e sem aviso (comportamento atual). "Laudo ainda não liberado" só aparece sem conteúdo, enquanto `TELAS.md` e o protótipo bloqueiam todo exame não liberado. O mapper junta `pending` e `partial` em `analyzing`, e a tela não distingue os dois.
  - **Limite conhecido:** um único parágrafo ou observação maior que uma folha (cerca de 6 mil caracteres sem quebra de linha) ainda seria cortado. Não encontrei esse caso nos dados de exemplo, mas não medi os reais.
- Textos: "Marcador" e "Referência" vêm do design (antes "Analito" e "Intervalo de referência"). Ficaram "Exportar PDF" (spec), "Laudo original" e "Observações do laboratório" (separa o parecer do laboratório do aviso do app; o design diz "Observações clínicas"). "Laudo ainda não liberado" é do design; o texto de apoio é novo, porque o do protótipo usa um prazo que não temos.
- Fora de propósito: CNPJ, endereço, telefone, assinatura, QR e SBAC do protótipo (dado fictício); coluna "Situação" com pílula colorida (a spec pede cor só no cabeçalho e no logo); "Baixar PDF" separado (o PDF continua sendo `window.print()`).
- Novo além do visual: aviso quando "Laudo original" falha (antes era silencioso, agora igual ao detalhe do exame) e legenda "• Fora da referência", porque sem a cor o "•" sozinho não dizia nada.
- Testes: o de "a barra acompanha o tema" afirmava classe CSS. O substituto só garante que a barra fica fora da folha; o tema dela foi conferido manualmente. A paginação é testada pela tela com alturas dubladas, sem ponto de teste novo.

- 2026-11-04: setas ▼▲ do laudo desenhadas em SVG (tabela e legenda) — a DM Sans não tem esses caracteres e cada aparelho usava outra fonte (Segoe UI no Windows); na tabela levam `aria-label` "abaixo/acima da referência". Paginação: se a versão compacta (linhas da tabela 4 px mais baixas, `.compacto` em `styles/laudo.css`) couber em menos folhas, ela é usada — resolve o hemograma em que só as observações iam para uma 2ª folha. Conferido num PDF gerado: hemograma de 15 marcadores + observações cabe em 1 folha, sem fonte de reserva.
