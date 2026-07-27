# Laudos vindos dos LIS (ApLIS / AOL)

Como o LAB-HUB busca laudos direto nos sistemas do laboratório, ao lado do canal
já existente com o FlowLab.

O pipeline foi portado do projeto do Vini (`LAB_HUB_VINI`). A referência do fluxo
externo — formato do XML da AOL, envelope do ApLIS, exemplos de payload — está em
`LAB_HUB_VINI/apps/api/docs/Arquitetura_Software.md` e continua válida. Este
documento cobre só o que é específico daqui.

## Duas fontes, sem intersecção

| | FlowLab | LIS (ApLIS / AOL) |
|---|---|---|
| Direção | O FlowLab **empurra** (`POST /webhooks/resultados`) | A API **busca** |
| Tabela | `resultados` | `exam_results` |
| Tipo | `Resultado` | `Laudo` |
| Rota | `GET /api/v1/resultados` | `GET /api/v1/laudos` |
| Tem PDF? | Sim (`declaracaoUrl`) | Não |
| Tem material/método/CRM? | Não | Sim |

As duas não se falam. Quem as une é o front, em
`apps/web/src/lib/useResultados.ts`: ele busca as duas em paralelo, mapeia cada
uma para o mesmo tipo `Exam` e ordena por data. Uma fonte fora do ar não derruba
a outra — a tela mostra o que chegou.

## Fluxo de uma busca

```
GET /api/v1/laudos            (authenticate → pacienteId → cpf)
  │
  ├─ cache fresco?  → devolve na hora, sem tocar nos LIS          source: cached
  ├─ cache vencido? → devolve o velho + revalida em background    source: cached
  └─ sem cache      → busca ao vivo (o paciente espera)           source: live
                        │
                        ├─ FASE 1  ApLIS requisicaoListar  → quais requisições existem
                        ├─ FASE 2  insertAwaiting          → registra as novas como pendentes
                        └─ FASE 3  por linha:
                             ├─ sem codigo_os → ApLIS requisicaoResultado → mapAplisResult
                             └─ com codigo_os → AOL fetchExam (+ApLIS) → estratégia do tipo
                                  └─ mudou? saveResult : renewCachedAt
```

O `?refresh=true` pula o cache e espera o dado fresco.

## Estrutura

```
apps/api/src/laudos/
  aplis.ts              cliente ApLIS (POST JSON, comando no corpo)
  aol.ts                cliente AOL (PUT XML, fast-xml-parser)
  service.ts            orquestração SWR + deep-equality
  repository.ts         acesso a exam_results, escopado por paciente_id
  mappers.ts            mapExamResult (AOL+ApLIS) e mapAplisResult (só ApLIS)
  registry.ts           código/nome do exame → estratégia
  mapperHelpers.ts      datas, material, faixa de referência
  strategies/           AnalisesClinicas (quantitativo), LaudoTexto (citologia/
                        biópsia), Generic (fallback)
  errors.ts             ValidationError / IntegrationError / DatabaseError
apps/api/src/routes/laudos.ts
```

## O que mudou em relação ao original

Não é uma cópia. As diferenças que importam:

1. **Autenticação.** As rotas originais recebiam o CPF por query string, sem
   token. Aqui o CPF sai sempre de `request.pacienteId` (middleware
   `authenticate`), e o `GET /laudos/:id` filtra por `paciente_id` — no original
   qualquer UUID devolvia o laudo de qualquer pessoa.
2. **Chave de dados.** `exam_results` é chaveada por `paciente_id` (FK para
   `pacientes`), não por CPF solto. O CPF fica na linha só para consultar os LIS.
3. **Gravação por `id`.** O original fazia upsert com `onConflict: 'codigo_lis'`;
   linhas só-AOL têm `codigo_lis` null e no Postgres NULL nunca casa conflito, o
   que inseria uma linha nova a cada revalidação. O `saveResult` atualiza por `id`.
4. **`cached_at` chega junto do laudo.** É coluna, não campo do JSON; o
   repositório injeta ao ler. Sem isso o TTL nunca era considerado válido e toda
   requisição revalidava.
