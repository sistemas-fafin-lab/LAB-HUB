# 05: Paciente baixa o laudo original

**What to build:** Na tela do `laudo`, o paciente aciona "baixar laudo original" e recebe o PDF emitido pelo laboratório de apoio, o mesmo anexado à requisição no apLIS. A API busca o arquivo ao vivo, confere que é do paciente e o entrega; nada fica guardado no LAB-HUB.

**Blocked by:** 01. Independente de 02, 03 e 04.

**Status:** ready-for-agent

- [ ] A ação só aparece para `laudo` que tem requisição do apLIS e com a flag `LAUDOS_OS_VIA_PDF` ligada.
- [ ] O paciente vem do token; `laudo` de outro paciente responde como inexistente.
- [ ] Com mais de um PDF anexado, o paciente vê a lista e escolhe qual baixar.
- [ ] Antes de entregar, o CPF extraído do PDF é conferido contra o do paciente; `diverge` ou `indisponivel` recusam a entrega e são logados como erro.
- [ ] Cada download é registrado na trilha de auditoria de acesso.
- [ ] Limite de requisições apertado, como o da atualização forçada da lista de laudos.
- [ ] Site interno fora do ar: a tela mostra "indisponível no momento", sem erro técnico.
- [ ] A resposta não é cacheável pelo navegador e o PDF não é gravado em disco nem no Storage.
- [ ] Botão e estados (carregando, indisponível, escolha entre arquivos) seguem o LAB Design System do portal v2.
- [ ] Testes no boundary HTTP (sem token, outro paciente, CPF divergente, sucesso com auditoria) e na tela do `laudo`.

## Comments
