# 02: Paciente vê o `laudo` vinculado pelo PDF

**What to build:** Com a flag `LAUDOS_OS_VIA_PDF` ligada, o paciente cuja requisição não tem O.S. vinculada (recepção deixou o `idOsLis` vazio no Álvaro) passa a ver o `laudo` com os valores no portal: na busca ao vivo, a API lê o PDF "Laudo EXTERNO" da requisição, extrai as O.S., confere o CPF e grava o vínculo; os valores vêm do Álvaro pela O.S., como hoje.

Grava uma O.S. por requisição — a primeira. Um mesmo PDF pode trazer 2 ou 3 O.S. (15% dos PDFs na medição do ticket 01, 60 de 407), então a extração devolve uma lista; as demais O.S. da requisição são só logadas aqui e ganham vínculo no ticket 03. A varredura atual por `idOsLis` continua rodando depois e preenche o que sobrar.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Flag desligada (padrão): o site interno não é chamado e o comportamento é idêntico ao atual.
- [ ] O passo roda depois de registrar as requisições novas e antes da varredura de O.S., só para requisições ainda sem O.S.
- [ ] O CPF do PDF é conferido contra o paciente do token: `diverge` e `indisponivel` descartam o PDF (falha fechada); `diverge` é logado como erro com o código da requisição.
- [ ] A primeira O.S. da requisição é gravada na linha dela e o `laudo` sai pelo caminho do Álvaro, com a barreira de identidade existente intacta. "Primeira" é determinística: anexos na ordem da listagem do site, O.S. na ordem em que aparecem no PDF.
- [ ] Requisição que já tem O.S. vinculada nunca é sobrescrita pelo PDF.
- [ ] As O.S. de todos os PDFs da requisição formam uma lista só, sem repetição: a mesma O.S. em vários PDFs, ou em várias páginas do mesmo PDF, conta uma vez.
- [ ] Requisição com mais de uma O.S. distinta — em PDFs diferentes ou no mesmo PDF: vincula a primeira e loga as demais com o código da requisição (o ticket 03 trata do resto).
- [ ] PDF com CPF `diverge` ou `indisponivel` não contribui com nenhuma das suas O.S.; os outros PDFs da mesma requisição continuam valendo.
- [ ] Qualquer falha do site ou da extração é logada e não interrompe a busca; a varredura por `idOsLis` cobre o caso.
- [ ] Os downloads respeitam um limite de concorrência.
- [ ] Log estruturado por busca: O.S. vinculadas pelo PDF, pelo `idOsLis`, O.S. extras não vinculadas (à espera do ticket 03), requisições sem anexo, layout desconhecido.
- [ ] Testes do serviço de laudos, com os dublês já usados para apLIS, Álvaro e repositório, cobrem cada item acima.
- [ ] A documentação dos laudos LIS e a de arquitetura descrevem o caminho novo e a flag.

## Comments

### 25/11/2026 — ajuste após a medição do ticket 01

O ticket foi escrito supondo uma O.S. por PDF. A auditoria contra 398 requisições reais mostrou 60 de 407 PDFs com 2 ou 3 O.S. no mesmo arquivo (uma por página), e a extração (`lerLaudoExterno`) passou a devolver `os: string[]`. Mudou neste ticket:

- o escopo deixa de ser "uma O.S. por requisição (96%)": continua gravando só a primeira, mas o caso de várias O.S. é comum e precisa de teste próprio, inclusive várias O.S. num PDF só;
- a regra de qual é a "primeira" ficou explícita;
- o descarte por CPF é por PDF, não por requisição.

Não decidido aqui: se a primeira O.S. do PDF é a melhor para ocupar a linha da requisição. Nos arquivos olhados, a primeira O.S. ocupava 1 página e a última, dezenas — a ordem do arquivo não diz qual remessa tem mais exames. Enquanto o ticket 03 não entrar, o paciente dessas requisições vê só os exames da O.S. gravada.

Ainda sem explicação: 6 dos 407 PDFs saíram com CPF `indisponivel` e seriam descartados pela falha fechada. Vale olhar esses casos antes de ligar a flag.
