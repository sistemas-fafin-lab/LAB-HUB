# 01: Auditoria — O.S. pelo PDF × O.S. pelo `idOsLis`

**What to build:** O operador roda o script de auditoria de vínculos para um paciente (ou para uma lista de requisições) e recebe, por requisição: a O.S. extraída do PDF "Laudo EXTERNO" anexado no apLIS, a O.S. que o método atual acharia pelo `idOsLis`, e se o CPF do PDF confere com o do paciente. No fim, um resumo com as contagens.

É a primeira passada completa pelo caminho novo — site interno do apLIS → PDF tipo 14 → extração de O.S. e CPF — verificável contra dados reais, sem mudar nada no portal. As peças que ela cria (leitura dos anexos e extração) são as que os tickets seguintes reutilizam.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] O script lista os anexos tipo 14 ativos de cada requisição pelo site interno do apLIS e baixa cada PDF em memória.
- [x] De cada PDF sai a O.S. (`OS: <número>` no cabeçalho) e o CPF, só com dígitos. O campo "OS Lis" impresso no PDF é ignorado.
- [x] Layout não reconhecido, PDF sem texto ou corrompido resultam em "sem O.S.", nunca em número achado por aproximação. O modelo antigo de jan–fev/2026 fica fora do escopo e cai neste caso.
- [x] A saída classifica cada O.S.: só no PDF, só no `idOsLis`, nas duas e iguais, nas duas e apontando requisições diferentes.
- [x] A saída mostra o veredito de CPF (`confere`, `diverge`, `indisponivel`) pela mesma função de conferência que a busca de laudos usa.
- [x] Nome e CPF de paciente não aparecem na saída nem em log; requisição e O.S. aparecem.
- [x] O acesso ao site é somente leitura: nenhuma função de gravação é implementada.
- [x] Após uma recusa de login, nenhuma nova tentativa por 10 minutos (recusas seguidas ativam captcha para todos que usam o mesmo usuário).
- [x] A sessão do site é reaproveitada entre as chamadas da mesma execução.
- [x] Sem as credenciais do site configuradas, o script avisa e sai sem erro; o exemplo de variáveis de ambiente documenta as novas.
- [x] A biblioteca de leitura de texto de PDF escolhida está registrada nos comentários deste ticket, com o motivo (o teste de viabilidade usou `pdftotext`, indisponível em produção).
- [x] Testes: extração com textos sintéticos (nenhum PDF nem dado real no repositório), incluindo os casos de recusa; acesso ao site com `fetch` simulado cobrindo login, reuso de sessão, trava após recusa, filtro de tipo e cada modo de falha.
- [x] Rodado contra dados reais, o resumo é anexado nos comentários deste ticket (sem dados de paciente).

## Comments
### 24/11/2026 — implementação

Uso (a partir de `apps/api`, com `APLIS_WEB_URL`, `APLIS_WEB_USUARIO` e `APLIS_WEB_SENHA` no ambiente):

```
npx tsx scripts/auditar-vinculos.ts --os-pdf --paciente <uuid> [--dias N]
npx tsx scripts/auditar-vinculos.ts --os-pdf --requisicoes <cod1,cod2,…> [--dias N]
```

Peças criadas, que os tickets seguintes reutilizam:

- `src/laudos/aplisSite.ts` — cliente do site interno: `listarLaudosExternos(idRequisicao, codRequisicao)` e `baixarAnexo(anexo)`. Só GET nas duas leituras; a listagem é recusada se o site disser que aquele id é de outra requisição.
- `src/laudos/laudoExterno.ts` — `extrairVinculoDoLaudoExterno(texto)` (pura) e `lerLaudoExterno(pdf)` (bytes → resultado, nunca lança).
- `src/laudos/auditoriaOsPdf.ts` — `classificarOs`, a comparação PDF × `idOsLis`.
- `AplisRequisicao.id_requisicao` — o id interno que a listagem do apLIS devolve e o site exige.

### 24/11/2026 — biblioteca de leitura de texto de PDF

