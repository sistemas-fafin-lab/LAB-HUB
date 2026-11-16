# 09 — Coletas e agendamento

**What to build:** `SchedulePage` e componentes de agendamento no visual novo: lista de coletas (próxima, em andamento, histórico), detalhe da coleta com linha do tempo/nó em `/coleta/:id`, alerta coral de recoleta, fluxo de agendar (unidade, carrossel de dias com botões, horários, confirmação), preparo com o texto atual. Disponibilidade retroativa do FlowLab e regras atuais preservadas. Sem remarcação/cancelamento/declaração nova se não existirem hoje.

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Agendar funciona com as mesmas chamadas e validações de hoje; horários indisponíveis marcados.
- [x] Carrossel de dias com navegação por botões mantido.
- [x] Textos de preparo idênticos aos atuais.
- [x] `/coleta/:id` abre o detalhe e sobrevive a recarregar.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/SchedulePage.tsx`, `components/schedule/` (`LinhaColeta` substitui `ColetaCard`; saíram `AgendamentoStatusBadge`, `BookingSkeleton`, `ColetasSkeleton`), `lib/coletas.ts` (regras de status e grade de horários, agora também usadas pela Visão geral). `Timeline` ganhou `rotuloAlerta`, `iconeAlerta` e `descricoes`; `motivoRecoleta` virou `motivoAlerta`.
- Conferido em navegador com a API dublada: 360/768/1024/1440, claro e escuro, sem estouro horizontal nas telas lista, agendar, detalhe (agendada, pendência, realizada, cancelada) e não encontrada; Esc fecha a confirmação; Tab com anel visível; com `prefers-reduced-motion` o carrossel anda sem animação; balão de preparo cabe em 360. Olhei as capturas de lista, agendar, confirmação e detalhe, só em parte das combinações. Lado a lado com o protótipo só em `/coletas` a 1440. Carregando, vazio e erro foram cobertos por teste, não vistos no navegador. Depois dos últimos ajustes da revisão (textos, passo da grade) não repeti a conferência visual. **Falta:** revisão visual do autor do design e de comportamento do tech lead.
- Decisões para o tech lead confirmar:
  - **Alerta de recoleta não existe como pedido.** A API não tem recoleta (nem status, nem motivo). O alerta coral ficou para o único estado de atenção real, `bloqueado` ("pendência na recepção"), leva ao detalhe e não oferece "Agendar recoleta". Recoleta real precisa de issue própria (vale também para US34/US45 e `TELAS.md`).
  - **Horários indisponíveis são deduzidos.** O FlowLab só manda os horários livres. O menor intervalo do dia vira o passo da grade, e o que falta entre o primeiro e o último horário sai riscado com "Horários riscados não estão disponíveis". Almoço também sai riscado; ocupado nas pontas do dia não aparece. A alternativa exata é a API devolver os horários ocupados.
  - **"Previsão: amanhã até 14h"** continua estimada sem dado do backend, como hoje. Nenhum status chega à Liberação, porque o portal não recebe esse aviso (issue 20).
  - **Reenviar e Cancelar** agora aparecem também no detalhe e na próxima coleta (o protótipo mostra). Mesmas chamadas e eventos; antes só na lista.
  - **Cancelar** passou de confirmação na linha para caixa de diálogo. Não usa o texto do protótipo "O horário fica livre para outras pessoas": a API só tenta avisar o FlowLab, e pode não liberar.
- Novo em relação à tela antiga: `/coleta/:id` inexistente mostra "Coleta não encontrada" (antes caía na lista); aviso (toast) ao confirmar, ao cancelar e nas falhas de reenviar e cancelar (antes a falha era silenciosa); preparo também no detalhe e no agendar; a confirmação do agendamento agora é um aviso, no lugar da faixa que a navegação já escondia; "Tentar novamente" nos erros.
- Fora de propósito (sem backend ou dado): etapas "Exames" e "Revisão", endereço e "Como chegar", remarcar, calendário, check-in com QR, "avisamos por push e e-mail", tela de agendamento concluído. O envio de documentos no detalhe segue no visual antigo (`.lh-legado`) até a issue 10.
- Testes: `SchedulePage.test` (novo, 65) cobre lista, agendar, carrossel, preparo, reenviar, cancelar e detalhe; `coletas.test` (novo); `App.test` atualizado para os títulos do design e o voltar da coleta. Nenhum removido.
