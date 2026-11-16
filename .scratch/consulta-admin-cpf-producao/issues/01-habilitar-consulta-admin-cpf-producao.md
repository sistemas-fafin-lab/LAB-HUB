# 01 — Habilitar consulta admin por CPF em produção (disjuntor + e-mail)

**What to build:** A consulta administrativa por CPF (aba Resultados, modo admin) passa a funcionar também em produção, e não só em local/dev. Ela só autoriza quando duas condições são verdadeiras ao mesmo tempo: um disjuntor explícito está ligado (`ADMIN_RESULTS_ENABLED` na API, `VITE_ADMIN_RESULTS_ENABLED` no web, ambos precisando ser exatamente a string `"true"`) e o e-mail da sessão autenticada bate com o e-mail autorizado (`ADMIN_EMAIL`/`VITE_ADMIN_EMAIL`). Qualquer combinação incompleta — disjuntor desligado, e-mail errado, ou configuração ausente — falha fechada, exatamente como já acontece hoje para configuração ausente em dev. O comportamento em ambiente local/dev não muda.

**Blocked by:** None — pode começar imediatamente.

**Status:** ready-for-agent

- [ ] Em produção, com o disjuntor ligado e o e-mail da sessão batendo com o e-mail autorizado, a consulta administrativa autoriza normalmente (API responde e o campo aparece no web).
- [ ] Em produção, com o disjuntor desligado (ausente ou qualquer valor diferente de `"true"`) e o e-mail correto, a consulta nega — tanto no boundary HTTP quanto na visibilidade do campo no web.
- [ ] Em produção, com o disjuntor ligado e o e-mail da sessão não batendo com o autorizado, a consulta nega.
- [ ] Em produção, sem disjuntor e sem e-mail autorizado configurados, a consulta nega.
- [ ] Um usuário não autorizado em produção não vê o campo administrativo na interface, e uma chamada direta ao endpoint administrativo é recusada mesmo assim.
- [ ] Fora de produção (local/dev), o comportamento permanece idêntico ao atual: mesma checagem de e-mail, sem exigir o disjuntor.
- [ ] O e-mail autorizado pode ser alterado apenas trocando a variável de ambiente correspondente, sem exigir mudança de código.
- [ ] O teste existente que hoje afirma "em produção, mesmo com o e-mail configurado e batendo, nega" é reescrito para refletir que produção agora autoriza quando o disjuntor também está ligado.
- [ ] A suíte da API cobre as quatro combinações de disjuntor e e-mail em produção (ambos ok, só disjuntor, só e-mail, nenhum).
- [ ] A suíte do web cobre a mesma matriz de disjuntor + e-mail para a visibilidade do campo administrativo fora do modo de desenvolvimento.
- [ ] Nenhuma outra parte da experiência já implementada (máscara de CPF, mensagens de estado, banner, isolamento de estado, botão Atualizar, retorno aos próprios resultados) muda de comportamento.
- [ ] Nenhuma alteração é feita em `docker-compose.yml`, `Dockerfile`, ou em arquivos de configuração de deploy versionados — a mudança fica inteiramente na lógica de autorização.
