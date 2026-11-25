# 02: Paciente vê o `laudo` vinculado pelo PDF

**What to build:** Com a flag `LAUDOS_OS_VIA_PDF` ligada, o paciente cuja requisição não tem O.S. vinculada (recepção deixou o `idOsLis` vazio no Álvaro) passa a ver o `laudo` com os valores no portal: na busca ao vivo, a API lê o PDF "Laudo EXTERNO" da requisição, extrai as O.S., confere o CPF e grava o vínculo; os valores vêm do Álvaro pela O.S., como hoje.

**Regra do produto: o paciente vê todos os seus exames, sem deixar nenhum de fora.** Um mesmo PDF pode trazer 2 ou 3 O.S. (15% dos PDFs na medição do ticket 01, 60 de 407). A principal entra na linha da requisição; cada uma das demais é gravada como linha própria, só com a O.S., e aparece para o paciente como card do Álvaro. O ticket 03 depois funde esses cards no do pedido. A varredura atual por `idOsLis` continua rodando depois e preenche o que sobrar.

**Blocked by:** 01.

**Status:** done

- [x] Flag desligada (padrão): o site interno não é chamado e o comportamento é idêntico ao atual.
- [x] O passo roda depois de registrar as requisições novas e antes da varredura de O.S., para todas as requisições do paciente na janela — a que já tem O.S. também pode ter outras O.S. no PDF.
- [x] A identidade é conferida por O.S., com duas provas: o CPF impresso nas páginas de cada O.S. contra o paciente do token e, quando ele falta ou diverge, nome + nascimento impressos (os dois, exatos) contra o cadastro da requisição no apLIS. Sem nenhuma das duas a O.S. é descartada (falha fechada); a de CPF divergente é logada como erro com o código da requisição e a O.S. O descarte vale só para o caminho do PDF: o que o `idOsLis` já mostra continua aparecendo.
- [x] A O.S. principal da requisição é gravada na linha dela e o `laudo` sai pelo caminho do Álvaro, com a barreira de identidade existente intacta. Principal = a que ocupa mais páginas no PDF entre as que são do paciente; empate, a que aparece antes; com vários anexos, vale a ordem da listagem do site.
- [x] Requisição que já tem O.S. vinculada nunca é sobrescrita pelo PDF.
- [x] As O.S. de todos os PDFs da requisição formam uma lista só, sem repetição: a mesma O.S. em vários PDFs, ou em várias páginas do mesmo PDF, conta uma vez.
- [x] Requisição com mais de uma O.S. distinta — em PDFs diferentes ou no mesmo PDF: a principal vai para a linha da requisição e cada uma das demais ganha linha própria, de modo que todas chegam ao paciente.
- [x] O.S. que o paciente já tem (em linha avulsa ou em outra requisição) não é duplicada nem movida; quando está em outra requisição, a divergência é logada.
- [x] Com a flag ligada, a O.S. que o `idOsLis` aponta para uma requisição já ocupada por outra O.S. também ganha linha própria, em vez de ser ignorada.
- [x] O.S. descartada pela identidade não derruba as outras O.S. do mesmo PDF nem os outros anexos da requisição.
- [x] Qualquer falha do site ou da extração é logada e não interrompe a busca; a varredura por `idOsLis` cobre o caso.
- [x] Os downloads respeitam um limite de concorrência.
- [x] Log estruturado por busca: O.S. vinculadas pelo PDF, pelo `idOsLis`, O.S. extras gravadas em linha própria, O.S. descartadas pela identidade, divergências, requisições sem anexo, layout desconhecido.
- [x] Testes do serviço de laudos, com os dublês já usados para apLIS, Álvaro e repositório, cobrem cada item acima.
- [x] A documentação dos laudos LIS e a de arquitetura descrevem o caminho novo e a flag.

## Comments

### 25/11/2026 — ajuste após a medição do ticket 01

O ticket foi escrito supondo uma O.S. por PDF. A auditoria contra 398 requisições reais mostrou 60 de 407 PDFs com 2 ou 3 O.S. no mesmo arquivo (uma por página), e a extração (`lerLaudoExterno`) passou a devolver `os: string[]`. Mudou neste ticket:

- o escopo deixa de ser "uma O.S. por requisição (96%)": continua gravando só a primeira, mas o caso de várias O.S. é comum e precisa de teste próprio, inclusive várias O.S. num PDF só;
- a regra de qual é a "primeira" ficou explícita;
- o descarte por CPF é por PDF, não por requisição.

