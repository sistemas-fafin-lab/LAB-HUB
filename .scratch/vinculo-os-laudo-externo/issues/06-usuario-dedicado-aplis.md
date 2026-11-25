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
### 25/11/2026 — auditoria com o usuário dedicado

Lado do código conferido, sem mudança: o cliente do site só lê `APLIS_WEB_*` (não herda `APLIS_USUARIO`/`APLIS_SENHA`), só tem as duas leituras e respeita a trava de 10 minutos.

Rodada com o usuário dedicado, credenciais no `.env` local (não na produção). Mesma lista da rodada do ticket 01, reconstruída pelo banco de backup: 398 requisições de Medicina Laboratorial (exame 49) finalizadas, solicitadas de 05/09 a 24/11/2026, modo `--requisicoes`, `--dias 85`. Uma sessão só do site, nenhum erro.

```
Resumo
  Requisições: 398 auditadas · 397 com O.S. pelo PDF · 0 com PDF sem O.S. utilizável · 1 sem anexo tipo 14 · 0 com erro
  PDFs: 409 · layout atual 409 · antigo 0 · desconhecido 0 · ilegível 0 · falha no download 0
    60 PDF(s) trazem mais de uma O.S.
  Identidade por O.S. do PDF: 477 confere · 1 DIVERGE · 1 indisponível
    das que conferem, 15 só por nome + nascimento (13 sem CPF no laudo, 2 com CPF diferente do cadastro)
    1 PDF(s) misturam O.S. do paciente com O.S. de outra pessoa
  O.S.: 491 · 354 nas duas e iguais · 104 só no PDF · 17 só no idOsLis · 16 nas duas, requisições diferentes
    das "só no PDF", 2 têm o CPF no idOsLis: o método atual as acha, mas como card avulso, sem a requisição
    das "só no idOsLis", 0 são de requisição cujo PDF não pôde ser lido
```

Contra a rodada de 24/11 (usuário de investigação):

- Iguais: 398 requisições, 1 sem anexo tipo 14, 0 erros, 60 PDFs com mais de uma O.S., 354 O.S. nas duas e iguais, 17 só no `idOsLis`, 16 divergentes.
- Diferentes: 409 PDFs contra 407; 397 requisições com O.S. pelo PDF contra 396 (a que tinha "PDF sem O.S. utilizável" agora tem O.S.); 104 O.S. só no PDF contra 103.
- O usuário dedicado enxerga tudo o que o de investigação enxergava, e 2 PDFs a mais. A causa provável é anexo incluído no apLIS depois de 24/11; não foi confirmada, porque o usuário de investigação não foi rodado no mesmo dia.
- A linha de identidade não é comparável: o script passou a aceitar nome + nascimento como segunda prova depois da rodada do ticket 01.

Não conferido aqui: que inserir, alterar e excluir estão desligados para o usuário (a auditoria só lê; conferir no cadastro do apLIS). Antes de o login funcionar houve duas recusas por senha errada no `.env`.
