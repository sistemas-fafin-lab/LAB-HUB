# 02: Paciente vê o `laudo` vinculado pelo PDF

**What to build:** Com a flag `LAUDOS_OS_VIA_PDF` ligada, o paciente cuja requisição não tem O.S. vinculada (recepção deixou o `idOsLis` vazio no Álvaro) passa a ver o `laudo` com os valores no portal: na busca ao vivo, a API lê o PDF "Laudo EXTERNO" da requisição, extrai a O.S., confere o CPF e grava o vínculo; os valores vêm do Álvaro pela O.S., como hoje.

Cobre o caso de uma O.S. por requisição (96% da amostra recente). A varredura atual por `idOsLis` continua rodando depois e preenche o que sobrar.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Flag desligada (padrão): o site interno não é chamado e o comportamento é idêntico ao atual.
- [ ] O passo roda depois de registrar as requisições novas e antes da varredura de O.S., só para requisições ainda sem O.S.
- [ ] O CPF do PDF é conferido contra o paciente do token: `diverge` e `indisponivel` descartam o PDF (falha fechada); `diverge` é logado como erro com o código da requisição.
- [ ] A O.S. extraída é gravada na linha da requisição e o `laudo` sai pelo caminho do Álvaro, com a barreira de identidade existente intacta.
- [ ] Requisição que já tem O.S. vinculada nunca é sobrescrita pelo PDF.
- [ ] Vários PDFs com a mesma O.S. na mesma requisição contam como um.
- [ ] Requisição com mais de uma O.S. distinta nos PDFs: vincula a primeira e loga as demais (o ticket 03 trata do resto).
- [ ] Qualquer falha do site ou da extração é logada e não interrompe a busca; a varredura por `idOsLis` cobre o caso.
- [ ] Os downloads respeitam um limite de concorrência.
- [ ] Log estruturado por busca: O.S. vinculadas pelo PDF, pelo `idOsLis`, requisições sem anexo, layout desconhecido.
- [ ] Testes do serviço de laudos, com os dublês já usados para apLIS, Álvaro e repositório, cobrem cada item acima.
- [ ] A documentação dos laudos LIS e a de arquitetura descrevem o caminho novo e a flag.

## Comments