Não decidido aqui: se a primeira O.S. do PDF é a melhor para ocupar a linha da requisição. Nos arquivos olhados, a primeira O.S. ocupava 1 página e a última, dezenas — a ordem do arquivo não diz qual remessa tem mais exames. Enquanto o ticket 03 não entrar, o paciente dessas requisições vê só os exames da O.S. gravada.

Ainda sem explicação: 6 dos 407 PDFs saíram com CPF `indisponivel` e seriam descartados pela falha fechada. Vale olhar esses casos antes de ligar a flag.

### 25/11/2026 — implementação

Decisões do responsável pelo produto que mudaram o ticket (os critérios acima já estão reescritos):

- **A O.S. da linha da requisição é a maior do PDF** (mais páginas), não a primeira.
- **O paciente vê todos os seus exames.** As O.S. extras não ficam em log à espera do ticket 03: cada uma é gravada em linha própria e aparece como card do Álvaro. Por isso o passo lê os PDFs de todas as requisições do paciente, e não só das que estão sem O.S.

O que a implementação descobriu contra dados reais:

- **A identidade tem que ser por O.S., não por PDF.** Um PDF real anexado a uma requisição trazia três O.S.: duas com o CPF do paciente e a terceira — a maior, 16 páginas — com outro CPF. Pela regra das páginas ela seria a principal. A extração passou a devolver, para cada O.S., o CPF impresso nas páginas dela; a O.S. alheia é descartada e nem chega a ser consultada no Álvaro.

Onde está: `service.ts` (`#vincularPeloPdf`, FASE 2.2; ajuste na FASE 2.5), `vinculoPdf.ts` (fonte dos PDFs vista pelo serviço), `laudoExterno.ts` (CPF e páginas por O.S.), `index.ts` (liga a fonte quando há `APLIS_WEB_*`). Testes em `test/laudosVinculoPdf.test.ts`, com o serviço e dublês em memória. Flag `LAUDOS_OS_VIA_PDF`, desligada por padrão.

Medição com a identidade por O.S. (`--os-pdf`, 411 requisições de Medicina Laboratorial em 80 dias, 25/11/2026):

```
Resumo
  Requisições: 411 auditadas · 409 com O.S. pelo PDF · 1 com PDF sem O.S. utilizável · 1 sem anexo tipo 14 · 0 com erro
  PDFs: 422 · layout atual 422 · antigo 0 · desconhecido 0 · ilegível 0 · falha no download 0
    60 PDF(s) trazem mais de uma O.S.
  CPF por O.S. do PDF: 475 confere · 3 DIVERGE · 14 indisponível
    2 PDF(s) misturam O.S. do paciente com O.S. de outro CPF
  O.S.: 504 · 365 nas duas e iguais · 104 só no PDF · 19 só no idOsLis · 16 nas duas, requisições diferentes
    das "só no PDF", 2 têm o CPF no idOsLis: o método atual as acha, mas como card avulso, sem a requisição
    das "só no idOsLis", 0 são de requisição cujo PDF não pôde ser lido
```

- 60 requisições (15%) têm mais de uma O.S. do próprio paciente no PDF.
- As 14 O.S. `indisponivel` são O.S. cujas páginas não trazem a linha "CPF:" (o laudo foi emitido sem CPF). A falha fechada as descarta. 11 delas chegam ao paciente mesmo assim, pelo `idOsLis`; **3 não chegam por nenhum caminho**.

Pendências e limites (detalhe em `docs/LAUDOS_LIS.md`, "Vínculo da O.S. pelo PDF"):

- **Decisão em aberto:** o que fazer com a O.S. sem CPF no PDF e sem `idOsLis` (3 em 492). Hoje fica de fora, o que contraria "o paciente vê todos os exames"; mostrar exigiria outra prova de identidade (nome + nascimento impressos no laudo, por exemplo).
- **Não foi exercitado de ponta a ponta com a flag ligada** contra o banco real: os testes usam dublês, e a leitura dos PDFs foi conferida ao vivo só em modo leitura. Ligar em produção depende também do usuário dedicado (ticket 06).
- Desligar a flag não desfaz vínculos já gravados.
- Não há unicidade de paciente + O.S. no banco. Buscas simultâneas do mesmo paciente são fundidas dentro do processo; com mais de uma instância da API isso não basta.
- A O.S. que entra em linha própria pelo `idOsLis` (requisição já ocupada) tem só a barreira do payload da AOL, como qualquer O.S. vinda do `idOsLis`.

### 25/11/2026 — revisão em dois eixos e teste de nome + nascimento

Corrigido depois da revisão do commit `77ff443`:

