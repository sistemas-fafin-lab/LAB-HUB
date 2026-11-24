# 06: Usuário dedicado somente leitura no apLIS

**What to build:** A API do LAB-HUB entra no site do apLIS com um usuário criado só para ela, sem permissão de gravar. Assim uma falha nossa não altera nada no LIS, e uma recusa de login não ativa captcha para os outros sistemas e pessoas que hoje compartilham o usuário de integração.

Tarefa humana, no cadastro de usuários do apLIS — não é de código. Não bloqueia o desenvolvimento dos demais tickets; bloqueia ligar `LAUDOS_OS_VIA_PDF` em produção.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] Usuário criado no apLIS, exclusivo do LAB-HUB.
- [ ] Permissões conferidas: lê as fotos da requisição (inclusive o tipo "Laudo EXTERNO"); inserir, alterar e excluir desligados.
- [ ] Credenciais gravadas no ambiente de produção da API, fora do repositório.
- [ ] A auditoria do ticket 01 roda com esse usuário e devolve o mesmo resultado que com o usuário de teste.
- [ ] O uso do site interno foi combinado com o fornecedor do apLIS, junto do pedido para expor o tipo 14 na API de integração.

## Comments