Escolhida: **`unpdf` 1.9.x** (`^1.9.1`).

- É o pdf.js da Mozilla empacotado, sem dependências e sem binário nativo. A imagem de produção é `node:22-alpine`, onde `pdftotext` não existe e módulo nativo é risco.
- `pdf-parse` 2.x traz `@napi-rs/canvas` (nativo) e 21 MB; `pdfjs-dist` direto são 37 MB. O `unpdf` tem 2 MB.
- **Fixada na série 1.x de propósito**: a 2.x exige Node 24, e a produção e o CI rodam Node 22. Subir de major só junto com o Node.
- Conferido contra um PDF real: o texto sai com um rótulo por linha (`OS: …`, `OS Lis: …`, `CPF: …`), que é o que o extrator espera. Um teste monta um PDF sintético em código para segurar esse formato sem guardar arquivo no repositório.

### 24/11/2026 — rodada contra dados reais

398 requisições de Medicina Laboratorial finalizadas, solicitadas entre 05/09 e 24/11/2026 (80 dias), no modo `--requisicoes`. 5 min 10 s no total, numa sessão só do site. Usuário do apLIS: o de investigação (o dedicado é o ticket 06).

```
Resumo
  Requisições: 398 auditadas · 396 com O.S. pelo PDF · 1 com PDF sem O.S. utilizável · 1 sem anexo tipo 14 · 0 com erro
  PDFs: 407 · layout atual 407 · antigo 0 · desconhecido 0 · ilegível 0 · falha no download 0
    60 PDF(s) trazem mais de uma O.S.
  CPF do PDF: 400 confere · 1 DIVERGE · 6 indisponível
  O.S.: 490 · 354 nas duas e iguais · 103 só no PDF · 17 só no idOsLis · 16 nas duas, requisições diferentes
    das "só no PDF", 2 têm o CPF no idOsLis: o método atual as acha, mas como card avulso, sem a requisição
    das "só no idOsLis", 0 são de requisição cujo PDF não pôde ser lido
```

O que a medição mostra:

- **Cobertura.** 396 de 398 requisições (99,5%) ganham ao menos uma O.S. pelo PDF. 35 delas (8,8%) não têm O.S. nenhuma pelo `idOsLis` hoje — é o laudo que não aparece para o paciente.
- **Um PDF pode trazer várias O.S. — a spec não previa.** 60 dos 407 PDFs (15%) têm 2 ou 3 O.S. no mesmo arquivo, cada página com o cabeçalho da sua. A primeira versão do extrator recusava esses arquivos (dois valores diferentes = ambíguo) e a cobertura caía para 337 de 398. Por isso `os` virou **lista**: todas as O.S. distintas do PDF, na ordem. Isso muda a premissa dos tickets 02 e 03, que tratavam "mais de uma O.S. por requisição" como caso de dois anexos (3 em 75 na amostra da spec).
- **Barreira de CPF.** 1 PDF com CPF divergente (a O.S. dele ficou fora da comparação) e 6 sem CPF utilizável. Com a regra da spec de fechar em `indisponivel`, esses 6 (1,5%) seriam descartados no ticket 02. Não foi investigado por que o CPF não saiu nesses 6.
- **Divergência.** 16 O.S. em que o PDF está numa requisição e o `idOsLis` aponta outra — entrada do ticket 04.
- **Só no `idOsLis`.** 17 O.S. que o método atual liga a uma requisição cujo PDF não as traz. O PDF não substitui a varredura; soma.
- **Layout.** 407 de 407 no layout atual. Nenhum antigo, desconhecido ou ilegível na janela.

Pendências que ficaram fora deste ticket:

- O modo antigo do mesmo script (sem `--os-pdf`) lê `pacientes.cpf` e `exam_results.cpf`, colunas removidas na fase 2b do S-06. Não foi tocado aqui.
- `docs/LAUDOS_LIS.md` ainda não tem a seção do vínculo pelo PDF (a spec a prevê para a entrega como um todo). `ARCHITECTURE.md` e `.env.example` já têm a integração.
