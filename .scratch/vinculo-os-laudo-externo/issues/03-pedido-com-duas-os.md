# 03: Pedido com duas O.S. aparece como um pedido só

**What to build:** Quando a requisição tem PDFs de O.S. diferentes (pedido despachado ao Álvaro em mais de uma remessa — sangue no dia, urina ou fezes depois), o paciente vê um único card do pedido com os exames de todas as O.S., em vez de um card do pedido e outro órfão.

Hoje a fusão de O.S. órfã só acontece quando a data de coleta coincide com a do pedido, o que não cobre remessas em datas diferentes. Com o PDF, sabe-se de qual requisição cada O.S. é — falta guardar esse elo.

**Blocked by:** 02.

**Status:** needs-triage

- [ ] A segunda O.S. (e seguintes) de uma requisição fica gravada com o elo explícito para o pedido de origem.
- [ ] Ao servir, as O.S. com elo para o mesmo pedido saem fundidas num card só, na cache normal, na busca ao vivo e na consulta administrativa.
- [ ] A fusão por data de coleta continua valendo para O.S. sem elo.
- [ ] Linhas já gravadas antes da mudança continuam sendo lidas sem migração de dados manual.
- [ ] A barreira de identidade roda para cada O.S. separadamente; uma O.S. reprovada não derruba as outras do pedido.
- [ ] Testes cobrem: duas O.S. em datas diferentes fundidas pelo elo; O.S. sem elo fundida por data; O.S. reprovada na identidade.

## Decisão em aberto

A cache guarda uma linha por O.S. e o código da requisição é único global, então a segunda O.S. não cabe na linha da requisição. Duas saídas, ambas com migration:

1. Coluna nova na linha da O.S. apontando para o pedido de origem — não mexe na unicidade existente (recomendada).
2. Trocar a unicidade do código da requisição pelo par requisição + O.S. — muda uma regra da qual a detecção de "código já pertence a outro paciente" depende.

## Comments
