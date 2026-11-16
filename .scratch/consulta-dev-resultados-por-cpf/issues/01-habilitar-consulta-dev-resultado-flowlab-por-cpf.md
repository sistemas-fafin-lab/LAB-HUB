# 01 - Habilitar consulta dev de resultado FlowLab por CPF

**What to build:** Entregar o primeiro caminho completo da consulta administrativa de desenvolvimento: em local/dev, o usuário autenticado com o email autorizado `teste@gmail.com` consegue informar o CPF de um paciente e visualizar os `resultado` persistidos pelo FlowLab na aba Resultados.

A capacidade deve usar a mesma sessão do portal, validar a autorização no servidor e permanecer read-only. A tela deve identificar o paciente consultado, sem misturar seus dados com a lista do paciente titular da sessão. Esta fatia cobre somente a fonte `resultado` do FlowLab; a inclusão dos `laudo` LIS cacheados será feita no ticket seguinte.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] Em ambiente local/dev, o campo de CPF aparece na aba Resultados somente para a sessão cujo email corresponde a `teste@gmail.com`; a configuração usa `ADMIN_EMAIL` no servidor e `VITE_ADMIN_EMAIL` no web, sem valores versionados.
- [ ] Fora de local/dev, com configuração ausente ou com email diferente, a capacidade falha fechada: o campo não aparece e a API não autoriza consultas.
- [ ] A API valida o JWT Supabase e o email autorizado no servidor antes de consultar qualquer CPF-alvo; sessão ausente ou inválida retorna `401`, e sessão autenticada não autorizada retorna `403`.
- [ ] O campo aplica máscara visual de CPF, aceita Enter e botão de busca, normaliza o valor para 11 dígitos e rejeita CPF inválido com `400`, sem iniciar requisição para uma entrada inválida.
- [ ] Um CPF válido identifica um paciente por correspondência exata e única, exclui paciente com `excluido_em` preenchido e retorna `404` quando nenhum paciente ativo corresponde.
- [ ] A resposta de sucesso contém a identidade mínima do paciente encontrado e seus `resultado` FlowLab, consultados pelo `paciente_id` resolvido no servidor, sem confiar em um id enviado pelo navegador.
- [ ] A consulta inclui os estados de `resultado` suportados pela aplicação, incluindo liberados e em análise, sem alterar ou excluir dados persistidos.
- [ ] A aba substitui a lista própria pela lista read-only do paciente encontrado e exibe nome e CPF completo no contexto da consulta.
- [ ] As linhas exibidas reutilizam a representação resumida existente e não permitem editar dados nem acessar detalhes, laudos ou declarações nesta fatia.
- [ ] Um paciente encontrado sem `resultado` responde com lista vazia e a tela apresenta estado distinto de “paciente não encontrado”.
- [ ] A visão normal de um usuário não administrador continua mostrando somente seus próprios resultados e os filtros existentes permanecem inalterados fora do modo administrativo.
- [ ] A suíte cobre o boundary HTTP da API e o DOM da tela, incluindo autorização, validação, isolamento por paciente, sucesso, CPF inexistente, lista vazia e regressão da visão normal.