- **Furo:** uma O.S. que o PDF atribui a outro CPF podia voltar pela varredura do `idOsLis` (linha própria ou linha da requisição), onde só resta a barreira do payload da AOL. Agora a varredura não vincula a O.S. recusada por CPF divergente. A O.S. sem CPF no laudo continua podendo chegar pelo `idOsLis`, como antes.
- A política fechada e o combinador de vereditos foram para `identidade.ts`; o limitador de concorrência, para `lib/concorrencia.ts`.

Ficou como está, por decisão consciente: a fusão de buscas simultâneas vale com a flag ligada ou desligada (o resultado para o paciente é o mesmo; evita duas varreduras e a O.S. duplicada); e `#vincularPeloPdf` continua uma função longa.

**Teste: nome + nascimento do laudo × cadastro da requisição no apLIS** (somente leitura, 411 requisições, 488 O.S.; nome comparado sem acento e caixa, igualdade exata; nascimento exato):

| CPF da O.S. | nome + nascimento conferem | nome igual, nascimento diferente | nome diferente |
|---|---|---|---|
| confere (471) | 466 | 5 | 0 |
| não impresso (14) | 13 | 1 | 0 |
| diverge (3) | 2 | 1 | 0 |

- O nome bateu nas 488 O.S. Não apareceu nenhum laudo de pessoa com outro nome, então o teste **não mede** o quanto nome + nascimento barraria um laudo alheio — só mostra que ele não barraria os do próprio paciente além de 7 casos de nascimento divergente.
- Nas 3 O.S. com CPF divergente o nome é o mesmo, e em 2 o nascimento também: tudo indica que são do próprio paciente, com outro CPF registrado naquela O.S. (inclui o caso das 16 páginas que motivou a identidade por O.S.). Hoje ficam de fora.
- Nascimento diverge em 7 de 488 O.S. com o mesmo nome: é erro de cadastro em um dos lados, e mostra que nascimento sozinho também falha.

Decisão em aberto (do responsável pelo produto): usar nome + nascimento como segunda prova quando o laudo não traz CPF (recuperaria 13 das 14) e o que fazer com as 3 de CPF divergente.

### 25/11/2026 — segunda prova de identidade implementada

Decisão do responsável pelo produto: nome + nascimento valem como segunda prova quando o laudo não traz CPF, **e as O.S. de CPF divergente aparecem se nome e nascimento conferem**.

- `laudoExterno.ts` extrai, por O.S., o nome (linha acima de "DN:") e o nascimento, com a mesma regra do CPF: as páginas da O.S. têm que concordar.
- `identidade.ts`: `conferirPessoa` (nome sem acento/caixa/pontuação, igualdade exata, mínimo de duas palavras; nascimento exato) e `identidadeDoLaudoExterno`, que junta as duas provas.
- A referência é o cadastro da própria requisição no apLIS, aceito só se o CPF dele for o do paciente do token, e consultado só quando o CPF da O.S. não resolve.
- O.S. aceita por nome + nascimento com CPF divergente gera `warn` para correção do cadastro. O resumo do log ganhou `aceitasPorNomeENascimento`.
- O script de auditoria mostra, por O.S., qual prova sustentou a identidade.

Conferido contra dados reais só em três requisições (leitura). A medição completa não foi repetida com a regra nova; pelo teste anterior, o esperado é recuperar 13 das 14 O.S. sem CPF e 2 das 3 de CPF divergente.

**Caso que continua de fora, e que hoje aparece:** na requisição do PDF de três O.S., a maior (16 páginas) tem o mesmo nome, CPF diferente e nascimento 2 anos diferente do cadastro. O `idOsLis` a aponta para a requisição, então o método atual a mostra; com a flag ligada ela é bloqueada nos dois caminhos até o cadastro ser corrigido. (Outra O.S. do mesmo PDF tem o CPF certo e o mesmo nascimento divergente — indício de cadastro duplicado do paciente no laboratório de apoio.)

### 25/11/2026 — o PDF não remove o que o `idOsLis` mostra

O responsável pelo produto conferiu a requisição 0040002557003: o cadastro do apLIS está certo, e a O.S. 392393752 (16 páginas) é do próprio paciente, registrada no laboratório de apoio com CPF e nascimento errados. Decisão: tirar o bloqueio do caminho do `idOsLis`.

- A varredura volta a vincular a O.S. que o laudo atribui a outro CPF, como faz sem a flag; a conferência dela é a do payload da AOL.
- Quando isso acontece fica um `warn` com a O.S., para a recepção corrigir o cadastro na origem.
- A conferência fechada (CPF, ou nome + nascimento) continua valendo para tudo que entra pelo PDF.

Isso reabre, conscientemente, o ponto que a revisão tinha levantado: uma O.S. alheia apontada pelo `idOsLis` depende só da AOL, que deixa passar quando não devolve CPF. É o risco que já existe hoje.