5. **Falha total vira 502.** Se o ApLIS cai e não há nada em cache, a API
   responde 502 em vez de uma lista vazia — dizer "você não tem exames" quando
   não foi possível perguntar é pior que dizer que falhou.
6. **HTTP nativo.** `fetch` + `AbortSignal.timeout`, como em `lib/flowlab.ts`, no
   lugar do axios. Só `fast-xml-parser` entrou como dependência nova.
7. **Citologia e biópsia num arquivo só.** Eram dois arquivos com o mesmo corpo;
   viraram uma fábrica em `strategies/LaudoTextoStrategy.ts`.

Ficaram de fora, por serem código morto no projeto de origem: `exams.mapper.ts`,
`exams.service.ts`, `PatientRepository` e `patients.controller` (o LAB-HUB já tem
cadastro próprio).

## Custo da varredura

O comando `requisicaoListar` do ApLIS **não aceita filtro por CPF**: ele devolve
todas as requisições do período (`APLIS_PERIODO_DIAS`, padrão 45), paginadas, e o
filtro por paciente acontece no cliente. Uma janela grande vira dezenas de
páginas por refresh, e dados de outros pacientes passam pela memória do processo.

Por isso `GET /laudos?refresh=true` tem rate limit apertado (5/min), enquanto a
leitura normal fica em 60/min — três telas montam o hook `useResultados`, então
uma navegação comum já faz várias chamadas por minuto.

Se o volume incomodar, o passo seguinte é uma varredura compartilhada — uma
listagem alimenta todos os pacientes — e não aumentar a concorrência por paciente.

## Quem manda em cada campo

A **AOL é a fonte precisa** dos resultados; o **ApLIS complementa**. Verificado
contra as duas APIs de produção em 21/07/2026 (ver "O que a API real mostrou").

| Campo | Fonte | Porquê |
|---|---|---|
| valor, unidade, nome do analito | AOL | é a única que devolve resultado de análise clínica |
| material, método, responsável técnico/CRM | AOL | vêm no XML de resultados |
| convênio, matrícula, médico solicitante, local de origem | ApLIS | a AOL não tem |
| faixa de referência | AOL (`?referenciaResultado=true`, desde 22/07/2026) | ver abaixo |

O merge é campo a campo (`AnalisesClinicasStrategy`): as linhas saem da AOL e a
referência do ApLIS só entra onde o nome do analito casar — normalizado sem
acento, caixa baixa e cortando o método que a AOL anexa
(`"DHT - Ensaio Imunoenzimático"` → `dht`). Analito que só existe no ApLIS **não**
é acrescentado à lista.

Esse merge está correto na forma, mas hoje é inócuo: o ApLIS não devolve analito
nenhum para análises clínicas (provado abaixo), então nenhuma referência entra
por ele.

## Faixas de referência (desde 22/07/2026)

O PUT de resultados passou a pedir `?referenciaResultado=true`: o XML vem com
**um** `<valorreferencia>` (CDATA de texto livre) por exame do cadastro,
cobrindo todas as linhas dele. O pipeline faz três coisas com esse texto:

