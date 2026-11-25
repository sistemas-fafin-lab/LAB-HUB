# 03: Pedido com várias O.S. aparece como um pedido só

**What to build:** Quando os PDFs da requisição trazem mais de uma O.S. (pedido despachado ao Álvaro em mais de uma remessa — sangue no dia, urina ou fezes depois), o paciente vê um único card do pedido com os exames de todas as O.S., em vez de um card do pedido e outro órfão — ou, pior, só os exames da primeira O.S.

Não é caso raro: na medição do ticket 01, 60 de 407 PDFs (15%) traziam 2 ou 3 O.S. no mesmo arquivo, uma por página, e as 398 requisições auditadas somaram 490 O.S. As O.S. extras podem estar em PDFs diferentes ou no mesmo PDF.

Hoje a fusão de O.S. órfã só acontece quando a data de coleta coincide com a do pedido, o que não cobre remessas em datas diferentes. Com o PDF, sabe-se de qual requisição cada O.S. é — falta guardar esse elo.

**Blocked by:** 02.

**Status:** needs-triage

- [ ] A segunda O.S. (e seguintes) de uma requisição — venha de outro PDF ou do mesmo — fica gravada com o elo explícito para o pedido de origem. Três O.S. no mesmo pedido funcionam como duas.
- [ ] Requisição que já tinha uma O.S. vinculada (pelo `idOsLis` ou pelo ticket 02) também recebe as demais O.S. dos seus PDFs: o ticket 02 pula a requisição inteira quando ela já tem O.S., e é aqui que as outras entram.
- [ ] O.S. que já existe como linha avulsa do paciente (achada pelo `idOsLis` = CPF) ganha o elo em vez de virar linha duplicada.
- [ ] Ao servir, as O.S. com elo para o mesmo pedido saem fundidas num card só, na cache normal, na busca ao vivo e na consulta administrativa.
- [ ] A fusão por data de coleta continua valendo para O.S. sem elo.
- [ ] Linhas já gravadas antes da mudança continuam sendo lidas sem migração de dados manual.
- [ ] A barreira de identidade roda para cada O.S. separadamente; uma O.S. reprovada não derruba as outras do pedido.
- [ ] Testes cobrem: duas O.S. em datas diferentes fundidas pelo elo; três O.S. vindas de um PDF só; requisição já vinculada pelo `idOsLis` recebendo as O.S. restantes; O.S. avulsa (por CPF) recebendo o elo; O.S. sem elo fundida por data; O.S. reprovada na identidade.

## Decisão em aberto

A cache guarda uma linha por O.S. e o código da requisição é único global, então a segunda O.S. não cabe na linha da requisição. Duas saídas, ambas com migration:

1. Coluna nova na linha da O.S. apontando para o pedido de origem — não mexe na unicidade existente (recomendada).
2. Trocar a unicidade do código da requisição pelo par requisição + O.S. — muda uma regra da qual a detecção de "código já pertence a outro paciente" depende.

## Comments

### 25/11/2026 — ajuste após a medição do ticket 01

O ticket tratava várias O.S. como caso de dois anexos (1 em 75 na amostra da spec). A auditoria mostrou que o caso comum é um PDF só com 2 ou 3 O.S., em 15% dos PDFs. Consequências:

- deixa de ser acabamento: sem este ticket, uma parte relevante dos pacientes vê o pedido incompleto mesmo com a flag do ticket 02 ligada. Vale rever a prioridade na triagem;
- entraram dois casos que o texto original não cobria: a requisição que já tem uma O.S. (o ticket 02 a pula) e a O.S. que já existe como linha avulsa;
- a decisão em aberto sobre o formato do elo continua igual; o volume reforça a opção 1 (coluna nova), que não toca a unicidade de `codigo_lis`.