1. **Reparte por analito** (`distribuiReferencias`, aol.ts): blocos separados
   por linha em branco, cada um rotulado com a descrição da linha ("Creatinina:
   …"). Bloco sem rótulo continua o anterior; exame de uma linha sem rótulo
   recebe o texto inteiro; multi-analito sem rótulo nenhum é descartado — é o
   caso do HEMOGRAMA, cujo texto é uma tabela gigante sem rótulos, inutilizável
   (os marcadores do hemograma seguem sem referência).
2. **Reduz à linha do paciente** (`simplificaReferencia`, mapperHelpers.ts):
   as referências estratificadas por idade/sexo ("19 anos e acima → Masculino
   0,70 a 1,30 mg/dL") viram a faixa do paciente, usando `data_nascimento` e
   `sexo` de `pacientes` (threading: rota → service → estratégia). REGRA DE
   OURO: só simplifica quando entende o texto INTEIRO — qualquer linha estranha
   devolve o texto completo, nunca uma faixa possivelmente errada (ex.: o TSH
   termina numa seção "Gestantes*" que não sabemos aplicar → sai a tabela
   inteira).
3. **Avalia `ok` com cuidado** (`isOutOfRange`): ganhou os formatos por extenso
   da AOL ("70 a 99", "Inferior [ou igual] [a] X", "Superior a X") e uma guarda
   dura: referência multilinha NUNCA é avaliada — sem ela, "0 - 2 anos" no
   início da tabela casava como faixa e o colesterol de um adulto saía marcado
   como ATENÇÃO.

Na OS de teste (36 exames): 48 de 75 marcadores com referência, 26 já reduzidos
a uma linha, e os fora-da-faixa reais detectados (B12 alta, ferritina e insulina
baixas, prolactina alta).

Pendências: o badge de marcador SEM referência ainda mostra "Normal" (`ok: true`
por construção; corrigir exige `ok: boolean | null` + estado neutro na UI), e a
referência multilinha não avaliada também fica "Normal" — o texto ao lado ao
menos deixa o leitor conferir.

## O que a API real mostrou (21/07/2026)

Sondagem read-only contra as duas APIs de produção, com as credenciais do `.env`.

**AOL — funciona e é a fonte dos resultados.** `GET /producao/teste` → `OK v2026.2.5`.
O `PUT /v2/resultados` por OS devolve valor, unidade, material, método e
responsável técnico (nome + CRM) de cada exame. É o dado preciso.

**AOL tem listagem por período, e temos acesso.**
`GET /v1/orders/status/{idEntidade}?dataInicial&dataFinal` → 200, paginado por
`nextCursor`, com `countStatus` e a lista em `data`. Cada registro traz `orderId`
(a OS), `patientName`, `samples[].material` e `exams[]` com trilha de eventos
(`CADASTRADO` → `AMOSTRA_OBTIDA` → `EM_TRANSITO` → `TRIAGEM` → `EM_EXECUCAO` →
`FINALIZADO`). **O campo `idOsLis` carrega o CPF do paciente**, formatado — foi
assim que localizamos um paciente de teste varrendo as páginas.

Isso resolve o ponto de entrada que faltava: dá para descobrir as OS de um
paciente pelo CPF sem depender do ApLIS.

`GET /v3/resultados/lote/...` devolveu `500 Unparseable date` com `YYYY-MM-DD` —
o formato aceito ainda é desconhecido.

**Mas a listagem NÃO filtra por paciente.** `?cpf=` e `?patient=` são ignorados
(resposta idêntica byte a byte) e `/v1/patients/{cpf}/orders` dá 404. Achar um
paciente exige varrer as páginas e comparar `idOsLis` no cliente — o mesmo custo
que criticamos no ApLIS. A diferença é que aqui a varredura é **por entidade**,
não por paciente: uma passagem indexa todos de uma vez, o que só faz sentido como
job de fundo, nunca dentro do request de um paciente.

**`AOL_CHAVE` não tem uso comprovado.** O `scripts/debug-aol.ts` do projeto de
origem a usa num envelope SOAP `BuscarLaudosPorCPF` — que responde **404**: o
método não existe. Aquele script é da fase em que se supunha que a AOL fosse SOAP
(a parte ApLIS dele ainda usa `GET` com query params, corrigido depois para
`POST`). Também testamos a chave como senha Basic alternativa (401) e como header
`chave`/`x-chave`/`apikey`/`x-api-key` — os 200 vieram da Basic auth enviada
junto, com resposta de tamanho idêntico, ou seja, o header é ignorado. Manter a
variável no `.env` sem saber a que serve só confunde: ou o laboratório esclarece,
ou ela sai.

**Reauditada em 27/07/2026 — segue no `.env`, sem uso.** Varredura das envs
confirmou que nenhum código do LAB-HUB referencia `AOL_CHAVE`: o caminho AOL
autentica só por Basic (`AOL_IDAGENTE` + `AOL_SENHA`). Mantida por decisão, para
não perder o valor enquanto o laboratório não esclarece a que serve — ela é
inerte, então não muda comportamento nenhum. Quem for mexer aqui: não é ponta
solta esquecida, é espera deliberada.

**ApLIS — 401.** `{"cmd":"login","msgErro":"Usuário e/ou senha incorreto(s)"}`.
As credenciais do `.env` não são placeholders, então ou são de outra instância
(a doc oficial cita `demo.aplis.inf.br`; o `.env` aponta `lab.aplis.inf.br`) ou
venceram. **A ponta ApLIS está sem validação real.**

**O ApLIS não devolveria os resultados de qualquer forma.** No
`docs/samples/aplis_sample.txt` — resposta real de `requisicaoResultado` para
`"nomExame": "MEDICINA LABORATORIAL"` — vem `"procedimentos": null`, e as
palavras `resultado`, `unidade`, `valor_referencia`, `laudoMicro` e `laudoMacro`
aparecem **zero vezes** no JSON inteiro. O que vem é `procedimentosCobrados`:
49 itens de faturamento (código TUSS, valor, guia, senha da operadora).

A doc explica: `requisicaoResultado` foi desenhado para **patologia** (topografias,
cassetes, imuno, colorações, patologista). Para análise clínica devolve só a capa
da requisição.

**Consequência:** para exame laboratorial, o caminho só-ApLIS produz `panels: []`
e `status: 'pending'`. Sem a AOL, a tela não mostra resultado de análise clínica.

**Mas para patologia e biologia molecular o laudo VEM completo (lido desde
22/07/2026).** Verificado com dados reais: são dois formatos além dos
`procedimentos`, e o parser (`aplis.ts`) entende os três:

- **`dat.exames[]`** — biologia molecular (PCR): um painel por exame
  ("GENOTIPAGEM HPV 28 TIPOS", "PAINEL DE IST I"…), cada um com
  `resultados[].{tituloResultado, desConclusao}` (Positivo/Negativo já
  interpretado — o `resultado` numérico é o Ct da reação e não é exibido),
  `metodo`, `referencias` do painel e `assinatura1/2`. No Laudo: um GRUPO por
  painel, alvo Positivo ≠ referência NEGATIVO sai como "Atenção".
- **`dat.procedimentos[].topografias[]`** — patologia/citologia
  (colpocitologia): `laudoMacro` + `diagnosticos[].laudoMicro` (HTML → texto
  via `stripHtml`), assinado por `patologista1`. No Laudo: um marcador único
  "Laudo" com o texto inteiro (a convenção das estratégias de laudo em texto da
  AOL); a tela renderiza como bloco de texto, não tabela, e o resumo do card é
  a seção CONCLUSÃO.

O responsável (`patologista1` ?? primeiro assinante) preenche `doctor`/`crm` —
o único caminho ApLIS que informa quem assinou.

**O `requisicaoListar` aceita filtro por paciente.** Campo `nomPaciente` ("Nome ou
CPF do paciente") no perfil interno, `pesquisa` no externo — documentado, e no
changelog desde 12/09/2023. Já enviamos, com o filtro local mantido como rede de
segurança. Isso elimina a varredura de todas as páginas do período.

## O Supabase do projeto de origem

O projeto do Vini usa um Supabase próprio (`qmeomspbnyiwskanrbrg`, citado em
`LAB_HUB_VINI/apps/api/supabase/migrations/001_initial_schema.sql` e no
`openspec/changes/archive/2026-05-20-lab-exam-history-backend/proposal.md`).

Esse banco é **cache, não fonte**: os valores vêm do ApLIS/AOL e o Supabase só
guarda o laudo já normalizado em `exam_results.result`. É o mesmo papel que a
tabela `exam_results` cumpre aqui — por isso o port não lê nada de lá; o LAB-HUB
reconstrói o próprio cache na primeira consulta.

**Não importar dados daquele banco.** Boa parte das linhas de lá é semente de
demonstração, não dado de laboratório:

- `scripts/seed-antoniel.ts` grava painéis fixos no código (Hemoglobina 14,5;
  Colesterol LDL 142) para um paciente fictício — CPF `00000000001`, nascimento
  `1900-01-01`.
- `scripts/seed-adrielly.ts` carrega 21 exames de `docs/samples/Estrutura_LabHub.json`
  e inventa o `codigo_os` a partir do id do exame (`44138707` + sufixo).

## Pendência conhecida: o caminho AOL

O caminho AOL só roda em linhas que já tenham `codigo_os`, e **nada no fluxo
preenche esse campo** — a FASE 2 sempre insere com `codigo_os = null`.

A tabela ponte que existiria para isso, `exam_links` (`codigo_os` ↔ `codigo_lis`),
está na migration do projeto dele mas **é escrita apenas pelos scripts de seed**:
nenhum código de produção a lê ou grava. Ou seja, as únicas linhas com OS naquele
banco foram semeadas à mão. Ela não existe no LAB-HUB e o port não a criou.

`exam_links` é resquício da arquitetura original, **AOL-primeiro**: no primeiro
change (`archive/2026-05-20-lab-exam-history-backend`) o fluxo partia da OS da AOL
e consultava a ponte para achar o `codigo_lis` correspondente. Quem populava a
ponte nunca foi definido — o próprio design registra a pergunta em aberto:
*"Frequência de atualização do `exam_links`: qual sistema popula essa tabela? É
manual, via outro serviço ou via job?"*.

Nove dias depois, o change `archive/2026-05-29-aplis-only-exam-flow` inverteu o
fluxo: o ponto de entrada passou a ser a requisição do ApLIS. Com a inversão a
ponte perdeu a função, e o mesmo change lista como *Non-Goal* o "suporte a exames
que existam apenas na AOL sem `codigo_lis`". A tabela ficou órfã, sem produtor.

O atributo `codigo_lis` da `<solicitacao>` parecia resolver a ponte, mas **não é
confiável**: o preenchimento varia por origem.

```xml
<!-- aol_sample.txt: aqui é o código da requisição no ApLIS -->
<solicitacao codigo="379512739" codigo_lis="0040001797004" paciente="441722265">
<!-- OS real consultada em 21/07/2026: aqui é o CPF -->
<solicitacao codigo="379779766" codigo_lis="179.532.547-00" paciente="442086219">
```

Confirmado: os 4 códigos de requisição que o ApLIS devolve para o paciente de
teste **não aparecem** no XML da OS dele. Não há link OS↔requisição utilizável no
payload — o que explica por que a ponte foi imaginada e por que ninguém nunca a
preencheu.

A saída é não precisar do link: indo pela AOL, o CPF vem no `idOsLis` do
`orders/status` (e no `<paciente codigo_lis>` do XML), o que basta para achar as
OS do paciente sem passar pelo ApLIS.

**Onde o `<paciente>` fica (confirmado em 27/07/2026, OS 379779766 de produção).**
Ele não é filho da `<solicitacao>`: é um CADASTRO, como materiais e exames, e a
solicitação só o referencia pelo atributo `paciente`.

```xml
<resultados>
  <cadastros>
    <pacientes>
      <paciente codigo="442086219" codigo_lis="179.532.547-00" datanasc="…" nome="…" sexo="F"/>
    </pacientes>
  </cadastros>
  <solicitacao codigo="379779766" paciente="442086219" dataColeta="2026-05-20 08:20:00">
```

É esse `codigo_lis` do cadastro — não o da `<solicitacao>` — que a barreira de
identidade usa para conferir de quem é a OS (`buildPacienteMap` em `aol.ts`,
política em `laudos/identidade.ts`). Auditoria de 27/07/2026 sobre as linhas
gravadas: 5/5 conferindo, nenhuma divergência e nenhuma sem identidade.

É o que o serviço faz desde 22/07/2026: na busca ao vivo, além do
`requisicaoListar` do ApLIS, o `AolService.listOrdersByCpf` varre o
`orders/status` do período casando o CPF com o `idOsLis` e registra cada OS
encontrada como linha própria (`codigo_os` preenchido, `codigo_lis` nulo). Essas
linhas seguem pelo caminho AOL (`PUT /v2/resultados`) e saem com os valores
reais — material, método, responsável técnico e CRM.

A granularidade é **um laudo por PEDIDO** (`consolidaLaudosDaOs`, desde
22/07/2026): a linha de `exam_results` é uma por OS — o `PUT /v2/resultados`
devolve a OS inteira, é a unidade natural do cache — e o `result` guarda uma
lista com um elemento, o pedido compilado. Cada exame da OS resolve a própria
estratégia pelo seu código de tipo e entra no laudo como um **grupo** (seção)
com nome próprio; as séries do HEMOGRAMA entram prefixadas ("HEMOGRAMA — Série
Branca"). Isso corrige o defeito do consolidado original, que concatenava os
analitos de todos os exames sob o nome do primeiro ("ANTI - TIREOGLOBULINA" com
75 marcadores soltos): a OS de teste sai como UM card com 36 seções nomeadas.
Médico, material e método só aparecem no cabeçalho do pedido quando são
unânimes entre os exames. O `result` continua sendo lista para reabrir outras
granularidades sem migração, e `GET /laudos/:id` devolve a lista da linha.

Duas ressalvas da fatia de teste:

1. **Custo** — a listagem da AOL não filtra por paciente; a varredura pagina
   TODAS as OS da entidade no período, a cada busca ao vivo (~47 s com janela de
   90 dias). Antes de produção isso vira job de fundo alimentando um índice
   OS↔CPF compartilhado; a request do paciente passa a ler só o índice.
2. **Link OS↔requisição (resolvido em 22/07/2026 para a maioria)** — medição em
   528 OS / 90 dias: o `idOsLis` do `orders/status` é digitado à mão pela
   recepção e traz o codRequisicao do ApLIS em ~65% dos casos (mais os
   recuperáveis por normalização: letra "O" no lugar do zero), CPF ou vazio no
   resto. O serviço normaliza (`normalizaIdOsLis`) e casa nas duas direções:
   codRequisicao → `codigo_os` gravado NA MESMA linha da requisição (laudo
   fundido AOL+ApLIS, sem card duplicado — foi assim que duas OS invisíveis à
   busca por CPF apareceram); CPF → linha só-AOL.

   **Fusão por data de coleta (22/07/2026)** — o resto do buraco: um pedido
   despachado em duas remessas (sangue no dia da coleta, fezes/urina quando o
   paciente entrega) vira DUAS OS no Álvaro, e quando só uma recebe o
   codRequisicao a outra virava card órfão ("Exames Laboratoriais"). Caso real:
   requisição `0040001821006` (dtaColeta 20/05) = OS 380205029
   (fezes/urina, idOsLis certo) + OS 379779766 (sangue, idOsLis = CPF). O elo é
   a data: a dtaColeta da requisição é a da coleta original, a mesma que a AOL
   registra na OS de sangue. `fundirPedidosPorColeta` (mappers.ts) funde, na
   hora de SERVIR, a órfã cuja `data_coleta` bate com o `data_coleta_pedido` de
   exatamente UM pedido — zero ou dois candidatos mantém o card separado
   (duplicar na tela é melhor que fundir no pedido errado). As linhas do banco
   não mudam (uma por OS); o card fundido lista as OS em `codigo_os` separadas
   por vírgula. Duplicata visual só resta no caso ambíguo (duas requisições na
   mesma data) ou quando o cache ainda não tem a chave (regrava na primeira
   revalidação). O conserto definitivo segue operacional: recepção preenchendo
   `idOsLis` (e o `NumExterno` do ApLIS, hoje vazio) com o código — pedir ao
   laboratório.

## Configuração

Variáveis em `apps/api/.env` — ver `.env.example` para a lista comentada:
`APLIS_BASE_URL`, `APLIS_USUARIO`, `APLIS_SENHA`, `APLIS_PERIODO_DIAS`,
`AOL_BASE_URL`, `AOL_IDAGENTE`, `AOL_SENHA`, `AOL_ENTIDADE`,
`EXAM_CACHE_TTL_HOURS`.

Migration: `supabase/migrations/20260721120000_exam_results_lis.sql`.
